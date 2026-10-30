import { describe, expect, it } from 'vitest'
import { normalizeCustomPlan, rebalanceSplit } from './planEditor'

describe('rebalanceSplit', () => {
  it('keeps the total at 100 and the others in proportion', () => {
    const s = rebalanceSplit({ carbs: 50, protein: 20, fat: 30 }, 'carbs', 30)
    expect(s.carbs).toBe(30)
    expect(s.protein + s.fat).toBe(70)
    // 20:30 before, so 28:42 after.
    expect(s.protein).toBe(28)
    expect(s.fat).toBe(42)
  })

  it('splits the remainder evenly when the others were both zero', () => {
    expect(rebalanceSplit({ carbs: 100, protein: 0, fat: 0 }, 'carbs', 40)).toEqual({
      carbs: 40,
      protein: 30,
      fat: 30,
    })
  })

  it('clamps to 0..100', () => {
    expect(rebalanceSplit({ carbs: 50, protein: 20, fat: 30 }, 'fat', 140).fat).toBe(100)
    expect(rebalanceSplit({ carbs: 50, protein: 20, fat: 30 }, 'fat', -5).fat).toBe(0)
  })
})

describe('normalizeCustomPlan', () => {
  it('derives grams from the split in percent mode', () => {
    const c = normalizeCustomPlan({
      calories: 2000,
      macroSplit: { carbs: 50, protein: 20, fat: 30 },
      waterMl: 2500,
      macroMode: 'percent',
    })
    expect(c.macroGrams).toEqual({ carbs: 250, protein: 100, fat: 67 })
    expect(c.calories).toBe(2000)
  })

  it('derives calories and the split from grams in grams mode', () => {
    const c = normalizeCustomPlan({
      calories: 1,
      macroSplit: { carbs: 1, protein: 1, fat: 98 },
      waterMl: 2000,
      macroMode: 'grams',
      macroGrams: { carbs: 200, protein: 150, fat: 60 },
    })
    expect(c.calories).toBe(200 * 4 + 150 * 4 + 60 * 9)
    expect(c.macroSplit.carbs + c.macroSplit.protein + c.macroSplit.fat).toBe(100)
    // 600 of 1,940 calories.
    expect(c.macroSplit.protein).toBe(31)
  })

  it('treats an old save with no mode as percent', () => {
    const c = normalizeCustomPlan({
      calories: 1800,
      macroSplit: { carbs: 40, protein: 30, fat: 30 },
      waterMl: 2000,
    })
    expect(c.macroMode).toBe('percent')
    expect(c.macroGrams?.protein).toBe(135)
  })
})
