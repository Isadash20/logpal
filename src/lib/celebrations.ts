import type { DayLog, FastSession, Nutrients, Profile } from '../types'

/**
 * Which goals have just been met, and which of those have already been
 * cheered for.
 *
 * A goal met is worth a moment, once. Water, steps, sleep, calories, the
 * three macros together, a completed fast, a completed diary: each is a key
 * per day, remembered in localStorage so reopening the app does not throw
 * the same confetti twice. Reaching the goal weight is the big one, kept
 * under its own key against the target it was for, so it fires once per
 * target, not once per day.
 *
 * The check runs on every change to the day and every time the app comes to
 * the front. A goal reached while the phone was in a pocket (a fast ticking
 * over, water logged on the other device) is cheered at the next opening,
 * which is the first chance there is.
 */
export type GoalKey = 'calories' | 'macros' | 'water' | 'steps' | 'sleep' | 'fasting' | 'diary' | 'weight'

export interface Achievement {
  key: GoalKey
  /** Stable identity, so it is celebrated once. */
  id: string
  title: string
  detail: string
  /** The goal-weight moment: flames as well as confetti, and it waits to be tapped. */
  big?: boolean
}

export interface DayState {
  date: string
  consumed: number
  /** Calorie goal with any exercise credit already added. */
  goal: number
  nutrients: Nutrients
  macroTargets: { protein: number; carbs: number; fat: number }
  log: DayLog
  waterTarget: number
  /** "8 cups", in the user's unit, for the card. */
  waterText: string
  profile: Pick<Profile, 'stepGoal' | 'sleepGoalMin' | 'currentWeight' | 'goalWeight' | 'startWeight' | 'goal'>
  fasts: FastSession[]
  now: number
  /** "160 lb", for the card. */
  weightText: string
}

function hours(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return m ? `${h}h ${m}m` : `${h}h`
}

export function achievementsFor(s: DayState): Achievement[] {
  const out: Achievement[] = []
  const d = s.date

  if (s.goal > 0 && s.consumed >= s.goal * 0.95 && s.consumed <= s.goal * 1.05) {
    out.push({
      key: 'calories',
      id: `${d}:calories`,
      title: 'Calorie goal hit',
      detail: `${Math.round(s.consumed)} of ${Math.round(s.goal)} cal, right on target.`,
    })
  }

  const m = s.macroTargets
  if (
    m.protein > 0 &&
    s.nutrients.protein >= m.protein &&
    s.nutrients.carbs >= m.carbs &&
    s.nutrients.fat >= m.fat
  ) {
    out.push({
      key: 'macros',
      id: `${d}:macros`,
      title: 'All three macros met',
      detail: `${Math.round(s.nutrients.protein)} g protein, ${Math.round(s.nutrients.carbs)} g carbs, ${Math.round(s.nutrients.fat)} g fat.`,
    })
  }

  if (s.waterTarget > 0 && s.log.water >= s.waterTarget) {
    out.push({ key: 'water', id: `${d}:water`, title: 'Water goal reached', detail: `${s.waterText} today.` })
  }

  if (s.profile.stepGoal > 0 && (s.log.steps ?? 0) >= s.profile.stepGoal) {
    out.push({
      key: 'steps',
      id: `${d}:steps`,
      title: 'Step goal reached',
      detail: `${(s.log.steps ?? 0).toLocaleString()} steps.`,
    })
  }

  if (s.profile.sleepGoalMin > 0 && (s.log.sleepMin ?? 0) >= s.profile.sleepGoalMin) {
    out.push({
      key: 'sleep',
      id: `${d}:sleep`,
      title: 'Sleep goal reached',
      detail: `${hours((s.log.sleepMin ?? 0) * 60_000)} of sleep.`,
    })
  }

  /* Any fast, running or finished, that has reached the length it was
     started for. Keyed by the fast so a long one is cheered once. */
  for (const f of s.fasts) {
    const end = f.endedAt ?? s.now
    const length = end - f.startedAt
    if (f.targetHours > 0 && length >= f.targetHours * 3_600_000) {
      out.push({
        key: 'fasting',
        id: `fast:${f.id}`,
        title: 'Fast complete',
        detail: `${hours(length)}, past your ${f.targetHours}h target.`,
      })
    }
  }

  if (s.log.completed) {
    out.push({ key: 'diary', id: `${d}:diary`, title: 'Diary complete', detail: 'Every meal logged for the day.' })
  }

  const p = s.profile
  const losing = p.goal.kind === 'lose-weight' || (p.goal.kind !== 'gain-muscle' && p.startWeight > p.goalWeight)
  const gaining = p.goal.kind === 'gain-muscle' || (p.goal.kind !== 'lose-weight' && p.startWeight < p.goalWeight)
  if (p.goalWeight > 0 && p.currentWeight > 0 && p.goalWeight !== p.startWeight) {
    const reached = losing ? p.currentWeight <= p.goalWeight : gaining ? p.currentWeight >= p.goalWeight : false
    if (reached) {
      out.push({
        key: 'weight',
        id: `weight:${p.goalWeight}`,
        title: 'You reached your goal weight',
        detail: `${s.weightText}. Every logged day got you here.`,
        big: true,
      })
    }
  }

  return out
}

/* ------------------------------------------------------------- memory -- */

const KEY = 'logpal.celebrated.v2'

interface Memory {
  /** Day-scoped ids, kept for the current and previous day only. */
  days: Record<string, string[]>
  /** Ids that live beyond a day: fasts and weight targets. */
  ever: string[]
}

function load(): Memory {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const m = JSON.parse(raw) as Memory
      if (m && m.days && Array.isArray(m.ever)) return m
    }
  } catch {
    /* Treat unreadable as empty: an extra cheer beats a crash. */
  }
  return { days: {}, ever: [] }
}

function save(m: Memory) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m))
  } catch {
    /* Not worth failing over. */
  }
}

function dayScoped(id: string): boolean {
  return /^\d{4}-\d{2}-\d{2}:/.test(id)
}

/** The ones not yet cheered for. */
export function uncelebrated(items: Achievement[]): Achievement[] {
  const m = load()
  return items.filter((a) => {
    if (dayScoped(a.id)) {
      const date = a.id.slice(0, 10)
      return !(m.days[date] ?? []).includes(a.id)
    }
    return !m.ever.includes(a.id)
  })
}

export function markCelebrated(items: Achievement[]): void {
  if (!items.length) return
  const m = load()
  for (const a of items) {
    if (dayScoped(a.id)) {
      const date = a.id.slice(0, 10)
      const list = m.days[date] ?? (m.days[date] = [])
      if (!list.includes(a.id)) list.push(a.id)
    } else if (!m.ever.includes(a.id)) {
      m.ever.push(a.id)
    }
  }
  /* Keep the map small: only the newest few days matter. */
  const dates = Object.keys(m.days).sort()
  while (dates.length > 3) delete m.days[dates.shift() as string]
  save(m)
}

/** For the preview buttons in Settings. Never marked as celebrated. */
export const PREVIEW_GOAL: Achievement[] = [
  { key: 'water', id: 'preview:water', title: 'Water goal reached', detail: '8 cups today.' },
]

export const PREVIEW_WEIGHT: Achievement[] = [
  {
    key: 'weight',
    id: 'preview:weight',
    title: 'You reached your goal weight',
    detail: '160 lb. Every logged day got you here.',
    big: true,
  },
]
