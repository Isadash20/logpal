import type { Food, Nutrients } from '../types'

/**
 * Four plain-English ratings for one serving: how good it is as a source of
 * protein, of carbohydrate and of fat, and how clean it is.
 *
 * The health score answers "is this nutritious" in one number, which is
 * useful and also hides the reason. Someone reaching for a protein bar wants
 * to know whether it is actually a protein source, and a 7 does not say.
 * These do. Each is 0–10, and each is two things multiplied: how much of the
 * serving the nutrient is (presence), and how good that nutrient is (quality).
 * Presence is gated on both share of calories and absolute grams, so a food
 * cannot be a "great fat source" with two grams of it, and a lettuce leaf is
 * not a protein source because its three calories happen to be protein.
 */

export interface Rating {
  /** 0–10, one decimal. */
  score: number
  /** One or two words for the chip: "Excellent", "Not a source". */
  label: string
  /** One line under it, in figures. */
  detail: string
}

export interface SourceRatings {
  protein: Rating
  carbs: Rating
  fat: Rating
  clean: Rating
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const one = (v: number) => Math.round(clamp(v, 0, 10) * 10) / 10
const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

function sourceLabel(score: number): string {
  if (score >= 8) return 'Excellent'
  if (score >= 6) return 'Good'
  if (score >= 4) return 'Fair'
  if (score >= 2) return 'Weak'
  return 'Not a source'
}

/* Names that say what the protein is. Collagen is the one that matters: the
   gram count on the tub is the same as whey and the amino acids are not. */
const COLLAGEN = /collagen|gelatin|gelatine/
const COMPLETE = /whey|casein|\bsoy\b|soya|tofu|tempeh|egg|yogurt|yoghurt|cottage|chicken|turkey|beef|pork|lamb|steak|salmon|tuna|cod|shrimp|prawn|sardine|fish|milk|cheese|quinoa/

const REFINED = /corn syrup|high fructose|maltodextrin|dextrose|cane sugar|glucose syrup|white flour|enriched flour|rice syrup|invert sugar/
const HARD_FAT = /hydrogenated|palm oil|shortening|margarine/
const JUNK = /\bchips?\b|crisps|candy|candies|soda|\bcola\b|cookie|frosted|energy drink|gummies|gummy|frosting|sprinkles/

export function sourceRatings(food: Food, n: Nutrients): SourceRatings {
  const t = `${food.name} ${food.brand ?? ''}`.toLowerCase()
  const kcal = Math.max(0, n.calories)

  /* ---- protein ---- */
  const pShare = share(n.protein * 4, kcal)
  const pPresence = clamp(pShare / 0.3, 0, 1) * clamp(n.protein / 15, 0, 1)
  const collagen = COLLAGEN.test(t)
  const pQuality = collagen ? 0.35 : COMPLETE.test(t) ? 1 : 0.85
  const pScore = n.protein < 1 ? 0 : one(pPresence * (4 + 6 * pQuality))
  const protein: Rating = {
    score: pScore,
    label: sourceLabel(pScore),
    detail:
      n.protein < 1
        ? 'Under a gram of protein'
        : `${Math.round(n.protein)} g · ${Math.round(pShare * 100)}% of calories` +
          (collagen ? ' · collagen, an incomplete protein' : ''),
  }

  /* ---- carbohydrate ---- */
  const cShare = share(n.carbs * 4, kcal)
  const cPresence = clamp(cShare / 0.35, 0, 1) * clamp(n.carbs / 15, 0, 1)
  const fiberShare = share(n.fiber, n.carbs)
  const sugarShare = share(n.sugar, n.carbs)
  let cQuality = clamp(0.45 + fiberShare * 2.5 - Math.max(0, sugarShare - 0.3) * 0.7, 0, 1)
  if (REFINED.test(t)) cQuality *= 0.6
  let cScore = n.carbs < 1 ? 0 : cPresence * (3 + 7 * cQuality)
  if (sugarShare >= 0.65 && fiberShare < 0.1) cScore = Math.min(cScore, 3)
  cScore = one(cScore)
  const carbs: Rating = {
    score: cScore,
    label: sourceLabel(cScore),
    detail:
      n.carbs < 1
        ? 'Under a gram of carbohydrate'
        : `${Math.round(n.carbs)} g · ${Math.round(n.fiber)} g fiber · ${Math.round(n.sugar)} g sugar`,
  }

  /* ---- fat ---- */
  const fShare = share(n.fat * 9, kcal)
  const fPresence = clamp(fShare / 0.35, 0, 1) * clamp(n.fat / 10, 0, 1)
  const unsat = n.monoFat + n.polyFat
  const satShare = share(n.satFat, n.fat)
  let fQuality = unsat > 0 ? clamp(unsat / Math.max(n.fat, unsat), 0, 1) : clamp(1 - satShare, 0, 1)
  if (HARD_FAT.test(t)) fQuality *= 0.4
  if (n.transFat >= 0.5) fQuality *= 0.3
  const fScore = n.fat < 1 ? 0 : one(fPresence * (3 + 7 * fQuality))
  const fat: Rating = {
    score: fScore,
    label: sourceLabel(fScore),
    detail:
      n.fat < 1
        ? 'Under a gram of fat'
        : `${Math.round(n.fat)} g · ${Math.round(n.satFat)} g saturated` +
          (unsat > 0 ? ` · ${Math.round(unsat)} g unsaturated` : '') +
          (n.transFat >= 0.5 ? ` · ${n.transFat.toFixed(1)} g trans` : ''),
  }

  /* ---- clean ----
     Starts at ten and loses marks for the things a label would make you
     wince at: sugar as a share of calories, salt per calorie, saturated and
     trans fat, and a name that lists a syrup, a hard fat or a snack aisle. */
  const flags: string[] = []
  let clean = 10
  const sugarCal = share(n.sugar * 4, kcal)
  if (sugarCal >= 0.2) {
    /* Fruit is sugar with fiber round it, and is not what "clean" is about. */
    const whole = n.fiber >= 2 && !REFINED.test(t) && !JUNK.test(t)
    const hit = 4 * clamp((sugarCal - 0.2) / 0.5, 0, 1) * (whole ? 0.4 : 1)
    if (hit >= 0.5) flags.push('Sugar')
    clean -= hit
  }
  const sodiumPer100 = kcal > 0 ? (n.sodium / kcal) * 100 : n.sodium
  if (sodiumPer100 > 200) {
    clean -= 3 * clamp((sodiumPer100 - 200) / 500, 0, 1)
    flags.push('Salt')
  }
  const satCal = share(n.satFat * 9, kcal)
  if (satCal >= 0.15) {
    clean -= 2 * clamp((satCal - 0.15) / 0.3, 0, 1)
    flags.push('Saturated fat')
  }
  if (n.transFat >= 0.5) {
    clean -= 3
    flags.push('Trans fat')
  }
  if (REFINED.test(t)) {
    clean -= 2
    flags.push('Refined ingredients')
  }
  if (HARD_FAT.test(t)) {
    clean -= 2
    flags.push('Hydrogenated or palm fat')
  }
  if (JUNK.test(t)) {
    clean -= 2
    flags.push('Snack aisle')
  }
  const cleanScore = one(clean)
  const cleanRating: Rating = {
    score: cleanScore,
    label:
      cleanScore >= 8
        ? 'Very clean'
        : cleanScore >= 6
          ? 'Mostly clean'
          : cleanScore >= 4
            ? 'Mixed'
            : 'Not clean',
    detail: flags.length ? flags.join(' · ') : 'Nothing flagged',
  }

  return { protein, carbs, fat, clean: cleanRating }
}
