import type { NutrientKey } from '../types'

/**
 * Read the figures off the text of a nutrition panel.
 *
 * The text comes from OCR, so it is never clean: "0g" arrives as "Og",
 * decimals as commas, and whole lines can be missing. The parser looks for
 * each figure by the words a label prints next to it and takes the first
 * plausible number after them. Anything implausible for its unit is dropped,
 * and the caller treats fewer than two hits as "could not read it". The
 * numbers always land in a form the user checks before saving.
 *
 * Both panel styles are covered: the US "Nutrition Facts" per serving, and
 * the European "per 100 g" table (Energy in kcal, "of which saturates",
 * "of which sugars", salt rather than sodium).
 */
export interface LabelReading {
  values: Partial<Record<NutrientKey, number>>
  servingLabel?: string
  servingGrams?: number
  /** True when the figures are for 100 g rather than a serving. */
  per100g: boolean
  /** How many figures were read. */
  found: number
}

/** What a scan hands to the create-food form. */
export interface LabelPrefill {
  values: Partial<Record<NutrientKey, number>>
  servingLabel?: string
  servingGrams?: number
}

/* A number as OCR prints it: digits, a decimal point or comma, or a bare
   letter O standing in for a zero in front of a unit. */
const NUM = String.raw`(\d+(?:[.,]\d+)?|[Oo](?=\s*(?:g|mg|mcg|%)))`
/* A gram sign as OCR prints it: g, or the 9 and ¢ it turns into. Because
   NUM is greedy and this must follow it, "Total Fat 89" backs off to 8 + 9. */
const G = String.raw`\s*(?:g\b|9\b|¢)`
const MG = String.raw`\s*mg\b`

interface Rule {
  key: NutrientKey
  patterns: RegExp[]
  max: number
  /** Multiply the captured figure, e.g. salt → sodium. */
  scale?: number
}

const RULES: Rule[] = [
  {
    key: 'calories',
    patterns: [
      /[cg]alories\s*(?:per\s*serving)?\s*[:\-]?\s*(?<![\d,])(\d{1,4})\b(?!,\d)(?!\s*(?:calories\s*a\s*day|a\s*day))/i,
      /(?<![\d,])(\d{1,4})\s*[cg]alories\b(?!\s*a\s*day)/i,
      /(?<![\d,])(\d{1,4})\s*kcal/i,
    ],
    max: 2000,
  },
  { key: 'fat', patterns: [re(`total\\s*fat\\D{0,6}${NUM}${G}`), re(`(?:^|\\n)\\s*fat\\D{0,6}${NUM}${G}`)], max: 300 },
  { key: 'satFat', patterns: [re(`saturat\\w*\\s*(?:fat)?\\D{0,6}${NUM}${G}`)], max: 300 },
  { key: 'transFat', patterns: [re(`trans\\s*(?:fat)?\\D{0,6}${NUM}${G}`)], max: 100 },
  { key: 'polyFat', patterns: [re(`polyunsat\\w*\\s*(?:fat)?\\D{0,6}${NUM}${G}`)], max: 300 },
  { key: 'monoFat', patterns: [re(`monounsat\\w*\\s*(?:fat)?\\D{0,6}${NUM}${G}`)], max: 300 },
  { key: 'cholesterol', patterns: [re(`cholest\\w*\\D{0,6}${NUM}${MG}`)], max: 10000 },
  {
    key: 'sodium',
    patterns: [re(`sodium\\D{0,6}${NUM}${MG}`), re(`sodium\\D{0,6}${NUM}${G}`)],
    max: 10000,
  },
  { key: 'potassium', patterns: [re(`potassium\\D{0,6}${NUM}${MG}`)], max: 10000 },
  {
    key: 'carbs',
    patterns: [re(`total\\s*carb\\w*\\D{0,6}${NUM}${G}`), re(`carbohydrates?\\D{0,6}${NUM}${G}`)],
    max: 300,
  },
  { key: 'fiber', patterns: [re(`(?:dietary\\s*)?fib(?:er|re)\\D{0,6}${NUM}${G}`)], max: 100 },
  {
    key: 'sugar',
    patterns: [
      re(`total\\s*sugars?\\D{0,6}${NUM}${G}`),
      re(`of\\s*which\\s*sugars?\\D{0,6}${NUM}${G}`),
      re(`(?<!added\\s)(?<!includes\\s)sugars?\\D{0,6}${NUM}${G}`),
    ],
    max: 300,
  },
  { key: 'protein', patterns: [re(`protein\\D{0,6}${NUM}${G}`)], max: 300 },
  { key: 'calcium', patterns: [re(`calcium\\D{0,6}(?:\\d+(?:[.,]\\d+)?\\s*mg\\s*)?(\\d{1,3})\\s*%`)], max: 999 },
  { key: 'iron', patterns: [re(`[il]ron\\D{0,6}(?:\\d+(?:[.,]\\d+)?\\s*mg\\s*)?(\\d{1,3})\\s*%`)], max: 999 },
  { key: 'vitaminA', patterns: [re(`vitamin\\s*a\\b\\D{0,6}(?:\\d+(?:[.,]\\d+)?\\s*mcg\\s*)?(\\d{1,3})\\s*%`)], max: 999 },
  { key: 'vitaminC', patterns: [re(`vitamin\\s*c\\b\\D{0,6}(?:\\d+(?:[.,]\\d+)?\\s*mg\\s*)?(\\d{1,3})\\s*%`)], max: 999 },
]

function re(source: string): RegExp {
  return new RegExp(source, 'i')
}

function toNumber(raw: string): number {
  if (/^[Oo]$/.test(raw)) return 0
  return parseFloat(raw.replace(',', '.'))
}

/** Tidy OCR output enough for the rules: one space per gap, no stray pipes. */
export function normalizeLabelText(text: string): string {
  return text
    .replace(/[|¦]/g, ' ')
    .replace(/[“”"']/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

export function parseNutritionLabel(raw: string): LabelReading {
  const text = normalizeLabelText(raw)
  const values: Partial<Record<NutrientKey, number>> = {}

  for (const rule of RULES) {
    for (const p of rule.patterns) {
      const m = text.match(p)
      if (!m || m[1] == null) continue
      const n = toNumber(m[1]) * (rule.scale ?? 1)
      if (!Number.isFinite(n) || n < 0 || n > rule.max) continue
      values[rule.key] = Math.round(n * 10) / 10
      break
    }
  }

  /* European panels print salt, not sodium: 1 g of salt is 400 mg of sodium. */
  if (values.sodium == null) {
    const salt = text.match(re(`salt\\D{0,6}${NUM}${G}`))
    if (salt) {
      const g = toNumber(salt[1])
      if (g >= 0 && g <= 25) values.sodium = Math.round(g * 400)
    }
  }

  const per100g = /per\s*100\s*(?:g|ml)|100\s*(?:g|ml)\s*(?:contains|provides|serving)|\bper\s*100\b/i.test(text)

  let servingLabel: string | undefined
  let servingGrams: number | undefined
  /* "(55g)" comes out of OCR as "(559)" often enough that a trailing 9 in
     the unit's place is read as the g it was. */
  const serving = text.match(
    /serving\s*size\s*[:\-]?\s*([^\n(]*?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(g|9|ml|mL|oz)\s*\)/i,
  )
  if (serving) {
    const label = serving[1].trim()
    const amount = toNumber(serving[2])
    const unit = serving[3].toLowerCase() === '9' ? 'g' : serving[3].toLowerCase()
    if (unit === 'g' && amount > 0 && amount <= 2000) servingGrams = amount
    servingLabel = label || `${amount} ${unit === 'oz' ? 'oz' : unit}`
  } else {
    const loose = text.match(/serving\s*size\s*[:\-]?\s*([^\n]{1,40})/i)
    if (loose) {
      const label = loose[1].trim().replace(/\s*servings?\s*per\s*container.*$/i, '')
      const grams = label.match(/^(\d+(?:[.,]\d+)?)\s*g$/i)
      if (grams) servingGrams = toNumber(grams[1])
      if (label) servingLabel = label
    }
  }
  if (!servingLabel && per100g) {
    servingLabel = '100 g'
    servingGrams = 100
  }

  return {
    values,
    servingLabel,
    servingGrams,
    per100g,
    found: Object.keys(values).length,
  }
}
