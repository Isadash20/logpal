import { requireClient } from '../lib/supabase'
import type { ChallengeKind, DayRow } from '../lib/challenges'

/**
 * Challenges on the server: `logpal_challenges`, who is lined up in each
 * (`logpal_challenge_members`), and the per-day numbers they are scored
 * from (`logpal_social_days`). SQL is the "challenges" block of
 * supabase/schema.sql.
 */

export type MemberStatus = 'invited' | 'in' | 'declined'

export interface ChallengeMember {
  userId: string
  status: MemberStatus
  invitedBy: string | null
}

export interface Challenge {
  id: string
  kind: ChallengeKind
  title: string
  starts: string
  ends: string
  /** Set for a crew-wide challenge; null for one between friends. */
  crewId: string | null
  createdBy: string
  createdAt: string
  members: ChallengeMember[]
}

interface ChallengeRow {
  id: string
  kind: ChallengeKind
  title: string
  starts: string
  ends: string
  crew_id: string | null
  created_by: string
  created_at: string
}

interface MemberRow {
  challenge_id: string
  user_id: string
  status: MemberStatus
  invited_by: string | null
}

async function withMembers(rows: ChallengeRow[]): Promise<Challenge[]> {
  if (rows.length === 0) return []
  const db = requireClient()
  const { data, error } = await db
    .from('logpal_challenge_members')
    .select('challenge_id, user_id, status, invited_by')
    .in('challenge_id', rows.map((r) => r.id))
  if (error) throw error
  const by = new Map<string, ChallengeMember[]>()
  for (const m of (data ?? []) as MemberRow[]) {
    const list = by.get(m.challenge_id) ?? []
    list.push({ userId: m.user_id, status: m.status, invitedBy: m.invited_by })
    by.set(m.challenge_id, list)
  }
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    starts: r.starts,
    ends: r.ends,
    crewId: r.crew_id,
    createdBy: r.created_by,
    createdAt: r.created_at,
    members: by.get(r.id) ?? [],
  }))
}

/** Every challenge this account can see: its own, invites, and its crews'. */
export async function fetchMyChallenges(): Promise<Challenge[]> {
  const { data, error } = await requireClient().from('logpal_challenges').select('*').order('ends', { ascending: false })
  if (error) throw error
  return withMembers((data ?? []) as ChallengeRow[])
}

export async function fetchCrewChallenges(crewId: string): Promise<Challenge[]> {
  const { data, error } = await requireClient().from('logpal_challenges').select('*').eq('crew_id', crewId).order('ends', { ascending: false })
  if (error) throw error
  return withMembers((data ?? []) as ChallengeRow[])
}

export async function fetchChallenge(id: string): Promise<Challenge> {
  const { data, error } = await requireClient().from('logpal_challenges').select('*').eq('id', id).single()
  if (error) throw error
  const [c] = await withMembers([data as ChallengeRow])
  return c
}

/**
 * Starts one. Friends are lined up as invited and must accept; a crew
 * challenge puts every current member in at once, Apple-style for a group.
 */
export async function createChallenge(input: {
  me: string
  kind: ChallengeKind
  title: string
  starts: string
  ends: string
  crewId?: string | null
  invitees?: string[]
}): Promise<Challenge> {
  const db = requireClient()
  const { data, error } = await db
    .from('logpal_challenges')
    .insert({ kind: input.kind, title: input.title, starts: input.starts, ends: input.ends, crew_id: input.crewId ?? null })
    .select('*')
    .single()
  if (error) throw error
  const row = data as ChallengeRow
  let members: { challenge_id: string; user_id: string; status: MemberStatus; invited_by: string }[]
  if (input.crewId) {
    const crew = await db.from('logpal_crew_members').select('user_id').eq('crew_id', input.crewId)
    if (crew.error) throw crew.error
    members = (crew.data ?? []).map((m: { user_id: string }) => ({ challenge_id: row.id, user_id: m.user_id, status: 'in' as const, invited_by: input.me }))
    if (!members.some((m) => m.user_id === input.me)) members.push({ challenge_id: row.id, user_id: input.me, status: 'in', invited_by: input.me })
  } else {
    members = [
      { challenge_id: row.id, user_id: input.me, status: 'in', invited_by: input.me },
      ...(input.invitees ?? []).filter((id) => id !== input.me).map((id) => ({ challenge_id: row.id, user_id: id, status: 'invited' as const, invited_by: input.me })),
    ]
  }
  const ins = await db.from('logpal_challenge_members').insert(members)
  if (ins.error) throw ins.error
  const [c] = await withMembers([row])
  return c
}

/** Accept or decline an invite. */
export async function respond(id: string, me: string, status: 'in' | 'declined'): Promise<void> {
  const { error } = await requireClient().from('logpal_challenge_members').update({ status }).eq('challenge_id', id).eq('user_id', me)
  if (error) throw error
}

/** A crew-mate joining a crew challenge that started before they arrived. */
export async function joinChallenge(id: string, me: string): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_challenge_members')
    .upsert({ challenge_id: id, user_id: me, status: 'in' }, { onConflict: 'challenge_id,user_id' })
  if (error) throw error
}

export async function leaveChallenge(id: string, me: string): Promise<void> {
  const { error } = await requireClient().from('logpal_challenge_members').delete().eq('challenge_id', id).eq('user_id', me)
  if (error) throw error
}

export async function deleteChallenge(id: string): Promise<void> {
  const { error } = await requireClient().from('logpal_challenges').delete().eq('id', id)
  if (error) throw error
}

/** Invites waiting on this account, for the badge on Connect. */
export async function pendingChallengeCount(me: string): Promise<number> {
  const { count, error } = await requireClient()
    .from('logpal_challenge_members')
    .select('challenge_id', { count: 'exact', head: true })
    .eq('user_id', me)
    .eq('status', 'invited')
  if (error) throw error
  return count ?? 0
}

/** Everyone's published days in a window, keyed by user. */
export async function fetchDays(userIds: string[], starts: string, ends: string): Promise<Map<string, DayRow[]>> {
  const out = new Map<string, DayRow[]>()
  if (userIds.length === 0) return out
  const { data, error } = await requireClient()
    .from('logpal_social_days')
    .select('user_id, day, steps, water_ml')
    .in('user_id', userIds)
    .gte('day', starts)
    .lte('day', ends)
  if (error) throw error
  for (const r of (data ?? []) as { user_id: string; day: string; steps: number | null; water_ml: number | null }[]) {
    const list = out.get(r.user_id) ?? []
    list.push({ day: r.day, steps: r.steps, waterMl: r.water_ml })
    out.set(r.user_id, list)
  }
  return out
}

/** The client's own recent days, pushed whenever they change. */
export async function publishDays(rows: { day: string; steps: number | null; water_ml: number | null }[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await requireClient()
    .from('logpal_social_days')
    .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'user_id,day' })
  if (error) throw error
}
