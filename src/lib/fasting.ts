import type { FastProtocol, FastProtocolDef, FastSession, FastingSettings } from '../types'

/**
 * Intermittent fasting.
 *
 * A fast is a start timestamp plus a target length. Everything else — progress,
 * streaks, whether you're currently eating — is derived, so there is no state
 * to keep in sync and a fast survives the app being closed.
 */

export const FAST_PROTOCOLS: FastProtocolDef[] = [
  {
    key: '12:12',
    label: '12:12',
    fastHours: 12,
    description: 'Fast 12 hours, eat 12. Roughly overnight — the gentlest start.',
  },
  {
    key: '14:10',
    label: '14:10',
    fastHours: 14,
    description: 'Fast 14 hours, eat 10. A common first step beyond overnight.',
  },
  {
    key: '16:8',
    label: '16:8',
    fastHours: 16,
    description: 'Fast 16 hours, eat 8. The most widely used schedule.',
  },
  {
    key: '18:6',
    label: '18:6',
    fastHours: 18,
    description: 'Fast 18 hours, eat 6. A tighter window, usually two meals.',
  },
  {
    key: '20:4',
    label: '20:4',
    fastHours: 20,
    description: 'Fast 20 hours, eat 4. Demanding — one large meal and a snack.',
  },
  {
    key: 'omad',
    label: 'OMAD',
    fastHours: 23,
    description: 'One meal a day. Hard to hit protein and micronutrient targets.',
  },
  {
    key: 'custom',
    label: 'Custom',
    fastHours: 16,
    description: 'Set your own fasting length.',
  },
]

export const PROTOCOL_BY_KEY = Object.fromEntries(
  FAST_PROTOCOLS.map((p) => [p.key, p])
) as Record<FastProtocol, FastProtocolDef>

export function targetHoursFor(s: FastingSettings): number {
  return s.protocol === 'custom'
    ? Math.min(36, Math.max(1, s.customFastHours))
    : PROTOCOL_BY_KEY[s.protocol].fastHours
}

export function activeFast(fasts: FastSession[]): FastSession | undefined {
  return fasts.find((f) => !f.endedAt)
}

export function fastElapsedMs(f: FastSession, now = Date.now()): number {
  return Math.max(0, (f.endedAt ?? now) - f.startedAt)
}

export function fastProgress(f: FastSession, now = Date.now()): number {
  const target = f.targetHours * 3_600_000
  return target > 0 ? fastElapsedMs(f, now) / target : 0
}

/** "16h 04m" — the timer readout. Seconds only appear under an hour. */
export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function formatClock(ts: number): string {
  return new Date(ts)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
}

/** Completed fasts only — an in-progress one hasn't earned a result yet. */
export function completedFasts(fasts: FastSession[]): FastSession[] {
  return fasts.filter((f) => f.endedAt).sort((a, b) => b.startedAt - a.startedAt)
}

export interface FastStats {
  total: number
  hitTarget: number
  longestMs: number
  averageMs: number
  streak: number
}

/**
 * Streak counts consecutive calendar days ending today or yesterday that
 * contain a fast which reached its target. Allowing yesterday means the streak
 * doesn't visibly break just because today's fast is still running.
 */
export function fastStats(fasts: FastSession[], now = Date.now()): FastStats {
  const done = completedFasts(fasts)
  if (done.length === 0) {
    return { total: 0, hitTarget: 0, longestMs: 0, averageMs: 0, streak: 0 }
  }

  const durations = done.map((f) => fastElapsedMs(f))
  const hit = done.filter((f) => fastElapsedMs(f) >= f.targetHours * 3_600_000)

  const dayKey = (ts: number) => new Date(ts).toDateString()
  const successDays = new Set(hit.map((f) => dayKey(f.endedAt!)))

  let streak = 0
  const cursor = new Date(now)
  if (!successDays.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  for (let i = 0; i < 400; i++) {
    if (!successDays.has(dayKey(cursor.getTime()))) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return {
    total: done.length,
    hitTarget: hit.length,
    longestMs: Math.max(...durations),
    averageMs: durations.reduce((s, d) => s + d, 0) / durations.length,
    streak,
  }
}

/**
 * When the current fast is due to end, and when the eating window then closes.
 * Used for the schedule preview so the numbers aren't abstract.
 */
export function windowFor(f: FastSession) {
  const ends = f.startedAt + f.targetHours * 3_600_000
  const eatHours = Math.max(0, 24 - f.targetHours)
  return { endsAt: ends, eatingClosesAt: ends + eatHours * 3_600_000, eatHours }
}

export function defaultFastingSettings(): FastingSettings {
  return {
    enabled: false,
    protocol: '16:8',
    customFastHours: 16,
    eatingWindowStartHour: 12,
  }
}

/* ----------------------------------------------------- recommendations -- */

export interface FastRecommendation {
  protocol: FastProtocol
  /** Why this one, in the user's terms. */
  reason: string
  /** Suggested local hour to open the eating window. */
  eatingStartHour: number
}

/**
 * Suggest a protocol from the goal.
 *
 * Fasting helps by shrinking the window in which it's easy to overeat, so a
 * deficit gets a tighter window than a surplus. Building muscle gets the
 * loosest, because a short window makes hitting a protein target genuinely
 * hard — and where the two aims conflict, protein wins.
 */
export function recommendFast(opts: {
  goalKind: 'lose-weight' | 'gain-muscle' | 'maintain' | 'recomp'
  rate: number
}): FastRecommendation {
  if (opts.goalKind === 'gain-muscle') {
    return {
      protocol: '12:12',
      reason:
        'A wide eating window. Building muscle needs both the calories and the protein, and a short window makes hitting either harder.',
      eatingStartHour: 8,
    }
  }
  if (opts.goalKind === 'maintain') {
    return {
      protocol: '14:10',
      reason: 'Roughly overnight plus a couple of hours — easy to hold indefinitely.',
      eatingStartHour: 10,
    }
  }
  if (opts.goalKind === 'recomp') {
    return {
      protocol: '16:8',
      reason:
        'Tight enough to keep a mild deficit honest, wide enough to fit the protein a recomp needs.',
      eatingStartHour: 12,
    }
  }
  // Losing: the steeper the target, the tighter the window.
  if (opts.rate <= -1.5) {
    return {
      protocol: '18:6',
      reason:
        'A steep deficit needs a tight window. Six hours makes it much harder to drift over your calories in the evening.',
      eatingStartHour: 12,
    }
  }
  if (opts.rate <= -1) {
    return {
      protocol: '16:8',
      reason:
        'The most widely used schedule, and enough structure to keep a moderate deficit on track.',
      eatingStartHour: 12,
    }
  }
  return {
    protocol: '14:10',
    reason: 'A gentle start — skip breakfast or eat dinner earlier, nothing drastic.',
    eatingStartHour: 10,
  }
}
