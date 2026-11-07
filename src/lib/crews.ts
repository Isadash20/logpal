/**
 * Crews, the parts that need no network: invite codes and links, the
 * leaderboard's points, the achievements, and what state a challenge is in.
 *
 * The leaderboard is built from what each member publishes to their social
 * profile (the same week_* counts the Friends race uses), so a member who
 * shares nothing scores nothing. That is the rule everywhere in LogPal:
 * nobody's figures leave their device without their say.
 */
import { diffDays, today } from './dates'

/* ------------------------------------------------------------- invites -- */

/** No 0/O/1/I: the code is read aloud and typed as often as it is tapped. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeInviteCode(random: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < 8; i++) out += ALPHABET[Math.floor(random() * ALPHABET.length)]
  return out
}

export const INVITE_CODE = /^[A-Z2-9]{8}$/

/**
 * The code in an invite, if there is one. Accepts the full link, the path
 * alone, the custom scheme the app registers, and a bare code pasted from a
 * message, since people forward all four.
 */
export function parseInvite(text: string): string | null {
  const t = text.trim()
  const m = /(?:^|\/)join\/([A-Za-z0-9]{8})(?:[/?#]|$)/.exec(t)
  const raw = m ? m[1] : t
  const code = raw.toUpperCase()
  return INVITE_CODE.test(code) ? code : null
}

export function inviteLink(code: string, origin = typeof location !== 'undefined' ? location.origin : 'https://logpal-two.vercel.app'): string {
  return `${origin}/join/${code}`
}

/** The message that goes into WhatsApp or iMessage with the link. */
export function inviteMessage(crewName: string, code: string, challenge?: string | null): string {
  const what = challenge ? `${challenge} with the ${crewName} crew` : `my ${crewName} crew`
  return `Join ${what} on LogPal! ${inviteLink(code)}`
}

/* ---------------------------------------------------------- challenges -- */

export type ChallengeState = 'upcoming' | 'active' | 'ended'

export function challengeState(starts: string, ends: string, on = today()): ChallengeState {
  if (on < starts) return 'upcoming'
  if (on > ends) return 'ended'
  return 'active'
}

/** "3 days left", "starts in 2 days", "ended". */
export function challengeWhen(starts: string, ends: string, on = today()): string {
  const state = challengeState(starts, ends, on)
  if (state === 'upcoming') {
    const n = diffDays(starts, on)
    return n === 1 ? 'starts tomorrow' : `starts in ${n} days`
  }
  if (state === 'ended') return 'ended'
  const left = diffDays(ends, on)
  return left === 0 ? 'last day' : left === 1 ? '1 day left' : `${left} days left`
}

/* ---------------------------------------------------------- leaderboard -- */

/** What one member publishes this week. Null means not shared. */
export interface MemberWeek {
  userId: string
  loggedDays: number | null
  calorieDays: number | null
  waterDays: number | null
  stepDays: number | null
  steps: number | null
  streak: number | null
  /** Posts and kudos given this week, from the crew's own tables. */
  posts: number
  kudos: number
}

export interface Standing {
  userId: string
  points: number
  /** The one line under the name: what earned the points. */
  detail: string
  shared: boolean
}

/**
 * Participation, not perfection: a logged day is worth two points, every
 * goal met is one, and saying something to the crew is one (capped, so the
 * chat cannot be farmed). Someone who logs five days and hits water twice
 * sits above someone who logged twice but hit every goal those days.
 */
export function points(m: MemberWeek): number {
  const logged = (m.loggedDays ?? 0) * 2
  const goals = (m.calorieDays ?? 0) + (m.waterDays ?? 0) + (m.stepDays ?? 0)
  const social = Math.min(5, m.posts + m.kudos)
  return logged + goals + social
}

export function standings(members: MemberWeek[]): Standing[] {
  return members
    .map((m) => {
      const bits: string[] = []
      if (m.loggedDays !== null) bits.push(`${m.loggedDays} logged`)
      const goals = (m.calorieDays ?? 0) + (m.waterDays ?? 0) + (m.stepDays ?? 0)
      if (goals) bits.push(`${goals} goal${goals === 1 ? '' : 's'} hit`)
      const social = m.posts + m.kudos
      if (social) bits.push(`${social} cheer${social === 1 ? '' : 's'}`)
      const shared = m.loggedDays !== null || m.calorieDays !== null || m.waterDays !== null || m.stepDays !== null
      return {
        userId: m.userId,
        points: points(m),
        detail: bits.length ? bits.join(' · ') : shared ? 'Quiet week so far' : 'Shares nothing yet',
        shared,
      }
    })
    .sort((a, b) => b.points - a.points)
}
