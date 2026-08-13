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

/** Nutrients dietary guidance is about limiting. */
const NEGATIVE: NutrientKey[] = ['satFat', 'transFat', 'sugar', 'sodium', 'cholesterol']

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

function entry(key: NutrientKey, n: Nutrients): ScoredNutrient | null {
  const def = NUTRIENT_BY_KEY[key]
  // A daily value of zero means there is no reference amount to score against
  // — polyunsaturated and trans fat are both like this on a US panel.
  if (!def || !def.dailyValue) return null
  const amount = n[key] ?? 0
  if (amount <= 0) return null
  return { key, label: def.label, amount, unit: def.unit, dv: amount / def.dailyValue }
}

/** Mean of each nutrient's daily share, with one day counted as the maximum. */
function index(list: ScoredNutrient[], of: NutrientKey[]): number {
  if (!of.length) return 0
  let total = 0
  for (const s of list) total += Math.min(1, s.dv)
  return total / of.length
}

export function healthScore(n: Nutrients): HealthScore {
  const positive = POSITIVE.map((k) => entry(k, n)).filter((x): x is ScoredNutrient => !!x)
  const negative = NEGATIVE.map((k) => entry(k, n)).filter((x): x is ScoredNutrient => !!x)

  const good = index(positive, POSITIVE)
  const bad = index(negative, NEGATIVE)

  /* Centred at 5.5 so a serving that is unremarkable in both directions lands
     mid-scale rather than at the bottom. The spread is wide enough that a
     genuinely good or bad serving reaches the ends of the range. */
  const raw = 5.5 + (good - bad) * 12
  const score = Math.max(1, Math.min(10, Math.round(raw * 10) / 10))

  return {
    score,
    band: score >= 7 ? 'Great' : score >= 4 ? 'Moderate' : 'Low',
    // Biggest contribution first, so the reason for the score reads top-down.
    positive: positive.sort((a, b) => b.dv - a.dv),
    negative: negative.sort((a, b) => b.dv - a.dv),
  }
}
