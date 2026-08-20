import type { Nutrients } from '../types'

/**
 * Whether one food earns its place in the day you are actually having.
 *
 * The health score already says whether something is nutritious in the
 * abstract. This says something different and more useful at the moment of
 * deciding: given what you have already eaten and what you still have left,
 * is this a good use of it. The same protein bar is an easy yes at noon with
 * 1,400 calories and 90 g of protein still to go, and a poor one at 9pm with
 * 200 calories left.
 *
 * Three things decide it, in the order people actually weigh them:
 *
 *  - what it costs against what is left,
 *  - how much protein it returns for those calories,
 *  - how much fiber it returns for those calories.
 *
 * Protein and fiber are measured against the *plan's own* density rather than
 * a fixed figure. Someone on 1,500 calories and 190 g of protein needs far
 * more protein per calorie than someone on 3,000 and 140 g, and a food that
 * suits the first would drag the second nowhere.
 */

export interface DayBudget {
  /** Calories still available today. Can be zero or negative. */
  caloriesLeft: number
  /** The day's calorie target, used to judge density rather than the day. */
  calorieGoal: number
  /** Protein still to eat, and the day's target. */
  proteinLeft: number
  proteinTarget: number
  /** Fiber target for the day. */
  fiberTarget: number
}

export interface WorthItScore {
  /** 0-10. */
  score: number
  band: 'Worth it' | 'Depends' | 'Low return'
  /** Share of the remaining calories this serving uses, 0-1 and beyond. */
  calorieShare: number
  /** Plain facts, not advice. Shown as chips under the score. */
  notes: string[]
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Per 100 calories, which is how these are compared throughout. */
function density(amount: number, calories: number): number {
  return calories > 0 ? (amount / calories) * 100 : 0
}

/**
 * How the calorie cost scores.
 *
 * A quarter of what is left or less is free, in the sense that it leaves the
 * rest of the day intact. Past that it falls away, and a food that does not
 * fit at all still scores above zero, because "over budget" is a reason to
 * think rather than a rule.
 */
function costScore(share: number): number {
  if (share <= 0.25) return 1
  if (share >= 1) return clamp(0.2 - (share - 1) * 0.2, 0, 0.2)
  return 1 - ((share - 0.25) / 0.75) * 0.65
}

export function worthIt(n: Nutrients, budget: DayBudget): WorthItScore {
  const kcal = Math.max(0, n.calories)
  const left = Math.max(0, budget.caloriesLeft)

  /* With nothing left, everything costs the whole remainder. Dividing by zero
     would make it look free instead. */
  const calorieShare = left > 0 ? kcal / left : kcal > 0 ? 2 : 0

  const planProtein = density(budget.proteinTarget, budget.calorieGoal)
  const planFiber = density(budget.fiberTarget, budget.calorieGoal)
  const proteinRatio = planProtein > 0 ? density(n.protein, kcal) / planProtein : 0
  const fiberRatio = planFiber > 0 ? density(n.fiber, kcal) / planFiber : 0

  /* Above the plan's own density is what counts as good, and 50% above is as
     much credit as anything gets: a food twice as protein-dense as the plan is
     not twice as useful, it is simply enough. */
  const protein = clamp(proteinRatio, 0, 1.5) / 1.5
  const fiber = clamp(fiberRatio, 0, 1.5) / 1.5

  /* Cost scales the return rather than being added to it.
   *
   * Adding them let a food with no protein and no fiber score half marks for
   * being cheap, which put a fizzy drink and a chicken breast in the same band.
   * A quarter is kept as a floor so fitting the day is worth something on its
   * own, and the rest has to be earned. */
  const returned = protein * 0.64 + fiber * 0.36
  const raw = (0.25 + 0.75 * returned) * costScore(calorieShare)

  /* Free food is worth it by definition: nothing was spent. */
  const score = kcal <= 5 ? 10 : Math.round(clamp(raw * 10, 0, 10) * 10) / 10

  const notes: string[] = []
  if (kcal > 0) {
    notes.push(
      left > 0
        ? `${Math.round(calorieShare * 100)}% of the calories you have left`
        : 'You are already at your calorie target',
    )
  }
  notes.push(`${Math.round(n.protein)} g protein, ${Math.round(density(n.protein, kcal))} g per 100 cal`)
  notes.push(`${Math.round(n.fiber)} g fiber`)
  if (n.protein >= budget.proteinLeft && budget.proteinLeft > 0) {
    notes.push('Covers the protein you still need today')
  }

  /* The bottom band describes the food rather than judging the choice. "Not
     worth it" is a verdict on a decision nobody asked us to make, and it reads
     as a telling-off on a screen someone opened for information. */
  const band: WorthItScore['band'] =
    score >= 7 ? 'Worth it' : score >= 4.5 ? 'Depends' : 'Low return'

  return { score, band, calorieShare, notes }
}
