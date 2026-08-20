import type { Food, Nutrients } from '../types'

/**
 * What a food is actually made of, as far as its record can say.
 *
 * The numbers alone flatten real differences: 20 g of protein from whey and
 * 20 g from collagen are not the same protein, and 30 g of carbohydrate from
 * oats is not 30 g from cane sugar. Some of that is recoverable from the
 * figures (how much of the carbohydrate is sugar, how much of the fat is
 * saturated) and some only from the name, which is why both are read here.
 *
 * Everything claimed is either arithmetic on the nutrients or a word that
 * appears in the food's own name or brand. Nothing is guessed from a category,
 * because "chicken" in a product name does not make it chicken.
 */

export type Tone = 'good' | 'watch'

export interface Insight {
  /** Short heading, e.g. "Complete protein". */
  label: string
  /** One line of substance under it. */
  detail: string
  tone: Tone
}

export interface FoodInsight {
  protein: string | null
  carbs: string | null
  fat: string | null
  good: Insight[]
  watch: Insight[]
}

/* ------------------------------------------------------------- proteins -- */

/**
 * Named protein sources, in the order a label would list them.
 *
 * Collagen and gelatin are called out because they are the one common protein
 * that is not interchangeable with the rest: no tryptophan, very little
 * leucine, so it does not do what whey or casein do for muscle even though the
 * gram count on the front of the tub is identical.
 */
const PROTEIN_SOURCES: { match: RegExp; name: string; note: string; tone: Tone }[] = [
  {
    match: /whey isolate|isolate whey/,
    name: 'Whey isolate',
    note: 'Fast digesting, high leucine, most of the lactose removed.',
    tone: 'good',
  },
  { match: /whey/, name: 'Whey', note: 'Fast digesting and high in leucine.', tone: 'good' },
  { match: /casein/, name: 'Casein', note: 'Slow digesting; the usual choice before a long gap.', tone: 'good' },
  {
    match: /collagen|gelatin|gelatine/,
    name: 'Collagen',
    note: 'Incomplete: no tryptophan and little leucine, so it does not build muscle the way whey or dairy does.',
    tone: 'watch',
  },
  { match: /\bsoy\b|soya|tofu|tempeh|edamame/, name: 'Soy', note: 'Complete plant protein.', tone: 'good' },
  { match: /\bpea protein|pea isolate/, name: 'Pea protein', note: 'Low in methionine; complete when paired with a grain.', tone: 'good' },
  { match: /egg white|egg protein|albumen/, name: 'Egg white', note: 'Complete, and almost pure protein.', tone: 'good' },
  { match: /\begg/, name: 'Egg', note: 'Complete protein with the fat still on it.', tone: 'good' },
  { match: /greek yogurt|greek yoghurt/, name: 'Greek yogurt', note: 'Strained, so roughly twice the protein of plain yogurt.', tone: 'good' },
  { match: /cottage cheese/, name: 'Cottage cheese', note: 'Mostly casein, slow digesting.', tone: 'good' },
  { match: /chicken|turkey|beef|pork|lamb|steak|mince/, name: 'Meat', note: 'Complete protein.', tone: 'good' },
  { match: /salmon|tuna|cod|shrimp|prawn|sardine|mackerel|haddock|tilapia/, name: 'Fish or shellfish', note: 'Complete protein.', tone: 'good' },
  { match: /lentil|chickpea|black bean|kidney bean|bean\b/, name: 'Pulses', note: 'Protein and fibre together; low in methionine on their own.', tone: 'good' },
  { match: /almond|peanut|cashew|walnut|pistachio|nut butter/, name: 'Nuts', note: 'Protein arrives with a good deal of fat.', tone: 'good' },
]

/* ---------------------------------------------------------------- carbs -- */

const REFINED = /corn syrup|high fructose|maltodextrin|dextrose|cane sugar|glucose syrup|white flour|enriched flour|rice syrup|invert sugar/
const WHOLE = /whole grain|wholegrain|whole wheat|wholemeal|oat|barley|quinoa|brown rice|rye|buckwheat|bulgur|farro/

/* ------------------------------------------------------------------ fat -- */

const GOOD_FAT = /olive oil|avocado|salmon|mackerel|sardine|walnut|almond|flax|chia|tahini/
const HARD_FAT = /hydrogenated|palm oil|shortening|margarine/

function text(food: Food): string {
  return `${food.name} ${food.brand ?? ''}`.toLowerCase()
}

/** A share of one nutrient in another, guarded against a zero denominator. */
function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0
}

export function analyseFood(food: Food, n: Nutrients): FoodInsight {
  const t = text(food)
  const good: Insight[] = []
  const watch: Insight[] = []

  /* ---- protein ---- */
  let protein: string | null = null
  if (n.protein >= 1) {
    const source = PROTEIN_SOURCES.find((p) => p.match.test(t))
    const perCal = share(n.protein, n.calories) * 100
    if (source) {
      protein = source.name
      ;(source.tone === 'good' ? good : watch).push({
        label: `${source.name} protein`,
        detail: source.note,
        tone: source.tone,
      })
    }
    if (perCal >= 10) {
      good.push({
        label: 'Protein dense',
        detail: `${Math.round(n.protein)} g of protein for ${Math.round(n.calories)} calories.`,
        tone: 'good',
      })
    }
  }

  /* ---- carbohydrate ---- */
  let carbs: string | null = null
  if (n.carbs >= 1) {
    const sugarShare = share(n.sugar, n.carbs)
    const fiberShare = share(n.fiber, n.carbs)
    if (WHOLE.test(t) && fiberShare >= 0.08) {
      carbs = 'Whole grain'
      good.push({
        label: 'Whole grain carbohydrate',
        detail: `${Math.round(n.fiber)} g fibre alongside ${Math.round(n.carbs)} g of carbs.`,
        tone: 'good',
      })
    } else if (sugarShare >= 0.65) {
      carbs = 'Mostly sugar'
      watch.push({
        label: 'Mostly sugar',
        detail: `${Math.round(n.sugar)} g of the ${Math.round(n.carbs)} g of carbohydrate is sugar.`,
        tone: 'watch',
      })
    } else if (fiberShare >= 0.15) {
      carbs = 'High fibre'
      good.push({
        label: 'Fibre rich',
        detail: `${Math.round(n.fiber)} g fibre, ${Math.round(fiberShare * 100)}% of the carbohydrate.`,
        tone: 'good',
      })
    } else {
      carbs = 'Starch'
    }
    if (REFINED.test(t)) {
      watch.push({
        label: 'Refined ingredients',
        detail: 'The name lists a syrup, a refined flour or a sugar.',
        tone: 'watch',
      })
    }
  }

  /* ---- fat ---- */
  let fat: string | null = null
  if (n.fat >= 1) {
    const satShare = share(n.satFat, n.fat)
    const unsat = n.monoFat + n.polyFat
    if (HARD_FAT.test(t)) {
      fat = 'Hard fat'
      watch.push({
        label: 'Hydrogenated or palm fat',
        detail: 'The kind of fat dietary guidance is about limiting.',
        tone: 'watch',
      })
    } else if (satShare >= 0.5) {
      fat = 'Mostly saturated'
      watch.push({
        label: 'Mostly saturated fat',
        detail: `${Math.round(n.satFat)} g of the ${Math.round(n.fat)} g of fat.`,
        tone: 'watch',
      })
    } else if (unsat > n.satFat || GOOD_FAT.test(t)) {
      fat = 'Mostly unsaturated'
      good.push({
        label: 'Unsaturated fat',
        detail: 'More of the fat is mono or polyunsaturated than saturated.',
        tone: 'good',
      })
    } else {
      fat = 'Mixed'
    }
    if (n.transFat >= 0.5) {
      watch.push({
        label: 'Trans fat',
        detail: `${n.transFat.toFixed(1)} g. There is no useful amount of this.`,
        tone: 'watch',
      })
    }
  }

  /* ---- the rest ---- */
  if (n.sodium >= 600) {
    watch.push({
      label: 'High sodium',
      detail: `${Math.round(n.sodium)} mg, around a quarter of a day in one serving.`,
      tone: 'watch',
    })
  } else if (n.sodium > 0 && n.sodium <= 140) {
    good.push({ label: 'Low sodium', detail: `${Math.round(n.sodium)} mg.`, tone: 'good' })
  }

  if (n.fiber >= 5) {
    good.push({ label: 'Good fibre', detail: `${Math.round(n.fiber)} g in one serving.`, tone: 'good' })
  }
  if (n.sugar >= 20) {
    watch.push({ label: 'Sugar heavy', detail: `${Math.round(n.sugar)} g of sugar.`, tone: 'watch' })
  }
  if (n.potassium >= 400) {
    good.push({ label: 'Potassium', detail: `${Math.round(n.potassium)} mg.`, tone: 'good' })
  }

  const micros = ([
    ['Vitamin A', n.vitaminA],
    ['Vitamin C', n.vitaminC],
    ['Calcium', n.calcium],
    ['Iron', n.iron],
  ] as [string, number][]).filter(([, v]) => v >= 15)
  if (micros.length) {
    good.push({
      label: micros.map(([k]) => k).join(', '),
      detail: micros.map(([k, v]) => `${k} ${Math.round(v)}% DV`).join(' · '),
      tone: 'good',
    })
  }

  return { protein, carbs, fat, good, watch }
}
