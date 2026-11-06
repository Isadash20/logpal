/**
 * The week as a scoreboard.
 *
 * Phillip's ask (2026-11-06): compete with friends the way Apple Watch does,
 * "who gets the most steps, who's drinking the most water, dumb stuff that
 * motivates you". What crosses the wire is counts of days, zero to seven,
 * never the figures, so an account sharing percentages gives nothing away.
 */
export interface DaySnapshot {
  calories: number
  calorieGoal: number
  waterMl: number
  waterGoalMl: number
  /** Null when nothing was recorded, which is not a zero. */
  steps: number | null
  stepGoal: number
}

export interface WeekCounts {
  /** Days with anything in the diary. */
  loggedDays: number
  /** Days that landed inside the calorie goal: at least half of it, at most 5% over. */
  calorieDays: number
  waterDays: number
  stepDays: number
  /** Steps walked, for accounts that share the figure. */
  steps: number
}

export function weekCounts(days: DaySnapshot[]): WeekCounts {
  const out: WeekCounts = { loggedDays: 0, calorieDays: 0, waterDays: 0, stepDays: 0, steps: 0 }
  for (const d of days) {
    if (d.calories > 0) out.loggedDays++
    if (d.calories > 0 && d.calorieGoal > 0 && d.calories >= d.calorieGoal * 0.5 && d.calories <= d.calorieGoal * 1.05) out.calorieDays++
    if (d.waterGoalMl > 0 && d.waterMl >= d.waterGoalMl) out.waterDays++
    if (d.steps !== null && d.stepGoal > 0 && d.steps >= d.stepGoal) out.stepDays++
    out.steps += d.steps ?? 0
  }
  return out
}
