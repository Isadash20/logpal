import type { CustomPlan, MacroSplit } from '../types'
import { caloriesFromMacros, macroGrams } from './nutrition'

const KEYS = ['carbs', 'protein', 'fat'] as const

/**
 * Move one macro's share and let the other two absorb the difference in the
 * proportion they already had, so dragging carbs down does not quietly turn
 * the plan into all fat. The three always total exactly 100.
 */
export function rebalanceSplit(split: MacroSplit, key: keyof MacroSplit, value: number): MacroSplit {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const [a, b] = KEYS.filter((k) => k !== key)
  const rest = 100 - v
  const prevSum = split[a] + split[b]
  const shareA = prevSum > 0 ? Math.round((split[a] / prevSum) * rest) : Math.round(rest / 2)
  return { ...split, [key]: v, [a]: shareA, [b]: rest - shareA }
}

/**
 * What gets saved. Whichever mode the user edited in, both the percentages
 * and the grams are stored, derived from the one they set, so the other
 * mode opens showing the same plan rather than stale numbers.
 */
export function normalizeCustomPlan(c: CustomPlan): CustomPlan {
  const mode = c.macroMode ?? 'percent'
  const waterMl = Math.max(0, Math.round(c.waterMl || 0))
  if (mode === 'grams') {
    const grams = {
      carbs: Math.max(0, Math.round(c.macroGrams?.carbs ?? 0)),
      protein: Math.max(0, Math.round(c.macroGrams?.protein ?? 0)),
      fat: Math.max(0, Math.round(c.macroGrams?.fat ?? 0)),
    }
    const calories = Math.round(caloriesFromMacros(grams))
    const total = grams.carbs * 4 + grams.protein * 4 + grams.fat * 9
    const split: MacroSplit =
      total > 0
        ? rebalanceSplit(
            { carbs: 0, protein: Math.round(((grams.protein * 4) / total) * 100), fat: Math.round(((grams.fat * 9) / total) * 100) },
            'carbs',
            Math.round(((grams.carbs * 4) / total) * 100),
          )
        : c.macroSplit
    return { calories, macroSplit: split, waterMl, macroMode: 'grams', macroGrams: grams }
  }
  const calories = Math.max(0, Math.round(c.calories || 0))
  return {
    calories,
    macroSplit: c.macroSplit,
    waterMl,
    macroMode: 'percent',
    macroGrams: macroGrams(calories, c.macroSplit),
  }
}
