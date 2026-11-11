import { requireClient } from './supabase'

/** Handles are what other people search for, so keep them plain. */
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/

/** How long a handle is locked after it is claimed or changed. */
export const USERNAME_COOLDOWN_DAYS = 7

export function usernameProblem(name: string): string | null {
  const v = name.trim().toLowerCase()
  if (v.length < 3) return 'Usernames need at least three characters.'
  if (v.length > 20) return 'Usernames can be at most twenty characters.'
  if (!USERNAME_RE.test(v)) {
    return 'Usernames can use letters, numbers, full stops and underscores only.'
  }
  return null
}

/**
 * True when the handle is already someone's.
 *
 * Only an early warning. The database's case-insensitive unique index is what
 * actually guarantees it, and two people racing for the same handle are settled
 * there, not here.
 */
export async function usernameTaken(handle: string): Promise<boolean> {
  const { data, error } = await requireClient()
    .from('logpal_usernames')
    .select('username')
    .ilike('username', handle.trim().toLowerCase())
    .maybeSingle()
  if (error) throw error
  return data !== null
}

/** When the handle may next be changed, given when it was last set. */
export function usernameUnlocksAt(changedAt: string | Date): Date {
  const t = new Date(changedAt).getTime()
  return new Date(t + USERNAME_COOLDOWN_DAYS * 86400000)
}

export function usernameLocked(changedAt: string | Date | null | undefined, now = new Date()): boolean {
  if (!changedAt) return false
  return usernameUnlocksAt(changedAt).getTime() > now.getTime()
}

export function formatUnlockDate(d: Date, locale?: string): string {
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
}
