import { Capacitor, registerPlugin } from '@capacitor/core'
import type { AppData, ExerciseEntry, WeightEntry } from '../types'
import { LB_PER_KG } from '../lib/units'

/**
 * Apple Health, through the `HealthPlugin.swift` bridge in the iOS app.
 *
 * Only the iOS build has it. On the web `healthSupported()` is false and
 * nothing here is called; the Settings banner is not even shown.
 *
 * The shape of the sync:
 *
 * - *In:* steps (one total per day), weigh-ins other apps or the user put in
 *   Health, and workouts. `mergeHealth` folds a reading into the diary and
 *   is pure so it can be tested without a phone.
 * - *Out:* the day's water, weight and nutrition totals, written by the
 *   store whenever one of them changes (`writeHealthDay`). Health keeps one
 *   LogPal sample per day and type, replaced on each write, so the two
 *   never disagree and nothing another app wrote is touched.
 *
 * Weigh-ins LogPal wrote come back flagged `own` and are skipped on the way
 * in, which is what stops the loop.
 */

export interface HealthSteps {
  date: string
  steps: number
}

export interface HealthWeight {
  date: string
  at: string
  kg: number
  own: boolean
  source: string
}

export interface HealthWorkout {
  id: string
  date: string
  start: string
  end: string
  minutes: number
  calories?: number
  activity: string
  source: string
  own: boolean
}

export type WriteStatus = Record<string, 'authorized' | 'denied' | 'notDetermined'>

export interface DayWrite {
  date: string
  timeZone: string
  /* A field that is present replaces LogPal's sample for the day; zero
     removes it; absent leaves it alone. */
  waterMl?: number
  calories?: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  weightKg?: number
}

interface HealthPlugin {
  isAvailable(): Promise<{ available: boolean }>
  requestAuthorization(): Promise<{ granted: boolean; writes: WriteStatus }>
  writeStatus(): Promise<{ writes: WriteStatus }>
  readDailySteps(o: { start: string; end: string; timeZone: string }): Promise<{ days: HealthSteps[] }>
  readWeights(o: { start: string; timeZone: string }): Promise<{ samples: HealthWeight[] }>
  readWorkouts(o: { start: string; timeZone: string }): Promise<{ workouts: HealthWorkout[] }>
  writeDay(o: DayWrite): Promise<{ written: number; skipped: string[] }>
}

const Health = registerPlugin<HealthPlugin>('Health')

/** The iOS app. Health has no web API, and Android would be Health Connect. */
export function healthSupported(): boolean {
  return Capacitor.getPlatform() === 'ios'
}

export async function healthAvailable(): Promise<boolean> {
  if (!healthSupported()) return false
  try {
    return (await Health.isAvailable()).available
  } catch {
    return false
  }
}

/** Shows the system sheet. Resolves with what the user allowed us to write. */
export async function requestHealthAccess(): Promise<WriteStatus> {
  return (await Health.requestAuthorization()).writes
}

export async function healthWriteStatus(): Promise<WriteStatus> {
  return (await Health.writeStatus()).writes
}

export interface HealthReading {
  steps: HealthSteps[]
  weights: HealthWeight[]
  workouts: HealthWorkout[]
}

export async function readHealth(start: string, end: string, timeZone: string): Promise<HealthReading> {
  const [s, w, k] = await Promise.all([
    Health.readDailySteps({ start, end, timeZone }),
    Health.readWeights({ start, timeZone }),
    Health.readWorkouts({ start, timeZone }),
  ])
  return { steps: s.days, weights: w.samples, workouts: k.workouts }
}

export function writeHealthDay(o: DayWrite): Promise<{ written: number; skipped: string[] }> {
  return Health.writeDay(o)
}

export interface HealthMerge {
  steps: number
  weights: number
  workouts: number
}

/** What the last sync did, for the Settings screen. Kept per device. */
export interface HealthSyncResult extends HealthMerge {
  at: number
  error?: string
}

const LAST_KEY = 'logpal.healthLast'

export function loadHealthLast(): HealthSyncResult | null {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    return raw ? (JSON.parse(raw) as HealthSyncResult) : null
  } catch {
    return null
  }
}

export function saveHealthLast(r: HealthSyncResult): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(r))
  } catch {
    /* Private mode, full storage: the line in Settings just goes stale. */
  }
}

/**
 * Fold a reading into a draft of the diary. Mutates `d`; returns how many of
 * each thing changed, for the "last synced" line.
 *
 * Steps from Health replace what is on the day: once connected, the phone's
 * count is the truth and a typed figure is at best a guess at it. A zero,
 * though, is left alone, since it usually means the phone was in a drawer.
 * Weigh-ins only fill days LogPal has nothing for, so a number the user
 * typed here is never overwritten by a scale. Workouts are keyed by Health's
 * own id so a sync never doubles them.
 */
export function mergeHealth(d: AppData, r: HealthReading, today: string): HealthMerge {
  let steps = 0
  for (const s of r.steps) {
    if (s.date > today || s.steps <= 0) continue
    const day = d.days[s.date] ?? { water: 0, completed: false }
    if (day.steps === s.steps) continue
    d.days[s.date] = { ...day, steps: s.steps }
    steps++
  }

  const lastByDate = new Map<string, HealthWeight>()
  for (const w of r.weights) if (!w.own && w.kg > 0) lastByDate.set(w.date, w)
  let weights = 0
  for (const [date, w] of lastByDate) {
    if (date > today || d.weights.some((x) => x.date === date)) continue
    const rec: WeightEntry = { date, weight: Math.round(w.kg * LB_PER_KG * 10) / 10 }
    d.weights.push(rec)
    weights++
  }
  if (weights) {
    d.weights.sort((a, b) => (a.date < b.date ? -1 : 1))
    d.profile.currentWeight = d.weights[d.weights.length - 1].weight
  }

  let workouts = 0
  const have = new Set(d.exerciseEntries.map((e) => e.id))
  for (const w of r.workouts) {
    if (w.own || w.date > today) continue
    const id = `hk:${w.id}`
    if (have.has(id)) continue
    const minutes = Math.round(w.minutes)
    if (minutes < 1) continue
    const e: ExerciseEntry = {
      id,
      date: w.date,
      kind: 'cardio',
      name: w.activity,
      minutes,
      loggedAt: Date.parse(w.start) || Date.now(),
    }
    if (w.calories != null && w.calories > 0) e.caloriesBurned = Math.round(w.calories)
    d.exerciseEntries.push(e)
    have.add(id)
    workouts++
  }

  return { steps, weights, workouts }
}
