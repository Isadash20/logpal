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

/* --------------------------------------------------------- achievements -- */

export interface Achievement {
  id: string
  title: string
  detail: string
  emoji: string
  /** Team badges belong to the crew; the rest are the signed-in member's. */
  team: boolean
  earned: boolean
}

export interface CrewFacts {
  memberCount: number
  members: MemberWeek[]
  me: MemberWeek | null
  /** Days since the crew was made. */
  ageDays: number
  recipesShared: number
  challengesRun: number
}

/**
 * A handful, each with a clear line to cross. Unearned ones are shown too,
 * greyed: a badge nobody can see coming is not something anyone aims for.
 */
export function achievements(f: CrewFacts): Achievement[] {
  const sharing = f.members.filter((m) => m.loggedDays !== null)
  const everyoneLogged = sharing.length > 1 && sharing.every((m) => (m.loggedDays ?? 0) >= 1)
  const fullWeek = sharing.length > 1 && sharing.every((m) => (m.loggedDays ?? 0) >= 7)
  const crewSteps = f.members.reduce((s, m) => s + (m.steps ?? 0), 0)
  const stepDays = f.members.reduce((s, m) => s + (m.stepDays ?? 0), 0)
  const me = f.me
  return [
    {
      id: 'founded',
      title: 'Crew assembled',
      detail: 'Three or more members',
      emoji: '🤝',
      team: true,
      earned: f.memberCount >= 3,
    },
    {
      id: 'roll-call',
      title: 'Roll call',
      detail: 'Everyone logged this week',
      emoji: '📣',
      team: true,
      earned: everyoneLogged,
    },
    {
      id: 'clean-sweep',
      title: 'Clean sweep',
      detail: 'Everyone logged all seven days',
      emoji: '🧹',
      team: true,
      earned: fullWeek,
    },
    {
      id: 'hundred-k',
      title: '100k together',
      detail: '100,000 crew steps in a week',
      emoji: '👟',
      team: true,
      earned: crewSteps >= 100_000,
    },
    {
      id: 'twenty-step-days',
      title: 'Twenty step days',
      detail: '20 step goals hit across the crew',
      emoji: '🥾',
      team: true,
      earned: stepDays >= 20,
    },
    {
      id: 'first-challenge',
      title: 'Game on',
      detail: 'Ran a challenge',
      emoji: '🏁',
      team: true,
      earned: f.challengesRun >= 1,
    },
    {
      id: 'cookbook',
      title: 'Crew cookbook',
      detail: 'Five recipes shared',
      emoji: '📖',
      team: true,
      earned: f.recipesShared >= 5,
    },
    {
      id: 'week-logged',
      title: 'Every day',
      detail: 'You logged all seven days',
      emoji: '📆',
      team: false,
      earned: (me?.loggedDays ?? 0) >= 7,
    },
    {
      id: 'streak-7',
      title: 'One week streak',
      detail: '7 days in a row',
      emoji: '🔥',
      team: false,
      earned: (me?.streak ?? 0) >= 7,
    },
    {
      id: 'streak-30',
      title: 'One month streak',
      detail: '30 days in a row',
      emoji: '🌟',
      team: false,
      earned: (me?.streak ?? 0) >= 30,
    },
    {
      id: 'hydrated',
      title: 'Hydrated',
      detail: 'Water goal five days this week',
      emoji: '💧',
      team: false,
      earned: (me?.waterDays ?? 0) >= 5,
    },
    {
      id: 'cheerleader',
      title: 'Cheerleader',
      detail: 'Gave five kudos',
      emoji: '👏',
      team: false,
      earned: (me?.kudos ?? 0) >= 5,
    },
  ]
}
