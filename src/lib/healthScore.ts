import type { NutrientKey, Nutrients } from '../types'
import { NUTRIENT_BY_KEY } from '../data/nutrients'

/**
 * A 1–10 nutrient-density score for a serving.
 *
 * ## This is ours, not theirs
 *
 * Samsung Food shows a "Health Score" over "more than 28 nutrients". We track
 * seventeen and their formula is not published, so this is a different number
 * computed from FDA daily values on the nutrients we actually have. It is
 * deliberately not called the same thing anywhere in the UI, and the screen
 * that shows it says how it is worked out — a score that looks authoritative
 * and cannot explain itself is worse than no score.
 *
 * ## How it works
 *
 * Each nutrient contributes its share of a daily value, capped at one full day,
 * so a single serving with four days' sodium cannot swamp everything else. The
 * helpful ones pull up, the ones worth limiting pull down, and the result is
 * mapped onto 1–10. Calories are not scored directly: a calorie is not good or
 * bad on its own, which is the whole reason this sits beside the calorie count
 * rather than replacing it.
 */

/** Nutrients most people are trying to get more of. */
const POSITIVE: NutrientKey[] = [
  'protein',
  'fiber',
  'potassium',
  'vitaminA',
  'vitaminC',
  'calcium',
  'iron',
  'monoFat',
  'polyFat',
]

/**
 * Nutrients dietary guidance is about limiting.
 *
 * Cholesterol is deliberately not here. The 2015 advisory committee dropped the
 * 300 mg cap and the 2020–2025 Dietary Guidelines set no numeric limit, since
 * dietary cholesterol turns out to move blood cholesterol far less than
 * saturated fat does. Scoring it anyway made eggs the single worst thing in the
 * recipe catalogue — a three-egg spinach and feta scramble came bottom of a
 * hundred and twenty recipes, below the cookies — which is not a defensible
 * thing to tell someone about breakfast. It is still shown on the nutrition
 * panel; it just no longer costs marks.
 */
const NEGATIVE: NutrientKey[] = ['satFat', 'transFat', 'sugar', 'sodium']

export interface ScoredNutrient {
  key: NutrientKey
  label: string
  /** Amount in the nutrient's own unit. */
  amount: number
  unit: string
  /** Share of a daily value, 0–1+ — not capped, because the bar shows the truth. */
  dv: number
}

export interface HealthScore {
  /** 1–10, one decimal place. */
  score: number
  /** How it reads on screen: the wording Samsung Food uses for its own band. */
  band: 'Low' | 'Moderate' | 'Great'
  positive: ScoredNutrient[]
  negative: ScoredNutrient[]
}

/**
 * Reference amounts for scoring only, where the FDA panel sets none.
 *
 * Mono- and polyunsaturated fat have no daily value, so they carry
 * `dailyValue: 0` in the nutrient table and were being skipped entirely — which
 * meant olive oil, nuts, avocado and oily fish contributed nothing good to a
 * score, while the saturated fat beside them counted in full. A Greek salad was
 * being marked down for its dressing and given no credit for it.
 *
 * These are the Institute of Medicine's acceptable intake ranges for a 2,000
 * calorie diet, in grams. They are not FDA daily values and are deliberately
 * not shown as such anywhere — they exist so the score can see a fat it should
 * be pleased about.
 */
const SCORING_REFERENCE: Partial<Record<NutrientKey, number>> = {
  monoFat: 44,
  polyFat: 22,
}

function entry(key: NutrientKey, n: Nutrients): ScoredNutrient | null {
  const def = NUTRIENT_BY_KEY[key]
  if (!def) return null
  const reference = def.dailyValue || SCORING_REFERENCE[key] || 0
  // Trans fat still has none, and rightly so: there is no amount to aim for.
  if (!reference) return null
  const amount = n[key] ?? 0
  if (amount <= 0) return null
  return { key, label: def.label, amount, unit: def.unit, dv: amount / reference }
}

/**
 * A serving's share of a reference 2,000 calorie day.
 *
 * Everything below is measured against this rather than against a whole day,
 * and it is the correction that makes the score mean anything. A 358-calorie
 * Greek salad is 18% of a day's energy, so 23% of a day's protein is *better
 * than its share* — generous, not a fifth of the way to adequate. Scoring
 * against the full daily value instead marked down every single serving of
 * every real meal, because no one serving is ever a whole day of anything.
 */
function calorieShare(n: Nutrients): number {
  /* Floored so a near-zero-calorie serving cannot divide its way to infinity.
     Lowering it to sharpen the penalty on small sugary things was tried and
     reverted: it raises their positive densities by exactly as much, so the
     cookies came out higher still. */
  return Math.max(0.04, (n.calories ?? 0) / 2000)
}

/**
 * How a nutrient compares to what this serving's calories entitle it to.
 * 1.0 is exactly par: it carries the same share of that nutrient as it does of
 * the day's energy. Above 1 is dense in it; below 1 is dilute.
 */
function density(s: ScoredNutrient, share: number): number {
  return s.dv / share
}

export function healthScore(n: Nutrients): HealthScore {
  const positive = POSITIVE.map((k) => entry(k, n)).filter((x): x is ScoredNutrient => !!x)
  const negative = NEGATIVE.map((k) => entry(k, n)).filter((x): x is ScoredNutrient => !!x)
  const share = calorieShare(n)

  /* Credit for being richer than par, with diminishing returns — three
     nutrients at twice their share is a genuinely good serving, thirty times
     the vitamin C of an orange is not thirty times better. */
  let good = 0
  for (const s of positive) good += Math.min(2, density(s, share))
  const goodIndex = Math.min(1, good / 6)

  /* Only *excess* counts against a serving.
   *
   * The previous version charged for any sodium at all, which meant food was
   * penalised for being food: feta and olive oil in a salad are the reason to
   * eat it, and they were dragging it under four. Carrying a nutrient in
   * proportion to your calories is par and costs nothing; you are marked down
   * for the amount by which you exceed it, and only that. */
  /* Capped per nutrient, so no single one can sink a meal on its own.
   *
   * Without this, "1 teaspoon salt" — which almost every savoury recipe
   * contains, and much of which never reaches the plate — maxes the penalty by
   * itself and drags an otherwise excellent dish to the floor. One thing being
   * high is worth saying; it is not worth overruling everything else about the
   * food. Reaching the bottom of the scale should take several problems at
   * once, which is what a genuinely poor serving actually looks like. */
  let excess = 0
  for (const s of negative) excess += Math.min(1, Math.max(0, density(s, share) - 1))
  const badIndex = Math.min(1, excess / 2.5)

  /* Sits at 5.5 with nothing remarkable either way, reaches the top for a
     serving that is genuinely nutrient-dense. Weighted toward the good side on
     purpose: what a food gives you is the reason you are eating it, and a scale
     that can only take marks off calls everything unhealthy.

     The downside is deliberately shallower than the upside, so the floor for
     ordinary home cooking is around five rather than one. Saturated fat is the
     only strong negative signal among the nutrients tracked here, which means
     anything containing cheese or eggs takes the full weight of it — and a
     spinach and feta scramble reading "Low" tells someone their breakfast is
     bad when what it really means is "this has cheese in it". The score should
     point at what is worth noticing, not frighten anyone off eating. */
  const raw = 5.5 + goodIndex * 4.5 - badIndex * 3.2
  const score = Math.max(1, Math.min(10, Math.round(raw * 10) / 10))

  return {
    score,
    /* "Great" has to be earned — at 6.5 a tray of sugar cookies cleared it,
       which devalues the word everywhere else it appears — but "Low" should be
       rare and mean something, so the floor sits well down the scale. Most
       real food is somewhere in the middle, and saying so is the honest
       outcome rather than a failure of the scale. */
    band: score >= 7 ? 'Great' : score >= 4.5 ? 'Moderate' : 'Low',
    // Biggest contribution first, so the reason for the score reads top-down.
    positive: positive.sort((a, b) => b.dv - a.dv),
    negative: negative.sort((a, b) => b.dv - a.dv),
  }
}
