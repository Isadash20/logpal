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
  primary key (user_id, date)
);

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
