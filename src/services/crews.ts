import { requireClient } from '../lib/supabase'
import { makeInviteCode, type ChallengeKind } from '../lib/crews'
import { hydrate, type Person } from './social'

/**
 * Crews: the network half. The tables and their policies are in
 * `supabase/schema.sql` under "crews"; the pure rules (points, badges, the
 * invite code) are in `lib/crews.ts`.
 *
 * Everything a member sees of another member comes from that member's own
 * published social profile, through `hydrate`, exactly as it does on the
 * Friends tab. A crew widens who may read a profile (crew mates, as well as
 * followers); it does not widen what is in it.
 */

/* ------------------------------------------------------------------ types -- */

export type Visibility = 'private' | 'public'

export interface Crew {
  id: string
  name: string
  emoji: string
  visibility: Visibility
  inviteCode: string
  owner: string
  createdAt: string
}

export interface CrewCard extends Crew {
  members: number
  /** Title of the challenge that is running or next, if any. */
  challenge: string | null
}

export interface Member {
  person: Person
  role: 'owner' | 'member'
  joinedAt: string
}

export interface Challenge {
  id: string
  crewId: string
  kind: ChallengeKind
  title: string
  starts: string
  ends: string
  createdBy: string
}

export type PostKind = 'chat' | 'milestone' | 'cheer'

export interface Post {
  id: string
  userId: string
  kind: PostKind
  body: string
  createdAt: string
  /** emoji → user ids who gave it. */
  kudos: Record<string, string[]>
}

export interface SharedRecipe {
  recipeId: string
  userId: string
  title: string
  note: string | null
  createdAt: string
}

export interface CrewDetail {
  crew: Crew
  members: Member[]
  challenges: Challenge[]
  posts: Post[]
  recipes: SharedRecipe[]
}

export interface CrewPreview {
  id: string
  name: string
  emoji: string
  visibility: Visibility
  members: number
  challengeTitle: string | null
  challengeKind: ChallengeKind | null
  challengeEnds: string | null
}

/* ------------------------------------------------------------------- rows -- */

interface CrewRow {
  id: string
  name: string
  emoji: string
  visibility: Visibility
  invite_code: string
  owner: string
  created_at: string
}

const toCrew = (r: CrewRow): Crew => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  visibility: r.visibility,
  inviteCode: r.invite_code,
  owner: r.owner,
  createdAt: r.created_at,
})

interface ChallengeRow {
  id: string
  crew_id: string
  kind: ChallengeKind
  title: string
  starts: string
  ends: string
  created_by: string
}

const toChallenge = (r: ChallengeRow): Challenge => ({
  id: r.id,
  crewId: r.crew_id,
  kind: r.kind,
  title: r.title,
  starts: r.starts,
  ends: r.ends,
  createdBy: r.created_by,
})

/* ---------------------------------------------------------------- listing -- */

async function cardsFor(crews: Crew[]): Promise<CrewCard[]> {
  if (!crews.length) return []
  const db = requireClient()
  const ids = crews.map((c) => c.id)
  const today = new Date().toISOString().slice(0, 10)
  const [members, challenges] = await Promise.all([
    db.from('logpal_crew_members').select('crew_id').in('crew_id', ids),
    db
      .from('logpal_crew_challenges')
      .select('crew_id, title, starts')
      .in('crew_id', ids)
      .gte('ends', today)
      .order('starts', { ascending: true }),
  ])
  if (members.error) throw members.error
  if (challenges.error) throw challenges.error

  const count = new Map<string, number>()
  for (const m of (members.data ?? []) as { crew_id: string }[])
    count.set(m.crew_id, (count.get(m.crew_id) ?? 0) + 1)
  const challenge = new Map<string, string>()
  for (const c of (challenges.data ?? []) as { crew_id: string; title: string }[])
    if (!challenge.has(c.crew_id)) challenge.set(c.crew_id, c.title)

  return crews.map((c) => ({
    ...c,
    members: count.get(c.id) ?? 0,
    challenge: challenge.get(c.id) ?? null,
  }))
}

export async function fetchMyCrews(me: string): Promise<CrewCard[]> {
  const db = requireClient()
  const mine = await db.from('logpal_crew_members').select('crew_id').eq('user_id', me)
  if (mine.error) throw mine.error
  const ids = (mine.data ?? []).map((r) => r.crew_id as string)
  if (!ids.length) return []
  const { data, error } = await db.from('logpal_crews').select('*').in('id', ids).order('created_at')
  if (error) throw error
  return cardsFor((data as CrewRow[]).map(toCrew))
}

/** Public crews the signed-in user is not in. */
export async function discoverCrews(me: string): Promise<CrewCard[]> {
  const db = requireClient()
  const [all, mine] = await Promise.all([
    db.from('logpal_crews').select('*').eq('visibility', 'public').order('created_at', { ascending: false }).limit(30),
    db.from('logpal_crew_members').select('crew_id').eq('user_id', me),
  ])
  if (all.error) throw all.error
  if (mine.error) throw mine.error
  const in_ = new Set((mine.data ?? []).map((r) => r.crew_id as string))
  return cardsFor((all.data as CrewRow[]).map(toCrew).filter((c) => !in_.has(c.id)))
}

/* --------------------------------------------------------------- lifecycle -- */

export async function createCrew(input: { name: string; emoji: string; visibility: Visibility }): Promise<Crew> {
  const db = requireClient()
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await db
      .from('logpal_crews')
      .insert({ name: input.name.trim(), emoji: input.emoji, visibility: input.visibility, invite_code: makeInviteCode() })
      .select('*')
      .single()
    if (error) {
      // A code collision is a one in a trillion event, but it costs nothing to
      // try again rather than show someone an error for it.
      if (error.code === '23505' && attempt < 3) continue
      throw error
    }
    const crew = toCrew(data as CrewRow)
    const joined = await db.from('logpal_crew_members').insert({ crew_id: crew.id, role: 'owner' })
    if (joined.error) throw joined.error
    return crew
  }
  throw new Error('Could not make a crew')
}

export async function updateCrew(id: string, patch: Partial<Pick<Crew, 'name' | 'emoji' | 'visibility'>>): Promise<void> {
  const { error } = await requireClient().from('logpal_crews').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCrew(id: string): Promise<void> {
  const { error } = await requireClient().from('logpal_crews').delete().eq('id', id)
  if (error) throw error
}

/** Works signed out: the landing page shows it before asking anyone to sign up. */
export async function previewCrew(code: string): Promise<CrewPreview | null> {
  const { data, error } = await requireClient().rpc('logpal_crew_preview', { code })
  if (error) throw error
  const row = (data as Record<string, unknown>[] | null)?.[0]
  if (!row) return null
  return {
    id: row.id as string,
    name: row.name as string,
    emoji: row.emoji as string,
    visibility: row.visibility as Visibility,
    members: row.members as number,
    challengeTitle: (row.challenge_title as string | null) ?? null,
    challengeKind: (row.challenge_kind as ChallengeKind | null) ?? null,
    challengeEnds: (row.challenge_ends as string | null) ?? null,
  }
}

/** Returns the crew id. Already a member is fine. */
export async function joinCrew(code: string): Promise<string> {
  const { data, error } = await requireClient().rpc('logpal_join_crew', { code })
  if (error) throw error
  return data as string
}

/** Public crews can be joined from Discover without a code. */
export async function joinPublicCrew(crewId: string): Promise<void> {
  const { error } = await requireClient().from('logpal_crew_members').insert({ crew_id: crewId })
  if (error && error.code !== '23505') throw error
}

export async function leaveCrew(crewId: string, userId: string): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_crew_members')
    .delete()
    .eq('crew_id', crewId)
    .eq('user_id', userId)
  if (error) throw error
}

/* ----------------------------------------------------------------- detail -- */

interface MemberRow {
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
}

interface PostRow {
  id: string
  user_id: string
  kind: PostKind
  body: string
  created_at: string
}

interface KudosRow {
  post_id: string
  user_id: string
  emoji: string
}

interface RecipeRow {
  recipe_id: string
  user_id: string
  title: string
  note: string | null
  created_at: string
}

const POST_LIMIT = 120

export async function fetchCrew(crewId: string): Promise<CrewDetail> {
  const db = requireClient()
  const [crew, members, challenges, posts, recipes] = await Promise.all([
    db.from('logpal_crews').select('*').eq('id', crewId).single(),
    db.from('logpal_crew_members').select('user_id, role, joined_at').eq('crew_id', crewId).order('joined_at'),
    db.from('logpal_crew_challenges').select('*').eq('crew_id', crewId).order('starts', { ascending: false }),
    db
      .from('logpal_crew_posts')
      .select('id, user_id, kind, body, created_at')
      .eq('crew_id', crewId)
      .order('created_at', { ascending: false })
      .limit(POST_LIMIT),
    db.from('logpal_crew_recipes').select('recipe_id, user_id, title, note, created_at').eq('crew_id', crewId).order('created_at', { ascending: false }),
  ])
  for (const r of [crew, members, challenges, posts, recipes]) if (r.error) throw r.error

  const memberRows = (members.data ?? []) as MemberRow[]
  const people = await hydrate(memberRows.map((m) => m.user_id))

  const postRows = ((posts.data ?? []) as PostRow[]).reverse()
  const kudosById = new Map<string, Record<string, string[]>>()
  if (postRows.length) {
    const k = await db
      .from('logpal_crew_kudos')
      .select('post_id, user_id, emoji')
      .in('post_id', postRows.map((p) => p.id))
    if (k.error) throw k.error
    for (const row of (k.data ?? []) as KudosRow[]) {
      const bucket = kudosById.get(row.post_id) ?? {}
      ;(bucket[row.emoji] ??= []).push(row.user_id)
      kudosById.set(row.post_id, bucket)
    }
  }

  return {
    crew: toCrew(crew.data as CrewRow),
    members: memberRows
      .map((m) => {
        const person = people.get(m.user_id)
        return person ? { person, role: m.role, joinedAt: m.joined_at } : null
      })
      .filter((m): m is Member => m !== null),
    challenges: ((challenges.data ?? []) as ChallengeRow[]).map(toChallenge),
    posts: postRows.map((p) => ({
      id: p.id,
      userId: p.user_id,
      kind: p.kind,
      body: p.body,
      createdAt: p.created_at,
      kudos: kudosById.get(p.id) ?? {},
    })),
    recipes: ((recipes.data ?? []) as RecipeRow[]).map((r) => ({
      recipeId: r.recipe_id,
      userId: r.user_id,
      title: r.title,
      note: r.note,
      createdAt: r.created_at,
    })),
  }
}

/* ------------------------------------------------------------------ posts -- */

export async function postToCrew(crewId: string, body: string, kind: PostKind = 'chat'): Promise<void> {
  const text = body.trim().slice(0, 500)
  if (!text) return
  const { error } = await requireClient().from('logpal_crew_posts').insert({ crew_id: crewId, body: text, kind })
  if (error) throw error
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await requireClient().from('logpal_crew_posts').delete().eq('id', id)
  if (error) throw error
}

export async function giveKudos(postId: string, emoji: string): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_crew_kudos')
    .upsert({ post_id: postId, emoji }, { onConflict: 'post_id,user_id' })
  if (error) throw error
}

export async function takeBackKudos(postId: string, userId: string): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_crew_kudos')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId)
  if (error) throw error
}

/**
 * Something worth telling every crew you are in, posted by your own client:
 * a PR, a streak. Fails quietly, because a milestone is never worth an error
 * dialog over the thing that earned it.
 */
export async function announce(me: string, body: string): Promise<void> {
  try {
    const db = requireClient()
    const mine = await db.from('logpal_crew_members').select('crew_id').eq('user_id', me)
    if (mine.error || !mine.data?.length) return
    await db
      .from('logpal_crew_posts')
      .insert(mine.data.map((r) => ({ crew_id: r.crew_id as string, body: body.slice(0, 500), kind: 'milestone' })))
  } catch {
    /* see above */
  }
}

/* ------------------------------------------------------------- challenges -- */

export async function createChallenge(input: {
  crewId: string
  kind: ChallengeKind
  title: string
  starts: string
  ends: string
}): Promise<void> {
  const { error } = await requireClient().from('logpal_crew_challenges').insert({
    crew_id: input.crewId,
    kind: input.kind,
    title: input.title.trim(),
    starts: input.starts,
    ends: input.ends,
  })
  if (error) throw error
}

export async function deleteChallenge(id: string): Promise<void> {
  const { error } = await requireClient().from('logpal_crew_challenges').delete().eq('id', id)
  if (error) throw error
}

/* ---------------------------------------------------------------- recipes -- */

export async function shareRecipe(crewId: string, recipeId: string, title: string, note?: string): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_crew_recipes')
    .upsert({ crew_id: crewId, recipe_id: recipeId, title, note: note?.trim() || null }, { onConflict: 'crew_id,recipe_id' })
  if (error) throw error
}

export async function unshareRecipe(crewId: string, recipeId: string): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_crew_recipes')
    .delete()
    .eq('crew_id', crewId)
    .eq('recipe_id', recipeId)
  if (error) throw error
}
