import { describe, expect, it } from 'vitest'
import { unpackRow, type PackedFood } from './foodDb'

const milk: PackedFood = {
  c: 'usda_1',
  n: 'Milk',
  b: '',
  k: 0,
  v: [61, 4.8, 3.3, 3.2],
  p: [
    ['Guideline amount per fl oz of', 2.5],
    ['1 fl oz', 30.5],
    ['Guideline amount per cup of hot', 15],
    ['1 cup', 244],
  ],
}

describe('unpackRow', () => {
  it('drops USDA guideline notes and bases nutrition on the first real portion', () => {
    const food = unpackRow(milk)
    const labels = food.servings.map((s) => s.label)
    expect(labels.some((l) => /guideline/i.test(l))).toBe(false)
    expect(labels[0]).toBe('1 fl oz')
    expect(food.nutrients.calories).toBeCloseTo(61 * 0.305, 1)
  })

  it('falls back to 100 g when every portion was a note', () => {
    const onlyNotes: PackedFood = { ...milk, p: [['Guideline amount on regular', 5]] }
    expect(unpackRow(onlyNotes).servings[0].label).toBe('100 g')
  })
})
