import type { ExerciseDef } from '../types'
import { caloriesBurned } from './nutrition'

/**
 * How an activity's burn is estimated, in three steps of certainty.
 *
 * 1. Time alone: the activity's general MET (Compendium of Physical
 *    Activities) times body weight times minutes. A rough estimate.
 * 2. Time and distance: the average speed picks a MET off the activity's
 *    speed curve, so a 7-minute mile and a 12-minute mile stop costing the
 *    same. Closer.
 * 3. Time, distance and elevation gain: the climb is added as mechanical
 *    work, body mass lifted through the gain at about a quarter efficiency.
 *    The best this can do without a heart-rate monitor.
 *
 * Sports take an optional distance from a watch. It is read as running at
 * that average speed, floored at the sport's own MET, so a slow half of
 * football is still football and a fast one costs what the running did.
 */

/** [mph, MET] points, interpolated between and clamped at the ends. */
export type SpeedCurve = [number, number][]

export const CURVES: Record<string, SpeedCurve> = {
  walking: [
    [2.0, 2.8],
    [2.5, 3.0],
    [3.0, 3.5],
    [3.5, 4.3],
    [4.0, 5.0],
    [4.5, 7.0],
    [5.0, 8.3],
  ],
  hiking: [
    [1.5, 3.5],
    [2.0, 4.5],
    [2.5, 5.3],
    [3.0, 6.0],
    [3.5, 7.0],
    [4.0, 8.0],
  ],
  running: [
    [4.0, 6.0],
    [5.0, 8.3],
    [6.0, 9.8],
    [7.0, 11.0],
    [8.0, 11.8],
    [9.0, 12.8],
    [10.0, 14.5],
    [11.0, 16.0],
    [12.0, 19.0],
    [14.0, 23.0],
  ],
  trailRunning: [
    [4.0, 7.0],
    [5.0, 9.3],
    [6.0, 10.8],
    [7.0, 12.0],
    [8.0, 12.8],
    [9.0, 13.8],
    [10.0, 15.5],
  ],
  cycling: [
    [6.0, 3.5],
    [9.0, 4.0],
    [11.0, 6.8],
    [13.0, 8.0],
    [15.0, 10.0],
    [17.5, 12.0],
    [20.0, 15.8],
  ],
  mountainBiking: [
    [4.0, 5.0],
    [6.0, 6.5],
    [8.0, 8.5],
    [10.0, 10.0],
    [12.0, 12.0],
    [14.0, 14.0],
  ],
  swimming: [
    [0.8, 4.8],
    [1.0, 6.0],
    [1.5, 8.3],
    [2.0, 10.0],
    [2.5, 11.0],
  ],
  paddling: [
    [2.0, 3.5],
    [3.0, 5.0],
    [4.0, 7.0],
    [5.0, 9.0],
    [6.0, 12.0],
  ],
  skating: [
    [8.0, 5.5],
    [10.0, 7.0],
    [12.0, 9.0],
    [14.0, 11.0],
    [16.0, 13.5],
  ],
  xcSkiing: [
    [2.5, 6.8],
    [4.0, 9.0],
    [5.0, 12.5],
    [7.0, 15.0],
  ],
}

export function metAtSpeed(curve: SpeedCurve, mph: number): number {
  if (!Number.isFinite(mph) || mph <= 0) return curve[0][1]
  if (mph <= curve[0][0]) return curve[0][1]
  const last = curve[curve.length - 1]
  if (mph >= last[0]) return last[1]
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]
    const [x0, y0] = curve[i - 1]
    if (mph <= x1) return y0 + ((mph - x0) / (x1 - x0)) * (y1 - y0)
  }
  return last[1]
}

export type Tier = 'rough' | 'closer' | 'best'

export interface Estimate {
  kcal: number
  /** The MET the time-based part was costed at. */
  met: number
  tier: Tier
  /** What would sharpen it, or why it cannot be sharpened further. */
  next: string
}

const LB_PER_KG = 2.2046
const FT_PER_M = 3.2808
/** Joules per kcal, and the share of food energy that becomes climb. */
const J_PER_KCAL = 4184
const CLIMB_EFFICIENCY = 0.24

/** Extra kcal for lifting `weightLb` through `gainFt` of climb. */
export function climbCalories(weightLb: number, gainFt: number): number {
  if (!gainFt || gainFt <= 0) return 0
  const kg = weightLb / LB_PER_KG
  const m = gainFt / FT_PER_M
  return Math.round((kg * 9.81 * m) / J_PER_KCAL / CLIMB_EFFICIENCY)
}

export function estimate(
  def: Pick<ExerciseDef, 'met' | 'curve' | 'climbs' | 'kind'>,
  input: { minutes: number; distanceMi?: number | null; elevationFt?: number | null; weightLb: number },
): Estimate {
  const minutes = Math.max(0, input.minutes || 0)
  const base = def.met ?? 4
  const dist = input.distanceMi && input.distanceMi > 0 ? input.distanceMi : null
  const gain = def.climbs && input.elevationFt && input.elevationFt > 0 ? input.elevationFt : null
  const sport = def.kind === 'sports'
  const curve = def.curve ? CURVES[def.curve] : sport ? CURVES.running : null

  let met = base
  let tier: Tier = 'rough'
  if (dist && minutes > 0 && curve) {
    const mph = dist / (minutes / 60)
    const bySpeed = metAtSpeed(curve, mph)
    /* A sport is at least itself; the watch can only push it up. */
    met = sport ? Math.max(base, bySpeed) : bySpeed
    tier = 'closer'
  }
  let kcal = caloriesBurned(met, input.weightLb, minutes)
  if (dist && gain) {
    kcal += climbCalories(input.weightLb, gain)
    tier = 'best'
  }

  let next: string
  if (tier === 'best') next = 'As close as it gets without a heart-rate monitor.'
  else if (tier === 'closer') next = def.climbs ? 'Add elevation gain for the best estimate.' : 'As close as it gets without a heart-rate monitor.'
  else if (!curve) next = 'Timed at the activity’s general intensity.'
  else if (sport) next = 'Add the distance from your watch for a closer estimate.'
  else next = 'Add the distance for a closer estimate.'

  return { kcal, met: Math.round(met * 10) / 10, tier, next }
}

/** Average pace as "9:30 /mi" or "5:54 /km". */
export function paceLabel(distance: number, minutes: number, unit: 'mi' | 'km'): string | null {
  if (!distance || !minutes) return null
  const per = minutes / distance
  const m = Math.floor(per)
  const s = Math.round((per - m) * 60)
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')} /${unit}`
}
