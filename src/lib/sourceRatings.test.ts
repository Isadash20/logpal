import { describe, expect, it } from 'vitest'
import type { Food, Nutrients } from '../types'
import { ZERO_NUTRIENTS } from './nutrition'
import { sourceRatings } from './sourceRatings'

function food(name: string, n: Partial<Nutrients>): [Food, Nutrients] {
  const nutrients = { ...ZERO_NUTRIENTS, ...n }
  return [{ id: name, name, nutrients, servings: [{ label: '1', multiplier: 1 }], source: 'usda' }, nutrients]
}

describe('sourceRatings', () => {
  it('rates chicken breast an excellent protein source and not a fat or carb source', () => {
    const r = sourceRatings(...food('Chicken breast', { calories: 165, protein: 31, fat: 3.6, satFat: 1, carbs: 0 }))
    expect(r.protein.score).toBeGreaterThanOrEqual(8)
    expect(r.fat.score).toBeLessThan(3)
    expect(r.carbs.label).toBe('Not a source')
    expect(r.clean.score).toBeGreaterThanOrEqual(8)
  })

  it('does not let collagen gummies pass as a protein source', () => {
    const r = sourceRatings(...food('Collagen gummies', { calories: 30, protein: 2.5, carbs: 5, sugar: 4 }))
    expect(r.protein.score).toBeLessThan(3)
    expect(r.protein.detail).toMatch(/collagen/)
  })

  it('rates olive oil an excellent fat source', () => {
    const r = sourceRatings(...food('Olive oil', { calories: 119, fat: 13.5, satFat: 1.9, monoFat: 9.9, polyFat: 1.4 }))
    expect(r.fat.score).toBeGreaterThanOrEqual(8)
  })

  it('caps candy as a carb source and marks it not clean', () => {
    const r = sourceRatings(...food('Gummy candy', { calories: 100, carbs: 25, sugar: 22 }))
    expect(r.carbs.score).toBeLessThanOrEqual(3)
    expect(r.clean.score).toBeLessThan(6)
    expect(r.clean.detail).toMatch(/Sugar/)
  })

  it('does not punish an apple for its sugar', () => {
    const r = sourceRatings(...food('Apple', { calories: 95, carbs: 25, sugar: 19, fiber: 4.4 }))
    expect(r.carbs.score).toBeGreaterThanOrEqual(6)
    expect(r.clean.score).toBeGreaterThanOrEqual(8)
  })

  it('flags salt on jerky', () => {
    const r = sourceRatings(...food('Beef jerky', { calories: 116, protein: 9, fat: 7, satFat: 3, carbs: 3, sugar: 3, sodium: 590 }))
    expect(r.clean.detail).toMatch(/Salt/)
    expect(r.clean.score).toBeLessThan(8)
  })
})
