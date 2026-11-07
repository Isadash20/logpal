-- LogPal, Supabase schema
--
-- Run this once in the Supabase SQL editor against a fresh project.
-- Safe to re-run: every statement is idempotent.
--
-- Every table carries `user_id uuid not null default auth.uid()` and has row
-- level security switched on, so a query can only ever see the signed-in user's
-- own rows. The client never sends `user_id`. The default fills it in, and the
-- policy's `with check` makes it impossible to write anyone else's.
--
-- Primary keys are composite on (user_id, ...) rather than on the id alone.
-- The app generates its own ids client-side, so two accounts can legitimately
-- hold the same id, and the composite key is also exactly what an upsert needs
-- to conflict on.

-- ---------------------------------------------------------------- profile --

-- One row per user. Profile, settings and fasting preferences are singleton
-- config objects with a few dozen fields between them; splitting them into
-- columns would mean a migration every time a preference is added, and nothing
-- queries them by field. They are stored whole.
create table if not exists logpal_profile (
  user_id           uuid primary key default auth.uid() references auth.users on delete cascade,
  profile           jsonb not null default '{}'::jsonb,
  settings          jsonb not null default '{}'::jsonb,
  fasting           jsonb not null default '{}'::jsonb,
  favorite_food_ids jsonb not null default '[]'::jsonb,
  recent_food_ids   jsonb not null default '[]'::jsonb,
  updated_at        timestamptz not null default now()
);

-- ------------------------------------------------------------ diary: food --

-- The highest-volume table, and the only one queried by date, so this one gets
-- real columns. Nutrition is denormalised onto the row on purpose: it is
-- recorded as logged, so editing or deleting a food never rewrites history.
create table if not exists logpal_food_entries (
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  id            text not null,
  date          date not null,
  meal          text not null,
  food_id       text not null,
  name          text not null,
  brand         text,
  serving_label text not null,
  servings      double precision not null,
  nutrients     jsonb not null,
  source        text not null,
  logged_at     bigint not null,
  primary key (user_id, id)
);

create index if not exists logpal_food_entries_by_date
  on logpal_food_entries (user_id, date);

-- -------------------------------------------------------- diary: exercise --

create table if not exists logpal_exercise_entries (
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  id              text not null,
  date            date not null,
  kind            text not null,
  name            text not null,
  exercise_id     text,
  minutes         double precision,
  calories_burned double precision,
  sets            integer,
  reps            integer,
  weight          double precision,
  logged_at       bigint not null,
  primary key (user_id, id)
);

create index if not exists logpal_exercise_entries_by_date
  on logpal_exercise_entries (user_id, date);

-- ------------------------------------------------------------ day, weight --

-- Water and the "day complete" flag. One row per logged day.
create table if not exists logpal_days (
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  date      date not null,
  water     double precision not null default 0,
  completed boolean not null default false,
  -- Nullable on purpose: nothing measures sleep or steps for you, so a day with
  -- no figure is "not recorded" rather than a night with no sleep at all.
  sleep_min integer,
  steps     integer,
  primary key (user_id, date)
);

-- Added after the table shipped; safe to re-run.
alter table logpal_days add column if not exists sleep_min integer;
alter table logpal_days add column if not exists steps integer;

-- At most one weigh-in per day, which is why the date is the key.
create table if not exists logpal_weights (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date    date not null,
  weight  double precision not null,
  primary key (user_id, date)
);

-- Body measurements: one value per (day, site).
create table if not exists logpal_measurements (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date    date not null,
  key     text not null,
  value   double precision not null,
  primary key (user_id, date, key)
);

-- ------------------------------------------------------------------ fasts --

create table if not exists logpal_fasts (
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  id           text not null,
  started_at   bigint not null,
  ended_at     bigint,
  target_hours double precision not null,
  protocol     text not null,
  primary key (user_id, id)
);

-- ---------------------------------------------------- user food libraries --

-- Custom foods, saved meals and recipes are deeply nested (a recipe holds a
-- list of items, each with a full nutrient panel). Nothing queries inside them,
-- so they are stored as documents rather than spread across join tables.
create table if not exists logpal_custom_foods (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id      text not null,
  food    jsonb not null,
  primary key (user_id, id)
);

create table if not exists logpal_meals (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id      text not null,
  meal    jsonb not null,
  primary key (user_id, id)
);

create table if not exists logpal_recipes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id      text not null,
  recipe  jsonb not null,
  primary key (user_id, id)
);

-- Products resolved from a barcode scan or a network search. Kept server-side
-- so a food logged on the phone still resolves its name and nutrition on the
-- laptop; without it, history logged on another device shows up blank.
create table if not exists logpal_saved_foods (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id      text not null,
  barcode text,
  food    jsonb not null,
  primary key (user_id, id)
);

-- ---------------------------------------------------- row level security --

do $$
declare
  t text;
begin
  foreach t in array array[
    'logpal_profile',
    'logpal_food_entries',
    'logpal_exercise_entries',
    'logpal_days',
    'logpal_weights',
    'logpal_measurements',
    'logpal_fasts',
    'logpal_custom_foods',
    'logpal_meals',
    'logpal_recipes',
    'logpal_saved_foods'
  ]
  loop
    execute format('alter table %I enable row level security', t);

    -- Dropped and recreated so re-running this file cannot leave a stale
    -- policy behind with different rules.
    execute format('drop policy if exists own_rows on %I', t);
    execute format(
      'create policy own_rows on %I for all
         using (auth.uid() = user_id)
         with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

-- ------------------------------------------------------------- usernames --

-- Usernames are a second identity alongside the email address: unique, chosen
-- at sign-up, and the handle other people will eventually search for.
--
-- Kept in their own table rather than as a column on logpal_profile because
-- this one is deliberately world-readable. Uniqueness has to be enforceable
-- across accounts, and a friend search has to be able to see other people's
-- handles, neither works under a policy that hides every row but your own.
--
-- Note what is NOT here: no email, no display name, nothing but the handle and
-- the id it belongs to.
create table if not exists logpal_usernames (
  username   text primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  -- One handle per account.
  unique (user_id)
);

alter table logpal_usernames enable row level security;

-- Anyone may look a handle up; only its owner may create or change it.
drop policy if exists usernames_readable on logpal_usernames;
create policy usernames_readable on logpal_usernames for select using (true);

drop policy if exists usernames_own_write on logpal_usernames;
create policy usernames_own_write on logpal_usernames for insert
  with check (auth.uid() = user_id);

drop policy if exists usernames_own_update on logpal_usernames;
create policy usernames_own_update on logpal_usernames for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Case-insensitive uniqueness: "Phillip" and "phillip" are the same handle.
create unique index if not exists logpal_usernames_lower
  on logpal_usernames (lower(username));

/*
 * Resolves a handle to the address its account signs in with.
 *
 * Signing in by username needs this because Supabase authenticates on email,
 * the client has to turn one into the other before it can call
 * signInWithPassword.
 *
 * SECURITY DEFINER, so it can read auth.users, which is otherwise unreachable
 * from the client. It returns exactly one column for exactly one row and takes
 * no other input, so it cannot be used to enumerate the table.
 *
 * The trade-off is real and worth stating plainly: anyone who knows a handle
 * can learn the address behind it. That is the cost of username sign-in
 * without a server, and it is why the function exposes nothing else.
 */
create or replace function email_for_username(handle text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email
  from logpal_usernames n
  join auth.users u on u.id = n.user_id
  where lower(n.username) = lower(trim(handle))
  limit 1
$$;

revoke all on function email_for_username(text) from public;
grant execute on function email_for_username(text) to anon, authenticated;

-- ----------------------------------------------------------------- social --

/*
 * Following, and the small amount each account chooses to publish.
 *
 * Two tables and one hard rule: *nothing readable here was put there by
 * anything but its own owner's client, and only after that owner switched the
 * corresponding sharing toggle on.* The diary, weight, measurements and goals
 * stay where they are, behind `own_rows`. Nothing below can reach them.
 *
 * That is why this is a published summary rather than a policy that opens up
 * logpal_profile to followers. A policy has to be right forever; a column that
 * was never written cannot leak whatever a future policy gets wrong.
 */

-- What an account publishes. One row per user, and only for users who share
-- something. The client deletes the row when every toggle is turned off,
-- which is the only honest implementation of "share nothing".
--
-- Every column but `private` is nullable and null means *not shared*. The
-- client filters before writing, so a value the owner has not agreed to share
-- is never in the table to begin with.
create table if not exists logpal_social_profile (
  user_id      uuid primary key default auth.uid() references auth.users on delete cascade,
  -- The owner's call, and the only field here the server itself reads: it
  -- decides whether a new follow is accepted immediately or held for approval.
  private      boolean not null default false,
  display_name text,
  streak       integer,
  last_logged  date,
  calories     integer,
  calorie_goal integer,
  updated_at   timestamptz not null default now()
);

-- Directed edges: `follower` follows `followee`. Asymmetric on purpose. This
-- is following, not mutual friendship, so the pair is ordered and both
-- directions can exist independently.
create table if not exists logpal_follows (
  follower   uuid not null default auth.uid() references auth.users on delete cascade,
  followee   uuid not null references auth.users on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  constraint logpal_follows_not_self check (follower <> followee)
);

-- Requests are listed by the person receiving them, so that is the direction
-- the index covers.
create index if not exists logpal_follows_by_followee
  on logpal_follows (followee, status);

alter table logpal_social_profile enable row level security;
alter table logpal_follows enable row level security;

/*
 * Whether a follow needs approval is the *target's* decision, so the server
 * makes it. Left to the client, anyone could insert their own row with
 * status 'accepted' against a private account and read it by simply asking.
 *
 * An account with no row here has not opted into any of this and has nothing
 * published, so there is nothing for approval to protect. The follow is
 * accepted and sees an empty profile.
 */
create or replace function logpal_follow_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := case
    when coalesce(
      (select p.private from logpal_social_profile p where p.user_id = new.followee),
      false
    )
    then 'pending'
    else 'accepted'
  end;
  return new;
end
$$;

drop trigger if exists logpal_follows_set_status on logpal_follows;
create trigger logpal_follows_set_status
  before insert on logpal_follows
  for each row execute function logpal_follow_status();

/*
 * Accepting is the only thing an update may do.
 *
 * The update policy below has to let the followee write the row. That is what
 * accepting a request is, and a policy cannot see the row's previous values,
 * so on its own it would also let them move `follower` to an arbitrary account
 * and forge "this person follows me". Nobody gains access that way, but the
 * forged account would find a follow it never made sitting in its own list.
 * Freezing the pair here is what a `with check` cannot express.
 */
create or replace function logpal_follows_freeze_pair()
returns trigger
language plpgsql
as $$
begin
  new.follower := old.follower;
  new.followee := old.followee;
  new.created_at := old.created_at;
  return new;
end
$$;

drop trigger if exists logpal_follows_pair_frozen on logpal_follows;
create trigger logpal_follows_pair_frozen
  before update on logpal_follows
  for each row execute function logpal_follows_freeze_pair();

-- Both ends of an edge can see it: you see who you follow, and who follows you.
drop policy if exists follows_visible on logpal_follows;
create policy follows_visible on logpal_follows for select
  using (auth.uid() = follower or auth.uid() = followee);

-- You may only follow on your own behalf. `status` is the trigger's to set.
drop policy if exists follows_own_insert on logpal_follows;
create policy follows_own_insert on logpal_follows for insert
  with check (auth.uid() = follower);

-- Accepting a request is the followee's act and nobody else's.
drop policy if exists follows_accept on logpal_follows;
create policy follows_accept on logpal_follows for update
  using (auth.uid() = followee) with check (auth.uid() = followee);

-- Covers all four ways an edge ends: unfollow, cancel a request, decline one,
-- and remove a follower.
drop policy if exists follows_own_delete on logpal_follows;
create policy follows_own_delete on logpal_follows for delete
  using (auth.uid() = follower or auth.uid() = followee);

-- Your own row, always. Everyone else needs to be signed in, and then either
-- the account is public or they are an accepted follower of it.
--
-- Signed-in is not incidental: without it `not private` would hand every
-- public display name to an anonymous request.
drop policy if exists social_visible on logpal_social_profile;
create policy social_visible on logpal_social_profile for select
  using (
    auth.uid() = user_id
    or (
      auth.uid() is not null
      and (
        not private
        or exists (
          select 1
          from logpal_follows f
          where f.followee = logpal_social_profile.user_id
            and f.follower = auth.uid()
            and f.status = 'accepted'
        )
      )
    )
  );

drop policy if exists social_own_write on logpal_social_profile;
create policy social_own_write on logpal_social_profile for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------- nudges --

-- One emoji, from one person to another. No message body: a text field is a
-- moderation problem and an inbox to manage, and a clap says the thing anyway.
create table if not exists logpal_nudges (
  id         uuid primary key default gen_random_uuid(),
  sender     uuid not null default auth.uid() references auth.users on delete cascade,
  recipient  uuid not null references auth.users on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  seen       boolean not null default false,
  constraint logpal_nudges_not_self check (sender <> recipient)
);

create index if not exists logpal_nudges_inbox
  on logpal_nudges (recipient, created_at desc);

alter table logpal_nudges enable row level security;

-- Sending is allowed only towards someone this account already follows, and
-- only as itself. Checked here rather than in the client, because the client
-- is the thing being defended against.
drop policy if exists logpal_nudges_send on logpal_nudges;
create policy logpal_nudges_send on logpal_nudges
  for insert with check (
    sender = auth.uid()
    and exists (
      select 1 from logpal_follows f
      where f.follower = auth.uid()
        and f.followee = logpal_nudges.recipient
        and f.status = 'accepted'
    )
  );

drop policy if exists logpal_nudges_read on logpal_nudges;
create policy logpal_nudges_read on logpal_nudges
  for select using (recipient = auth.uid() or sender = auth.uid());

-- Only the recipient marks one seen, and cannot hand it to someone else.
drop policy if exists logpal_nudges_seen on logpal_nudges;
create policy logpal_nudges_seen on logpal_nudges
  for update using (recipient = auth.uid()) with check (recipient = auth.uid());

drop policy if exists logpal_nudges_clear on logpal_nudges;
create policy logpal_nudges_clear on logpal_nudges
  for delete using (recipient = auth.uid() or sender = auth.uid());

-- Percentages replaced the raw figures on the shared profile: followers see
-- how far along someone is, never what they ate. Safe to re-run.
alter table logpal_social_profile add column if not exists calorie_pct integer;
alter table logpal_social_profile add column if not exists water_pct integer;
alter table logpal_social_profile add column if not exists step_pct integer;
alter table logpal_social_profile add column if not exists protein_pct integer;
alter table logpal_social_profile add column if not exists carbs_pct integer;
alter table logpal_social_profile add column if not exists fat_pct integer;
alter table logpal_social_profile add column if not exists exercise text;

-- Sharing became a level per figure rather than a switch: off, the percentage,
-- or the figure itself. The percentage columns above cover the middle rung;
-- these hold the top one. Nothing is written unless that level is chosen, so a
-- percentage-only account has nulls here rather than hidden values.
alter table logpal_social_profile add column if not exists water_ml integer;
alter table logpal_social_profile add column if not exists water_goal_ml integer;
alter table logpal_social_profile add column if not exists steps integer;
alter table logpal_social_profile add column if not exists step_goal integer;
alter table logpal_social_profile add column if not exists protein_g integer;
alter table logpal_social_profile add column if not exists carbs_g integer;
alter table logpal_social_profile add column if not exists fat_g integer;
alter table logpal_social_profile add column if not exists exercise_calories integer;

-- ------------------------------------------------------------ account deletion
--
-- App Store Review Guideline 5.1.1(v): an app that lets people create an
-- account must let them delete it from inside the app. The client cannot
-- delete its own auth.users row (that needs the service role), so this runs
-- as the definer and deletes exactly the caller. Every logpal_* table
-- references auth.users on delete cascade, so the row's data goes with it,
-- and the handle in logpal_usernames is released by the same cascade.
create or replace function delete_own_account()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function delete_own_account() from public;
grant execute on function delete_own_account() to authenticated;

-- ------------------------------------------------------------------ crews --
--
-- A crew is a small group with a name, a feed, challenges and a leaderboard.
-- Membership is the unit of access: every table below is readable by the
-- crew's members and nobody else, and joining happens through one function
-- that checks the invite code, so a client never inserts a membership row it
-- made up. Public crews are also listed (name and size only) to anyone signed
-- in, which is what "public" means here.
--
-- Crew mates see each other's published social profile exactly as followers
-- do: the `social_visible` policy is widened at the end of this block. Nothing
-- here reads a diary.

create table if not exists logpal_crews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 40),
  emoji       text not null default '🏁' check (char_length(emoji) between 1 and 8),
  visibility  text not null default 'private' check (visibility in ('private', 'public')),
  -- Eight characters from a 32-letter alphabet, generated by the client; the
  -- link people share is built from it. Unique so a code finds one crew.
  invite_code text not null unique check (invite_code ~ '^[A-Z2-9]{8}$'),
  owner       uuid not null default auth.uid() references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists logpal_crew_members (
  crew_id   uuid not null references logpal_crews on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

create index if not exists logpal_crew_members_by_user on logpal_crew_members (user_id);

-- One competition at a time per crew is a client rule, not a constraint:
-- past ones stay as history.
create table if not exists logpal_crew_challenges (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references logpal_crews on delete cascade,
  kind       text not null check (kind in ('steps', 'water', 'calories', 'logging')),
  title      text not null check (char_length(title) between 2 and 60),
  starts     date not null,
  ends       date not null check (ends >= starts),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists logpal_crew_challenges_by_crew on logpal_crew_challenges (crew_id, ends desc);

-- The feed and the chat are one stream. `chat` is typed by a person,
-- `milestone` is posted by their client when something worth telling the crew
-- happens (a PR, a streak), and `cheer` is reserved for team moments.
create table if not exists logpal_crew_posts (
  id         uuid primary key default gen_random_uuid(),
  crew_id    uuid not null references logpal_crews on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  kind       text not null default 'chat' check (kind in ('chat', 'milestone', 'cheer')),
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists logpal_crew_posts_by_crew on logpal_crew_posts (crew_id, created_at desc);

-- One reaction per person per post. Changing the emoji is an upsert.
create table if not exists logpal_crew_kudos (
  post_id    uuid not null references logpal_crew_posts on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Catalogue recipes only (the id is the one in recipes.json), because a
-- private recipe lives behind `own_rows` and could not be opened by anyone else.
create table if not exists logpal_crew_recipes (
  crew_id    uuid not null references logpal_crews on delete cascade,
  recipe_id  text not null check (char_length(recipe_id) between 1 and 80),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  note       text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  primary key (crew_id, recipe_id)
);

alter table logpal_crews enable row level security;
alter table logpal_crew_members enable row level security;
alter table logpal_crew_challenges enable row level security;
alter table logpal_crew_posts enable row level security;
alter table logpal_crew_kudos enable row level security;
alter table logpal_crew_recipes enable row level security;

-- Membership test that policies can call without recursing into the
-- members table's own policy.
create or replace function logpal_in_crew(crew uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from logpal_crew_members m
    where m.crew_id = crew and m.user_id = auth.uid()
  );
$$;

create or replace function logpal_owns_crew(crew uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from logpal_crews c where c.id = crew and c.owner = auth.uid());
$$;

-- crews: members see theirs; anyone signed in sees public ones (for Discover).
drop policy if exists crews_visible on logpal_crews;
-- `owner` is listed on its own because the insert returns the new row before
-- the owner's membership exists, and a select policy that fails there
-- surfaces as "new row violates row-level security policy".
create policy crews_visible on logpal_crews for select
  using (
    owner = auth.uid()
    or logpal_in_crew(id)
    or (auth.uid() is not null and visibility = 'public')
  );

drop policy if exists crews_create on logpal_crews;
create policy crews_create on logpal_crews for insert
  with check (owner = auth.uid());

drop policy if exists crews_owner_write on logpal_crews;
create policy crews_owner_write on logpal_crews for update
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists crews_owner_delete on logpal_crews;
create policy crews_owner_delete on logpal_crews for delete
  using (owner = auth.uid());

-- members
drop policy if exists crew_members_visible on logpal_crew_members;
create policy crew_members_visible on logpal_crew_members for select
  using (logpal_in_crew(crew_id));

-- The owner's own row at creation, and self-joins to public crews. Private
-- crews are joined only through `logpal_join_crew`, which checks the code.
drop policy if exists crew_members_join on logpal_crew_members;
create policy crew_members_join on logpal_crew_members for insert
  with check (
    user_id = auth.uid()
    and (
      logpal_owns_crew(crew_id)
      or exists (select 1 from logpal_crews c where c.id = crew_id and c.visibility = 'public')
    )
  );

-- Leave, or be removed by the owner.
drop policy if exists crew_members_leave on logpal_crew_members;
create policy crew_members_leave on logpal_crew_members for delete
  using (user_id = auth.uid() or logpal_owns_crew(crew_id));

-- challenges: any member starts one; the owner or its creator ends it.
drop policy if exists crew_challenges_visible on logpal_crew_challenges;
create policy crew_challenges_visible on logpal_crew_challenges for select
  using (logpal_in_crew(crew_id));

drop policy if exists crew_challenges_create on logpal_crew_challenges;
create policy crew_challenges_create on logpal_crew_challenges for insert
  with check (created_by = auth.uid() and logpal_in_crew(crew_id));

drop policy if exists crew_challenges_delete on logpal_crew_challenges;
create policy crew_challenges_delete on logpal_crew_challenges for delete
  using (created_by = auth.uid() or logpal_owns_crew(crew_id));

-- posts
drop policy if exists crew_posts_visible on logpal_crew_posts;
create policy crew_posts_visible on logpal_crew_posts for select
  using (logpal_in_crew(crew_id));

drop policy if exists crew_posts_write on logpal_crew_posts;
create policy crew_posts_write on logpal_crew_posts for insert
  with check (user_id = auth.uid() and logpal_in_crew(crew_id));

drop policy if exists crew_posts_delete on logpal_crew_posts;
create policy crew_posts_delete on logpal_crew_posts for delete
  using (user_id = auth.uid() or logpal_owns_crew(crew_id));

-- kudos: visible and writable by members of the post's crew, one per person.
drop policy if exists crew_kudos_visible on logpal_crew_kudos;
create policy crew_kudos_visible on logpal_crew_kudos for select
  using (exists (
    select 1 from logpal_crew_posts p where p.id = post_id and logpal_in_crew(p.crew_id)
  ));

drop policy if exists crew_kudos_give on logpal_crew_kudos;
create policy crew_kudos_give on logpal_crew_kudos for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from logpal_crew_posts p where p.id = post_id and logpal_in_crew(p.crew_id)
    )
  );

-- recipes
drop policy if exists crew_recipes_visible on logpal_crew_recipes;
create policy crew_recipes_visible on logpal_crew_recipes for select
  using (logpal_in_crew(crew_id));

drop policy if exists crew_recipes_share on logpal_crew_recipes;
create policy crew_recipes_share on logpal_crew_recipes for insert
  with check (user_id = auth.uid() and logpal_in_crew(crew_id));

drop policy if exists crew_recipes_remove on logpal_crew_recipes;
create policy crew_recipes_remove on logpal_crew_recipes for delete
  using (user_id = auth.uid() or logpal_owns_crew(crew_id));

/*
 * The invite link, before and after signing up.
 *
 * `logpal_crew_preview` is what the landing page shows someone who has not
 * signed up yet: the name, the emoji, how many are in, and the current
 * challenge. Callable anonymously on purpose, and it gives back nothing a
 * crew would mind a stranger with the link seeing (no member names).
 *
 * `logpal_join_crew` is the only way into a private crew. It runs as the
 * definer so it can read the code and insert the row past the policies, and
 * it is a no-op for someone already in.
 */
create or replace function logpal_crew_preview(code text)
returns table (
  id uuid,
  name text,
  emoji text,
  visibility text,
  members integer,
  challenge_title text,
  challenge_kind text,
  challenge_ends date
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.name, c.emoji, c.visibility,
    (select count(*)::integer from logpal_crew_members m where m.crew_id = c.id) as members,
    ch.title, ch.kind, ch.ends
  from logpal_crews c
  left join lateral (
    select title, kind, ends from logpal_challenges x
    where x.crew_id = c.id and x.ends >= current_date
    order by x.starts asc limit 1
  ) ch on true
  where c.invite_code = upper(code);
$$;

create or replace function logpal_join_crew(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  crew uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a crew';
  end if;
  select id into crew from logpal_crews where invite_code = upper(code);
  if crew is null then
    raise exception 'That invite link is not valid';
  end if;
  insert into logpal_crew_members (crew_id, user_id, role)
  values (crew, auth.uid(), 'member')
  on conflict do nothing;
  return crew;
end
$$;

grant execute on function logpal_crew_preview(text) to anon, authenticated;
grant execute on function logpal_join_crew(text) to authenticated;

-- Crew mates see each other's published profile, as followers do. A separate
-- policy rather than an edit to `social_visible`, so this block is safe to
-- run on its own. Policies are OR-ed, so adding one widens.
drop policy if exists social_visible_to_crew on logpal_social_profile;
create policy social_visible_to_crew on logpal_social_profile for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from logpal_crew_members a
      join logpal_crew_members b on a.crew_id = b.crew_id
      where a.user_id = auth.uid() and b.user_id = logpal_social_profile.user_id
    )
  );

-- A crew can wear a photo instead of an emoji: a square JPEG data URL made on
-- the device (`lib/avatar.ts`, 256px). Safe to re-run.
alter table logpal_crews add column if not exists photo text
  check (photo is null or (photo like 'data:image/%' and char_length(photo) <= 120000));

drop function if exists logpal_crew_preview(text);
create or replace function logpal_crew_preview(code text)
returns table (
  id uuid,
  name text,
  emoji text,
  photo text,
  visibility text,
  members integer,
  challenge_title text,
  challenge_kind text,
  challenge_ends date
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id, c.name, c.emoji, c.photo, c.visibility,
    (select count(*)::integer from logpal_crew_members m where m.crew_id = c.id) as members,
    ch.title, ch.kind, ch.ends
  from logpal_crews c
  left join lateral (
    select title, kind, ends from logpal_challenges x
    where x.crew_id = c.id and x.ends >= current_date
    order by x.starts asc limit 1
  ) ch on true
  where c.invite_code = upper(code);
$$;

grant execute on function logpal_crew_preview(text) to anon, authenticated;

-- ---------------------------------------------------------- challenges --
-- 2026-11-07. Head-to-head contests the way Apple Fitness does them: steps
-- or water, totalled over a date range, between friends (invited, and they
-- accept) or across a whole crew (everyone is in). Scored from
-- logpal_social_days, a per-day copy of steps and water that each client
-- publishes for its last fourteen days whenever those are shared at all.

create table if not exists logpal_social_days (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  day        date not null,
  steps      integer,
  water_ml   integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table logpal_social_days enable row level security;

create table if not exists logpal_challenges (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('steps', 'water')),
  title      text not null check (char_length(title) between 2 and 60),
  starts     date not null,
  ends       date not null check (ends >= starts),
  crew_id    uuid references logpal_crews on delete cascade,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists logpal_challenges_by_crew on logpal_challenges (crew_id, ends desc);
alter table logpal_challenges enable row level security;

create table if not exists logpal_challenge_members (
  challenge_id uuid not null references logpal_challenges on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  status       text not null default 'invited' check (status in ('invited', 'in', 'declined')),
  invited_by   uuid references auth.users on delete set null,
  joined_at    timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists logpal_challenge_members_by_user on logpal_challenge_members (user_id);
alter table logpal_challenge_members enable row level security;

-- Helpers the policies call without recursing into their own tables.
create or replace function logpal_in_challenge(ch uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from logpal_challenge_members m where m.challenge_id = ch and m.user_id = auth.uid());
$$;

create or replace function logpal_made_challenge(ch uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from logpal_challenges c where c.id = ch and c.created_by = auth.uid());
$$;

create or replace function logpal_challenge_crew(ch uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select c.crew_id from logpal_challenges c where c.id = ch;
$$;

-- Who may read someone's day rows: the same people who may read their
-- profile, plus crew-mates and anyone lined up in a challenge with them.
create or replace function logpal_shares_days_with(owner uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select owner = auth.uid()
    or (auth.uid() is not null and (
      exists (select 1 from logpal_social_profile p where p.user_id = owner and not p.private)
      or exists (select 1 from logpal_follows f where f.followee = owner and f.follower = auth.uid() and f.status = 'accepted')
      or exists (select 1 from logpal_crew_members a join logpal_crew_members b on a.crew_id = b.crew_id
                 where a.user_id = owner and b.user_id = auth.uid())
      or exists (select 1 from logpal_challenge_members a join logpal_challenge_members b on a.challenge_id = b.challenge_id
                 where a.user_id = owner and b.user_id = auth.uid())
    ));
$$;

drop policy if exists days_visible on logpal_social_days;
create policy days_visible on logpal_social_days for select
  using (logpal_shares_days_with(user_id));
drop policy if exists days_own_write on logpal_social_days;
create policy days_own_write on logpal_social_days for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- challenges: the maker, anyone lined up in it, and the crew it belongs to.
-- `created_by` on its own so the insert's RETURNING passes before the
-- maker's member row exists.
drop policy if exists challenges_visible on logpal_challenges;
create policy challenges_visible on logpal_challenges for select
  using (created_by = auth.uid() or logpal_in_challenge(id) or (crew_id is not null and logpal_in_crew(crew_id)));
drop policy if exists challenges_create on logpal_challenges;
create policy challenges_create on logpal_challenges for insert
  with check (created_by = auth.uid() and (crew_id is null or logpal_in_crew(crew_id)));
drop policy if exists challenges_delete on logpal_challenges;
create policy challenges_delete on logpal_challenges for delete
  using (created_by = auth.uid());

-- members: the maker lines people up; a crew-mate can put themself into a
-- crew challenge; everyone changes only their own status.
drop policy if exists challenge_members_visible on logpal_challenge_members;
create policy challenge_members_visible on logpal_challenge_members for select
  using (
    logpal_in_challenge(challenge_id)
    or logpal_made_challenge(challenge_id)
    or (logpal_challenge_crew(challenge_id) is not null and logpal_in_crew(logpal_challenge_crew(challenge_id)))
  );
drop policy if exists challenge_members_insert on logpal_challenge_members;
create policy challenge_members_insert on logpal_challenge_members for insert
  with check (
    logpal_made_challenge(challenge_id)
    or (user_id = auth.uid() and logpal_challenge_crew(challenge_id) is not null and logpal_in_crew(logpal_challenge_crew(challenge_id)))
  );
drop policy if exists challenge_members_update on logpal_challenge_members;
create policy challenge_members_update on logpal_challenge_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists challenge_members_delete on logpal_challenge_members;
create policy challenge_members_delete on logpal_challenge_members for delete
  using (user_id = auth.uid() or logpal_made_challenge(challenge_id));
