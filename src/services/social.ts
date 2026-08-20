import { requireClient } from '../lib/supabase'

/**
 * Following, and the handful of fields an account publishes to its followers.
 *
 * ## Where the boundary is
 *
 * Nothing here reads another user's diary, weight, goals or measurements. It
 * cannot: those tables are behind `own_rows`, which only ever matches the
 * signed-in user. What one person sees of another is exactly what that person's
 * own client wrote into `logpal_social_profile`, and that write is filtered by
 * their `shareName` / `shareStreak` / `shareCalories` settings before it leaves
 * the device. A field they have not shared is not in the table — not hidden in
 * the UI, not null-checked at read time. Absent.
 *
 * ## Two tables, two round trips
 *
 * Handles live in `logpal_usernames` and published fields in
 * `logpal_social_profile`, with no foreign key between them, so PostgREST will
 * not embed one in the other. Every list here therefore resolves ids first and
 * then hydrates them in a second pair of queries. `hydrate` is that step, and
 * it is the only place the two are joined.
 *
 * The row level security does the filtering on the way back: ask for fifty
 * profiles and you receive the ones you are allowed to see. A private account
 * you do not follow simply is not in the response, which is why `Person.name`
 * and friends are all nullable.
 */

/* ------------------------------------------------------------------ types -- */

/** How the signed-in user stands with someone else. */
export type FollowState =
  /** Not following, and no request outstanding. */
  | 'none'
  /** Requested; waiting on a private account to approve it. */
  | 'pending'
  | 'following'

export interface Person {
  userId: string
  username: string
  /** Null when they share no name, or when a private account hides it. */
  name: string | null
  streak: number | null
  /** YYYY-MM-DD of their most recent logged day. */
  lastLogged: string | null
  /**
   * Progress against their own goals, 0–100 and occasionally past it.
   *
   * Percentages only, by design. What someone eats, drinks and walks in a day
   * is theirs; how close they are to the target they set is the part worth
   * cheering, and it is all this screen was ever using the raw figures for.
   */
  caloriePct: number | null
  waterPct: number | null
  stepPct: number | null
  proteinPct: number | null
  carbsPct: number | null
  fatPct: number | null
  /**
   * The figures themselves, and only from accounts that chose to publish them.
   *
   * Null is the normal case: sharing a percentage does not write these, so a
   * profile on `percent` has nothing here to expose.
   */
  calories: number | null
  calorieGoal: number | null
  waterMl: number | null
  waterGoalMl: number | null
  steps: number | null
  stepGoal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  /** Today's workout, when they share it: "Running, 35 min". */
  exercise: string | null
  /** What it burned, on the top setting only. */
  exerciseCalories: number | null
  /** True when following them needs their approval. */
  private: boolean
  /** True when nothing about them is visible: they share nothing, or they are
   *  private and this account is not an accepted follower. The two are
   *  indistinguishable from here on purpose — a private account should not
   *  advertise that it has something worth asking for. */
  empty: boolean
}

/** The fields an account publishes. Nulls are "not shared". */
export interface PublishedProfile {
  display_name: string | null
  streak: number | null
  last_logged: string | null
  calorie_pct: number | null
  water_pct: number | null
  step_pct: number | null
  protein_pct: number | null
  carbs_pct: number | null
  fat_pct: number | null
  calories: number | null
  calorie_goal: number | null
  water_ml: number | null
  water_goal_ml: number | null
  steps: number | null
  step_goal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  exercise: string | null
  exercise_calories: number | null
}

interface UsernameRow {
  user_id: string
  username: string
}

interface SocialRow {
  user_id: string
  private: boolean
  display_name: string | null
  streak: number | null
  last_logged: string | null
  calorie_pct: number | null
  water_pct: number | null
  step_pct: number | null
  protein_pct: number | null
  carbs_pct: number | null
  fat_pct: number | null
  calories: number | null
  calorie_goal: number | null
  water_ml: number | null
  water_goal_ml: number | null
  steps: number | null
  step_goal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  exercise: string | null
  exercise_calories: number | null
}

/* -------------------------------------------------------------- hydration -- */

/**
 * Turns a set of user ids into people.
 *
 * Handles come back for everyone — that table is world-readable, which is what
 * makes search possible at all. Published fields come back only for those whose
 * policy allows it, so an id with a handle and no profile is the normal case for
 * a private account you do not follow, not an error.
 */
async function hydrate(userIds: string[]): Promise<Map<string, Person>> {
  const out = new Map<string, Person>()
  if (!userIds.length) return out

  const db = requireClient()
  const [names, profiles] = await Promise.all([
    db.from('logpal_usernames').select('user_id, username').in('user_id', userIds),
    db.from('logpal_social_profile').select('*').in('user_id', userIds),
  ])
  if (names.error) throw names.error
  if (profiles.error) throw profiles.error

  const byId = new Map<string, SocialRow>()
  for (const row of (profiles.data ?? []) as SocialRow[]) byId.set(row.user_id, row)

  for (const row of (names.data ?? []) as UsernameRow[]) {
    const p = byId.get(row.user_id)
    out.set(row.user_id, {
      userId: row.user_id,
      username: row.username,
      name: p?.display_name ?? null,
      streak: p?.streak ?? null,
      lastLogged: p?.last_logged ?? null,
      caloriePct: p?.calorie_pct ?? null,
      waterPct: p?.water_pct ?? null,
      stepPct: p?.step_pct ?? null,
      proteinPct: p?.protein_pct ?? null,
      carbsPct: p?.carbs_pct ?? null,
      fatPct: p?.fat_pct ?? null,
      calories: p?.calories ?? null,
      calorieGoal: p?.calorie_goal ?? null,
      waterMl: p?.water_ml ?? null,
      waterGoalMl: p?.water_goal_ml ?? null,
      steps: p?.steps ?? null,
      stepGoal: p?.step_goal ?? null,
      proteinG: p?.protein_g ?? null,
      carbsG: p?.carbs_g ?? null,
      fatG: p?.fat_g ?? null,
      exercise: p?.exercise ?? null,
      exerciseCalories: p?.exercise_calories ?? null,
      private: p?.private ?? false,
      empty:
        !p ||
        (p.display_name === null &&
          p.streak === null &&
          p.calorie_pct === null &&
          p.water_pct === null &&
          p.step_pct === null &&
          p.protein_pct === null &&
          p.exercise === null),
    })
  }
  return out
}

/* ----------------------------------------------------------------- search -- */

/** Below this a prefix matches most of the table and the results are noise. */
const MIN_QUERY = 2
const SEARCH_LIMIT = 25

/**
 * Finds accounts by the start of their handle.
 *
 * Prefix rather than substring: `ilike '%phil%'` cannot use the index, and
 * "starts with" is how people look for a handle they half remember anyway. The
 * `%` and `_` in the query are escaped, or a search for `_` would return
 * everything.
 */
export async function searchPeople(query: string, me: string): Promise<Person[]> {
  const q = query.trim().toLowerCase()
  if (q.length < MIN_QUERY) return []

  const prefix = q.replace(/[%_\\]/g, (c) => `\\${c}`)
  const { data, error } = await requireClient()
    .from('logpal_usernames')
    .select('user_id, username')
    .ilike('username', `${prefix}%`)
    .limit(SEARCH_LIMIT)
  if (error) throw error

  const ids = (data ?? []).map((r) => r.user_id as string).filter((id) => id !== me)
  const people = await hydrate(ids)
  // Handle order, not the database's, so the list does not reshuffle as rows
  // are added.
  return [...people.values()].sort((a, b) => a.username.localeCompare(b.username))
}

/* ------------------------------------------------------------------ edges -- */

interface FollowRow {
  follower: string
  followee: string
  status: 'pending' | 'accepted'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function edges(me: string): Promise<FollowRow[]> {
  /* The one place here that builds PostgREST filter syntax by hand, because
     `.or()` takes no other form. Checked against the uuid shape first: the id
     comes from the session rather than from anything typed, but a comma or a
     parenthesis reaching this string would change which rows come back rather
     than failing, and that is not a class of bug worth leaving open. */
  if (!UUID.test(me)) throw new Error('Not a user id')

  const { data, error } = await requireClient()
    .from('logpal_follows')
    .select('follower, followee, status')
    .or(`follower.eq.${me},followee.eq.${me}`)
  if (error) throw error
  return (data ?? []) as FollowRow[]
}

export interface Connections {
  /** Accepted follows you made. */
  following: Person[]
  /** Accepted follows others made on you. */
  followers: Person[]
  /** Private-account requests waiting on *your* approval. */
  requests: Person[]
  /** Requests you sent that are still waiting on someone else. */
  sent: Person[]
}

/**
 * Everyone connected to this account, in one pass.
 *
 * A single edge query and a single hydration, rather than four of each: the
 * four lists are different slices of the same small set of rows, and splitting
 * them into separate requests would only make them disagree with each other
 * halfway through a refresh.
 */
export async function fetchConnections(me: string): Promise<Connections> {
  const rows = await edges(me)
  const others = [
    ...new Set(rows.map((r) => (r.follower === me ? r.followee : r.follower))),
  ]
  const people = await hydrate(others)

  const pick = (test: (r: FollowRow) => boolean): Person[] =>
    rows
      .filter(test)
      .map((r) => people.get(r.follower === me ? r.followee : r.follower))
      .filter((p): p is Person => p !== undefined)
      .sort((a, b) => a.username.localeCompare(b.username))

  return {
    following: pick((r) => r.follower === me && r.status === 'accepted'),
    followers: pick((r) => r.followee === me && r.status === 'accepted'),
    requests: pick((r) => r.followee === me && r.status === 'pending'),
    sent: pick((r) => r.follower === me && r.status === 'pending'),
  }
}

/**
 * How many follow requests are waiting on this account.
 *
 * Its own query, and a counting one, so the Settings hub can badge the Friends
 * banner without pulling every edge and every profile behind them. A request on
 * a private account is otherwise invisible until someone thinks to go looking.
 */
export async function pendingRequestCount(me: string): Promise<number> {
  const { count, error } = await requireClient()
    .from('logpal_follows')
    .select('follower', { count: 'exact', head: true })
    .eq('followee', me)
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

/** How the signed-in user stands with one particular person. */
export async function followState(me: string, them: string): Promise<FollowState> {
  const { data, error } = await requireClient()
    .from('logpal_follows')
    .select('status')
    .eq('follower', me)
    .eq('followee', them)
    .maybeSingle()
  if (error) throw error
  if (!data) return 'none'
  return data.status === 'accepted' ? 'following' : 'pending'
}

/**
 * Follows someone, and reports what actually happened.
 *
 * The client does not decide between "following" and "requested" — a database
 * trigger sets `status` from the target's own privacy flag, because a client
 * that could write 'accepted' itself could read a private account by asking
 * nicely. The insert selects the row back so the button shows the truth rather
 * than an optimistic guess.
 */
export async function follow(me: string, them: string): Promise<FollowState> {
  const { data, error } = await requireClient()
    .from('logpal_follows')
    .insert({ followee: them })
    .select('status')
    .single()
  if (error) {
    // Already there — another device, or the double-fired click the browser
    // tooling produces. Report where that left things rather than failing.
    if (error.code === '23505') return followState(me, them)
    throw error
  }
  return data.status === 'accepted' ? 'following' : 'pending'
}

/** Unfollow, or withdraw a request that has not been answered. */
export async function unfollow(me: string, them: string): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_follows')
    .delete()
    .eq('follower', me)
    .eq('followee', them)
  if (error) throw error
}

/** Approve a request made on a private account. */
export async function acceptFollower(me: string, them: string): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_follows')
    .update({ status: 'accepted' })
    .eq('follower', them)
    .eq('followee', me)
  if (error) throw error
}

/**
 * Declines a pending request, or removes someone who is already following.
 *
 * One function because it is one act — the row goes away — and the only thing
 * that differs is what it is called on screen.
 */
export async function removeFollower(me: string, them: string): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_follows')
    .delete()
    .eq('follower', them)
    .eq('followee', me)
  if (error) throw error
}

/* --------------------------------------------------------- own publishing -- */

/** Whether this account makes people ask before they can follow it. */
export async function fetchPrivate(me: string): Promise<boolean> {
  const { data, error } = await requireClient()
    .from('logpal_social_profile')
    .select('private')
    .eq('user_id', me)
    .maybeSingle()
  if (error) throw error
  return data?.private ?? false
}

/**
 * Sets the private flag.
 *
 * Upsert rather than update: someone who shares nothing has no row, and going
 * private has to work for them too — otherwise the switch would silently do
 * nothing until they also shared something.
 *
 * Existing accepted followers keep their access, which is what every other
 * social app does and what people expect. Going private governs who may follow
 * next, not who already does.
 */
export async function setPrivate(value: boolean): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_social_profile')
    .upsert({ private: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}

/** Nothing shared at all — what an account with every toggle off publishes. */
export const NOTHING_PUBLISHED: PublishedProfile = {
  display_name: null,
  streak: null,
  last_logged: null,
  calorie_pct: null,
  water_pct: null,
  step_pct: null,
  protein_pct: null,
  carbs_pct: null,
  fat_pct: null,
  calories: null,
  calorie_goal: null,
  water_ml: null,
  water_goal_ml: null,
  steps: null,
  step_goal: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  exercise: null,
  exercise_calories: null,
}

/**
 * Publishes the summary.
 *
 * `private` is deliberately absent from the payload. PostgREST writes only the
 * columns it is handed, so the flag survives an upsert from here — which
 * matters, because this runs on every diary change and the sharing screen must
 * not be undone by logging lunch.
 *
 * Sharing nothing writes `NOTHING_PUBLISHED` rather than deleting the row.
 * Deleting it would look tidier and would quietly take `private` with it, so
 * an account that switched everything off and then switched one thing back on
 * would come back public without ever being asked.
 */
export async function publishProfile(fields: PublishedProfile): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_social_profile')
    .upsert({ ...fields, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}
