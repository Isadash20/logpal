import { addDays, today } from './dates'

/**
 * Challenges, the way Apple Fitness runs them: two or more people, one
 * number, a date range, and whoever has the biggest total when it ends
 * wins. Steps and water for now. The totals come from the day rows each
 * person publishes (`logpal_social_days`), so a person who shares neither
 * shows as "not sharing" rather than as zero.
 */
export type ChallengeKind = 'steps' | 'water'

export const KINDS: { kind: ChallengeKind; label: string; emoji: string; blurb: string }[] = [
  { kind: 'steps', label: 'Steps', emoji: '👟', blurb: 'Most steps walked by the end wins.' },
  { kind: 'water', label: 'Water', emoji: '💧', blurb: 'Most water drunk by the end wins.' },
]

export function kindOf(kind: ChallengeKind) {
  return KINDS.find((k) => k.kind === kind) ?? KINDS[0]
}

export function suggestedTitle(kind: ChallengeKind, days: number): string {
  return `${days}-Day ${kindOf(kind).label} Challenge`
}

/** One person's published day. Null means nothing published for that day. */
export interface DayRow {
  day: string
  steps: number | null
  waterMl: number | null
}

/** The number a challenge scores from one day row. */
export function dayScore(kind: ChallengeKind, row: DayRow | undefined): number | null {
  if (!row) return null
  return kind === 'steps' ? row.steps : row.waterMl
}

/** The days a challenge has covered so far, oldest first. */
export function daysSoFar(starts: string, ends: string, on = today()): string[] {
  const last = ends < on ? ends : on
  const out: string[] = []
  for (let d = starts; d <= last; d = addDays(d, 1)) out.push(d)
  return out
}

export interface Score {
  userId: string
  /** Null when the person has published nothing in the window. */
  total: number | null
  /** Days with a value, for "4 of 7 days". */
  days: number
}

/** Totals over the window so far, best first, people sharing nothing last. */
export function scores(kind: ChallengeKind, members: string[], rows: Map<string, DayRow[]>, starts: string, ends: string, on = today()): Score[] {
  const window = new Set(daysSoFar(starts, ends, on))
  return members
    .map((userId) => {
      let total: number | null = null
      let days = 0
      for (const r of rows.get(userId) ?? []) {
        if (!window.has(r.day)) continue
        const n = dayScore(kind, r)
        if (n === null) continue
        total = (total ?? 0) + n
        days += 1
      }
      return { userId, total, days }
    })
    .sort((a, b) => (b.total ?? -1) - (a.total ?? -1))
}

/** The two-person framing: you against them. Null when it is not a duel. */
export function duel(me: string, list: Score[]): { you: Score; them: Score } | null {
  if (list.length !== 2) return null
  const you = list.find((s) => s.userId === me)
  const them = list.find((s) => s.userId !== me)
  return you && them ? { you, them } : null
}

/** "Leading by 1,240" / "Behind by 300" / "Tied", from your point of view. */
export function margin(you: Score, them: Score, format: (n: number) => string): string {
  if (you.total === null) return 'Not sharing yet'
  if (them.total === null) return 'Waiting on them'
  const d = you.total - them.total
  if (d === 0) return 'Tied'
  return d > 0 ? `Leading by ${format(d)}` : `Behind by ${format(-d)}`
}
