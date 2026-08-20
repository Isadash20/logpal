import { requireClient } from '../lib/supabase'

/**
 * Nudges: one emoji, from one person to another.
 *
 * The smallest thing that still counts as encouragement. There is no message
 * body on purpose. A text field is a moderation problem and an inbox to
 * manage, while a clap is unambiguous, takes one tap and cannot be argued
 * with.
 *
 * Who may send is decided by the database, not here: the insert policy checks
 * that an accepted follow exists, so a stranger cannot reach someone by
 * calling this with their id.
 */

/**
 * What can be sent.
 *
 * Emoji alone, with no wording attached. A clap already means what it means,
 * and the labels underneath ("Nice work", "Still time") turned five taps into
 * five sentences someone had to read before choosing.
 */
export const NUDGES = ['👏', '💪', '🔥', '🎉', '🫡', '🤔'] as const

export interface Nudge {
  id: string
  emoji: string
  createdAt: string
  /** The sender's handle, or null if their username row has gone. */
  from: string | null
  fromUserId: string
  seen: boolean
}

interface NudgeRow {
  id: string
  sender: string
  recipient: string
  emoji: string
  created_at: string
  seen: boolean
}

export async function sendNudge(recipient: string, emoji: string): Promise<void> {
  const { error } = await requireClient()
    .from('logpal_nudges')
    .insert({ recipient, emoji })
  if (error) throw error
}

/**
 * Everything sent to this account in the last week, newest first.
 *
 * A window rather than everything: this is a "look what happened while you
 * were away" list, and a clap from March is not that.
 */
export async function fetchNudges(me: string): Promise<Nudge[]> {
  const db = requireClient()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('logpal_nudges')
    .select('*')
    .eq('recipient', me)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error

  const rows = (data ?? []) as NudgeRow[]
  if (!rows.length) return []

  /* Handles come from the world-readable username table rather than a join:
     there is no foreign key between these two, so PostgREST cannot embed
     one in the other. */
  const senders = [...new Set(rows.map((r) => r.sender))]
  const { data: names } = await db
    .from('logpal_usernames')
    .select('user_id, username')
    .in('user_id', senders)
  const byId = new Map((names ?? []).map((n) => [n.user_id as string, n.username as string]))

  return rows.map((r) => ({
    id: r.id,
    emoji: r.emoji,
    createdAt: r.created_at,
    from: byId.get(r.sender) ?? null,
    fromUserId: r.sender,
    seen: r.seen,
  }))
}

/** Marks nudges read once they have actually been shown. */
export async function markNudgesSeen(ids: string[]): Promise<void> {
  if (!ids.length) return
  const { error } = await requireClient()
    .from('logpal_nudges')
    .update({ seen: true })
    .in('id', ids)
  if (error) throw error
}
