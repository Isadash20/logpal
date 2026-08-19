-- LogPal — Supabase schema
--
-- Run this once in the Supabase SQL editor against a fresh project.
-- Safe to re-run: every statement is idempotent.
--
-- Every table carries `user_id uuid not null default auth.uid()` and has row
-- level security switched on, so a query can only ever see the signed-in user's
-- own rows. The client never sends `user_id` — the default fills it in, and the
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
-- handles — neither works under a policy that hides every row but your own.
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
 * Signing in by username needs this because Supabase authenticates on email —
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
-- something — the client deletes the row when every toggle is turned off,
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

-- Directed edges: `follower` follows `followee`. Asymmetric on purpose — this
-- is following, not mutual friendship — so the pair is ordered and both
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
 * published, so there is nothing for approval to protect — the follow is
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
 * The update policy below has to let the followee write the row — that is what
 * accepting a request is — and a policy cannot see the row's previous values,
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
