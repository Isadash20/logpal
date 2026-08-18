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

/**
 * Reference amounts a *serving* is judged against, in the nutrient's own unit.
 *
 * Sodium and saturated fat were previously judged per calorie, like everything
 * else, and that quietly punished food for being light. A spinach frittata is
 * 132 calories with 364 mg of sodium, which per calorie looks like nearly two
 * and a half times its share and maxed the penalty — but 364 mg is an ordinary
 * amount of salt for a meal, and the dish is eggs and spinach. Judging a
 * salted savoury dish by salt-per-calorie means the lighter and more vegetable
 * it is, the worse it scores, which is precisely backwards.
 *
 * So these two are measured against what a serving may reasonably carry.
 * Saturated fat stays proportional — fat does scale with energy — but is
 * allowed 15% of calories before anything is charged, above the 10% guideline
 * because a guideline for a whole day should not condemn one dish.
 */
const SERVING_LIMIT: Partial<Record<NutrientKey, number>> = {
  sodium: 600,
}

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

export interface ScoreOptions {
  /**
   * Whether the recipe actually contains a sweetener.
   *
   * Sugar was being charged wherever it appeared, which marks down fruit for
   * being fruit. A banana smoothie is not a dessert, and a runner or anyone
   * eating to gain wants those carbohydrates. Only sugar somebody added is
   * worth flagging, and that is knowable from the ingredient list rather than
   * from the nutrition panel, so the caller passes it in.
   */
  hasAddedSugar?: boolean
}

export function healthScore(n: Nutrients, opts: ScoreOptions = {}): HealthScore {
  const positive = POSITIVE.map((k) => entry(k, n)).filter((x): x is ScoredNutrient => !!x)
  const negative = NEGATIVE.map((k) => entry(k, n)).filter((x): x is ScoredNutrient => !!x)
  const share = calorieShare(n)

  /* Averaged over the nutrients actually measured, not over a fixed six.
   *
   * The catalogue's nutrition carries protein and fibre for everything and
   * potassium or vitamin C for almost nothing, so dividing by six meant a dish
   * could do everything right on the figures that exist and still only reach a
   * third of the available credit. Nutrient density is a rate, and a rate
   * should not fall because something went unmeasured. */
  const densities = positive.map((s) => Math.min(2, density(s, share)))
  const avgGood = densities.length
    ? densities.reduce((a, b) => a + b, 0) / densities.length
    : 0
  const peakGood = densities.length ? Math.max(...densities) : 0
  /* Weighted toward what the food is best at, because averaging alone marks a
     dish down for the nutrients it was never going to carry. A frittata is
     eggs and spinach: excellent protein, almost no fibre, and its fibre should
     not cancel its protein. 2.2× par is a genuinely dense serving. */
  const goodIndex = Math.min(1, (peakGood * 0.6 + avgGood * 0.4) / 2.2)

  /* Only genuine excess counts, and each nutrient is judged the way that
     nutrient behaves. */
  const charges: number[] = []
  for (const s of negative) {
    if (s.key === 'sugar') {
      /* Fruit and milk sugars are not a fault. Only a sweetened recipe is
         charged, and only for sugar beyond its share of the calories. */
      if (!opts.hasAddedSugar) continue
      charges.push(Math.min(1, Math.max(0, density(s, share) - 1)))
      continue
    }
    if (s.key === 'satFat') {
      const fromSatFat = (s.amount * 9) / Math.max(1, n.calories ?? 0)
      charges.push(Math.min(1, Math.max(0, (fromSatFat - 0.15) / 0.15)))
      continue
    }
    const limit = SERVING_LIMIT[s.key]
    if (limit) {
      charges.push(Math.min(1, Math.max(0, (s.amount - limit) / limit)))
      continue
    }
    charges.push(Math.min(1, Math.max(0, density(s, share) - 1)))
  }
  /* Mostly the worst single charge, softened by the average.
     Averaging alone let a cake's sugar be cancelled out by its innocent
     sodium; taking the worst alone made one salted dish a verdict. */
  const chargeMax = charges.length ? Math.max(...charges) : 0
  const chargeAvg = charges.length
    ? charges.reduce((a, b) => a + b, 0) / charges.length
    : 0
  const badIndex = Math.min(1, chargeMax * 0.75 + chargeAvg * 0.25)

  /* Sits at 5.5 with nothing remarkable either way, reaches the top for a
     serving that is genuinely nutrient-dense. Weighted toward the good side on
     purpose: what a food gives you is the reason you are eating it, and a scale
     that can only take marks off calls everything unhealthy. */
  const raw = 5.0 + goodIndex * 5.0 - badIndex * 3.5
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
