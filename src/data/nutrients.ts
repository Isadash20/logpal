import type { NutrientKey } from '../types'

export interface NutrientDef {
  key: NutrientKey
  label: string
  unit: 'g' | 'mg' | '%' | 'cal'
  /** Reference daily value used as the default goal. */
  dailyValue: number
  /** Indented beneath its parent on the nutrition label and Nutrients tab. */
  indent?: boolean
  /** Shown on the Nutrients tab (calories and macros get their own tabs). */
  inTable?: boolean
}

/**
 * Order matches a US Nutrition Facts panel, and the daily values are the
 * 2016 FDA reference amounts for a 2,000 calorie diet.
 */
export const NUTRIENTS: NutrientDef[] = [
  { key: 'calories', label: 'Calories', unit: 'cal', dailyValue: 2000, inTable: true },
  { key: 'fat', label: 'Total Fat', unit: 'g', dailyValue: 78, inTable: true },
  { key: 'satFat', label: 'Saturated', unit: 'g', dailyValue: 20, indent: true, inTable: true },
  { key: 'polyFat', label: 'Polyunsaturated', unit: 'g', dailyValue: 0, indent: true, inTable: true },
  { key: 'monoFat', label: 'Monounsaturated', unit: 'g', dailyValue: 0, indent: true, inTable: true },
  { key: 'transFat', label: 'Trans', unit: 'g', dailyValue: 0, indent: true, inTable: true },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', dailyValue: 300, inTable: true },
  { key: 'sodium', label: 'Sodium', unit: 'mg', dailyValue: 2300, inTable: true },
  { key: 'potassium', label: 'Potassium', unit: 'mg', dailyValue: 4700, inTable: true },
  { key: 'carbs', label: 'Total Carbohydrate', unit: 'g', dailyValue: 275, inTable: true },
  { key: 'fiber', label: 'Dietary Fiber', unit: 'g', dailyValue: 28, indent: true, inTable: true },
  { key: 'sugar', label: 'Sugars', unit: 'g', dailyValue: 50, indent: true, inTable: true },
  { key: 'protein', label: 'Protein', unit: 'g', dailyValue: 50, inTable: true },
  { key: 'vitaminA', label: 'Vitamin A', unit: '%', dailyValue: 100, inTable: true },
  { key: 'vitaminC', label: 'Vitamin C', unit: '%', dailyValue: 100, inTable: true },
  { key: 'calcium', label: 'Calcium', unit: '%', dailyValue: 100, inTable: true },
  { key: 'iron', label: 'Iron', unit: '%', dailyValue: 100, inTable: true },
]

export const NUTRIENT_BY_KEY = Object.fromEntries(
  NUTRIENTS.map((n) => [n.key, n])
) as Record<NutrientKey, NutrientDef>

/** Shorter labels for the compact create-food form. */
export const SHORT_LABELS: Partial<Record<NutrientKey, string>> = {
  fat: 'Fat',
  carbs: 'Carbohydrates',
  satFat: 'Saturated Fat',
  polyFat: 'Polyunsaturated Fat',
  monoFat: 'Monounsaturated Fat',
  transFat: 'Trans Fat',
  fiber: 'Fiber',
  sugar: 'Sugars',
}
