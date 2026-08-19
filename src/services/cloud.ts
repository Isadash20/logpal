import type {
  AppData,
  ExerciseEntry,
  FastSession,
  Food,
  FoodEntry,
  MeasurementEntry,
  Recipe,
  SavedMeal,
  WeightEntry,
} from '../types'
import { requireClient } from '../lib/supabase'
import { defaultData } from '../lib/storage'

/**
 * Cloud persistence.
 *
 * ## Why this is a differ and not thirty mutation methods
 *
 * The store holds one `AppData` object and every mutation is "clone it, change
 * it, set it" — thirty of them, several of which touch many rows at once
 * (`copyDay` rewrites a whole day, `logItems` inserts a meal's worth of
 * entries). Wiring each mutation to its own insert/update/delete would mean
 * thirty chances to forget a call, and screens would have to start awaiting
 * things they currently do not.
 *
 * Instead the store keeps working exactly as it does, and `pushChanges` is
 * handed the previous and current snapshots. It walks the same collections
 * every time and writes only what actually differs. One code path, and a
 * mutation added later syncs itself as long as it goes through `update()`.
 *
 * ## What is not synced
 *
 * `foodCache` and `scannedBarcodes` are — history logged on a phone would
 * otherwise show up nameless on a laptop. The bulk food database is not: it is
 * a static asset, identical for everyone, and re-downloadable.
 */

/* --------------------------------------------------------------- helpers -- */

/** Chunked so a first sync of a long history cannot exceed the request size. */
const BATCH = 500

async function upsert(table: string, rows: Record<string, unknown>[]) {
  const db = requireClient()
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + BATCH))
    if (error) throw error
  }
}

/**
 * Deletes by primary key.
 *
 * Single-column keys go through `.in()`, which batches the whole set into one
 * request and — importantly — lets the client escape the values. Building a
 * PostgREST `or=(...)` filter by hand would be faster for composite keys but
 * puts raw values into filter syntax, where a comma, dot or parenthesis in a
 * value silently changes what gets matched. Measurement keys can be custom
 * slugs, so that is a real risk rather than a theoretical one.
 *
 * The only composite key here is (date, key) on measurements, where deletions
 * are rare and few; those are issued one at a time on purpose.
 */
async function remove(table: string, keys: Record<string, unknown>[]) {
  if (!keys.length) return
  const db = requireClient()
  const columns = Object.keys(keys[0])

  if (columns.length === 1) {
    const col = columns[0]
    const values = keys.map((k) => k[col])
    for (let i = 0; i < values.length; i += BATCH) {
      const { error } = await db
        .from(table)
        .delete()
        .in(col, values.slice(i, i + BATCH))
      if (error) throw error
    }
    return
  }

  for (const key of keys) {
    let q = db.from(table).delete()
    for (const [col, val] of Object.entries(key)) q = q.eq(col, val)
    const { error } = await q
    if (error) throw error
  }
}

/**
 * A synced collection: how to key its members, how to turn one into a row, and
 * how to read one back. Everything below is expressed in these terms so the
 * diff logic exists once.
 */
export interface Collection<T> {
  table: string
  /** Primary key columns, minus user_id, which the server fills in. */
  keyOf(item: T): Record<string, unknown>
  toRow(item: T): Record<string, unknown>
  items(data: AppData): T[]
}

/** Stable identity for change detection — cheap, and exact enough. */
function fingerprint(row: Record<string, unknown>): string {
  return JSON.stringify(row)
}

/** Joined on NUL rather than a printable character: measurement sites are
 *  user-supplied slugs, and a value containing the separator could otherwise
 *  collide with a different composite key. */
function keyString(key: Record<string, unknown>): string {
  return Object.values(key).join('\u0000')
}

export interface CollectionDiff {
  changed: Record<string, unknown>[]
  gone: Record<string, unknown>[]
}

/**
 * Pure: works out what changed between two snapshots of one collection.
 *
 * Separated from the writing so it can be tested without a database — this is
 * the part where a mistake quietly loses or duplicates a user's diary.
 */
export function diffCollection<T>(
  c: Collection<T>,
  prev: AppData | null,
  next: AppData,
): CollectionDiff {
  const before = new Map<string, string>()
  if (prev) {
    for (const item of c.items(prev)) {
      before.set(keyString(c.keyOf(item)), fingerprint(c.toRow(item)))
    }
  }

  const changed: Record<string, unknown>[] = []
  const seen = new Set<string>()

  for (const item of c.items(next)) {
    const k = keyString(c.keyOf(item))
    seen.add(k)
    const row = c.toRow(item)
    if (before.get(k) !== fingerprint(row)) changed.push(row)
  }

  const gone: Record<string, unknown>[] = []
  if (prev) {
    for (const item of c.items(prev)) {
      const k = keyString(c.keyOf(item))
      if (!seen.has(k)) gone.push(c.keyOf(item))
    }
  }

  return { changed, gone }
}

async function syncCollection<T>(
  c: Collection<T>,
  prev: AppData | null,
  next: AppData,
) {
  const { changed, gone } = diffCollection(c, prev, next)
  if (changed.length) await upsert(c.table, changed)
  if (gone.length) await remove(c.table, gone)
}

/* ----------------------------------------------------------- collections -- */

export const foodEntries: Collection<FoodEntry> = {
  table: 'logpal_food_entries',
  keyOf: (e) => ({ id: e.id }),
  items: (d) => d.foodEntries,
  toRow: (e) => ({
    id: e.id,
    date: e.date,
    meal: e.meal,
    food_id: e.foodId,
    name: e.name,
    brand: e.brand ?? null,
    serving_label: e.servingLabel,
    servings: e.servings,
    nutrients: e.nutrients,
    source: e.source,
    logged_at: e.loggedAt,
  }),
}

const exerciseEntries: Collection<ExerciseEntry> = {
  table: 'logpal_exercise_entries',
  keyOf: (e) => ({ id: e.id }),
  items: (d) => d.exerciseEntries,
  toRow: (e) => ({
    id: e.id,
    date: e.date,
    kind: e.kind,
    name: e.name,
    exercise_id: e.exerciseId ?? null,
    minutes: e.minutes ?? null,
    calories_burned: e.caloriesBurned ?? null,
    sets: e.sets ?? null,
    reps: e.reps ?? null,
    weight: e.weight ?? null,
    logged_at: e.loggedAt,
  }),
}

const weights: Collection<WeightEntry> = {
  table: 'logpal_weights',
  keyOf: (w) => ({ date: w.date }),
  items: (d) => d.weights,
  toRow: (w) => ({ date: w.date, weight: w.weight }),
}

export const measurements: Collection<MeasurementEntry> = {
  table: 'logpal_measurements',
  keyOf: (m) => ({ date: m.date, key: m.key }),
  items: (d) => d.measurements,
  toRow: (m) => ({ date: m.date, key: m.key, value: m.value }),
}

/** `days` is keyed by date rather than being a list, so it is flattened first. */
interface DayRow {
  date: string
  water: number
  completed: boolean
  sleep_min: number | null
  steps: number | null
}

export const days: Collection<DayRow> = {
  table: 'logpal_days',
  keyOf: (d) => ({ date: d.date }),
  items: (data) =>
    Object.entries(data.days).map(([date, log]) => ({
      date,
      water: log.water,
      completed: log.completed,
      /* Null rather than zero: an untouched day has no sleep or step figure,
         and writing zeros would make every day look like a night with none. */
      sleep_min: log.sleepMin ?? null,
      steps: log.steps ?? null,
    })),
  toRow: (d) => ({
    date: d.date,
    water: d.water,
    completed: d.completed,
    sleep_min: d.sleep_min,
    steps: d.steps,
  }),
}

const fasts: Collection<FastSession> = {
  table: 'logpal_fasts',
  keyOf: (f) => ({ id: f.id }),
  items: (d) => d.fasts,
  toRow: (f) => ({
    id: f.id,
    started_at: f.startedAt,
    ended_at: f.endedAt ?? null,
    target_hours: f.targetHours,
    protocol: f.protocol,
  }),
}

const customFoods: Collection<Food> = {
  table: 'logpal_custom_foods',
  keyOf: (f) => ({ id: f.id }),
  items: (d) => d.customFoods,
  toRow: (f) => ({ id: f.id, food: f }),
}

const meals: Collection<SavedMeal> = {
  table: 'logpal_meals',
  keyOf: (m) => ({ id: m.id }),
  items: (d) => d.savedMeals,
  toRow: (m) => ({ id: m.id, meal: m }),
}

const recipes: Collection<Recipe> = {
  table: 'logpal_recipes',
  keyOf: (r) => ({ id: r.id }),
  items: (d) => d.recipes,
  toRow: (r) => ({ id: r.id, recipe: r }),
}

/** foodCache keyed by id, with the barcode mapping folded back in. */
export const savedFoods: Collection<Food> = {
  table: 'logpal_saved_foods',
  keyOf: (f) => ({ id: f.id }),
  items: (d) => Object.values(d.foodCache),
  toRow: (f) => ({ id: f.id, barcode: f.barcode ?? null, food: f }),
}

const COLLECTIONS = [
  foodEntries,
  exerciseEntries,
  weights,
  measurements,
  days,
  fasts,
  customFoods,
  meals,
  recipes,
  savedFoods,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each entry is
  // a Collection of a different type; only the shared shape is used here.
] as Collection<any>[]

/* ------------------------------------------------------------------ read -- */

export async function fetchAll(): Promise<AppData | null> {
  const db = requireClient()
  const base = defaultData()

  const [
    profileRes,
    foodRes,
    exerciseRes,
    weightRes,
    measurementRes,
    dayRes,
    fastRes,
    customRes,
    mealRes,
    recipeRes,
    savedRes,
  ] = await Promise.all([
    db.from('logpal_profile').select('*').maybeSingle(),
    db.from('logpal_food_entries').select('*'),
    db.from('logpal_exercise_entries').select('*'),
    db.from('logpal_weights').select('*'),
    db.from('logpal_measurements').select('*'),
    db.from('logpal_days').select('*'),
    db.from('logpal_fasts').select('*'),
    db.from('logpal_custom_foods').select('*'),
    db.from('logpal_meals').select('*'),
    db.from('logpal_recipes').select('*'),
    db.from('logpal_saved_foods').select('*'),
  ])

  for (const res of [
    profileRes,
    foodRes,
    exerciseRes,
    weightRes,
    measurementRes,
    dayRes,
    fastRes,
    customRes,
    mealRes,
    recipeRes,
    savedRes,
  ]) {
    if (res.error) throw res.error
  }

  // A user who has never synced has no profile row; the caller treats null as
  // "nothing in the cloud yet" and offers to lift the local data up.
  if (!profileRes.data && !(foodRes.data ?? []).length) return null

  const p = profileRes.data as Record<string, unknown> | null

  const foodCache: Record<string, Food> = {}
  const scannedBarcodes: Record<string, string> = {}
  for (const row of savedRes.data ?? []) {
    const food = row.food as Food
    foodCache[food.id] = food
    if (row.barcode) scannedBarcodes[row.barcode as string] = food.id
  }

  return {
    ...base,
    profile: { ...base.profile, ...((p?.profile as object) ?? {}) },
    settings: { ...base.settings, ...((p?.settings as object) ?? {}) },
    fasting: { ...base.fasting, ...((p?.fasting as object) ?? {}) },
    favoriteFoodIds: (p?.favorite_food_ids as string[]) ?? [],
    recentFoodIds: (p?.recent_food_ids as string[]) ?? [],

    foodEntries: (foodRes.data ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      meal: r.meal,
      foodId: r.food_id,
      name: r.name,
      brand: r.brand ?? undefined,
      servingLabel: r.serving_label,
      servings: r.servings,
      nutrients: r.nutrients,
      source: r.source,
      loggedAt: Number(r.logged_at),
    })) as FoodEntry[],

    exerciseEntries: (exerciseRes.data ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      kind: r.kind,
      name: r.name,
      exerciseId: r.exercise_id ?? undefined,
      minutes: r.minutes ?? undefined,
      caloriesBurned: r.calories_burned ?? undefined,
      sets: r.sets ?? undefined,
      reps: r.reps ?? undefined,
      weight: r.weight ?? undefined,
      loggedAt: Number(r.logged_at),
    })) as ExerciseEntry[],

    weights: (weightRes.data ?? []).map((r) => ({
      date: r.date,
      weight: r.weight,
    })),

    measurements: (measurementRes.data ?? []).map((r) => ({
      date: r.date,
      key: r.key,
      value: r.value,
    })),

    days: Object.fromEntries(
      (dayRes.data ?? []).map((r) => [
        r.date,
        {
          water: r.water,
          completed: r.completed,
          ...(r.sleep_min == null ? {} : { sleepMin: Number(r.sleep_min) }),
          ...(r.steps == null ? {} : { steps: Number(r.steps) }),
        },
      ]),
    ),

    fasts: (fastRes.data ?? []).map((r) => ({
      id: r.id,
      startedAt: Number(r.started_at),
      endedAt: r.ended_at == null ? undefined : Number(r.ended_at),
      targetHours: r.target_hours,
      protocol: r.protocol,
    })) as FastSession[],

    customFoods: (customRes.data ?? []).map((r) => r.food as Food),
    savedMeals: (mealRes.data ?? []).map((r) => r.meal as SavedMeal),
    recipes: (recipeRes.data ?? []).map((r) => r.recipe as Recipe),
    foodCache,
    scannedBarcodes,
  }
}

/* ----------------------------------------------------------------- write -- */

/** True when the singleton config row needs rewriting. */
function profileChanged(prev: AppData | null, next: AppData): boolean {
  if (!prev) return true
  return (
    JSON.stringify(prev.profile) !== JSON.stringify(next.profile) ||
    JSON.stringify(prev.settings) !== JSON.stringify(next.settings) ||
    JSON.stringify(prev.fasting) !== JSON.stringify(next.fasting) ||
    JSON.stringify(prev.favoriteFoodIds) !== JSON.stringify(next.favoriteFoodIds) ||
    JSON.stringify(prev.recentFoodIds) !== JSON.stringify(next.recentFoodIds)
  )
}

/**
 * Writes everything that differs between two snapshots.
 *
 * Pass `prev: null` for a first sync, which uploads the lot. Collections are
 * written in sequence rather than in parallel so that a failure part-way
 * through leaves a prefix of complete tables instead of eleven half-written
 * ones; the next push re-diffs and finishes the job.
 */
export async function pushChanges(prev: AppData | null, next: AppData): Promise<void> {
  const db = requireClient()

  if (profileChanged(prev, next)) {
    const { error } = await db.from('logpal_profile').upsert(
      {
        profile: next.profile,
        settings: next.settings,
        fasting: next.fasting,
        favorite_food_ids: next.favoriteFoodIds,
        recent_food_ids: next.recentFoodIds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    if (error) throw error
  }

  for (const c of COLLECTIONS) await syncCollection(c, prev, next)
}

/** Wipes the signed-in user's cloud data. Used by Settings → reset. */
export async function deleteAll(): Promise<void> {
  const db = requireClient()
  const tables = [
    'logpal_food_entries',
    'logpal_exercise_entries',
    'logpal_weights',
    'logpal_measurements',
    'logpal_days',
    'logpal_fasts',
    'logpal_custom_foods',
    'logpal_meals',
    'logpal_recipes',
    'logpal_saved_foods',
    'logpal_profile',
  ]
  for (const t of tables) {
    // RLS scopes this to the signed-in user; the filter is just a required
    // predicate for a bulk delete.
    const { error } = await db.from(t).delete().not('user_id', 'is', null)
    if (error) throw error
  }
}

/* ------------------------------------------------------------- usernames -- */

/**
 * The signed-in user's handle, or null if they have not claimed one.
 *
 * The filter is not optional. Unlike every other table here, this one is
 * world-readable by design — a friend search has to be able to see other
 * people's handles — so an unfiltered select returns the whole table and
 * `maybeSingle()` then fails on "more than one row". The symptom is the
 * sign-up gate reappearing for an account that already has a handle.
 */
export async function fetchUsername(): Promise<string | null> {
  const db = requireClient()
  const { data: auth } = await db.auth.getUser()
  const id = auth.user?.id
  if (!id) return null

  const { data, error } = await db
    .from('logpal_usernames')
    .select('username')
    .eq('user_id', id)
    .maybeSingle()
  if (error) throw error
  return (data?.username as string) ?? null
}

/**
 * Claims or changes a handle.
 *
 * Upsert on user_id rather than insert, so someone who already has a handle can
 * change it; the case-insensitive unique index is what actually rejects a
 * collision, and its error is translated into something a person can act on.
 */
export async function setUsername(handle: string): Promise<void> {
  const db = requireClient()
  const value = handle.trim().toLowerCase()
  const { error } = await db
    .from('logpal_usernames')
    .upsert({ username: value }, { onConflict: 'user_id' })
  if (error) {
    if (error.code === '23505') throw new Error('That username is taken. Try another.')
    throw error
  }
}
