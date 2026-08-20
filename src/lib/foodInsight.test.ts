import { describe, expect, it } from 'vitest'
import { analyseFood } from './foodInsight'
import type { Food, Nutrients } from '../types'

const n = (o: Partial<Nutrients>): Nutrients =>
  ({
    calories: 0, carbs: 0, fat: 0, protein: 0, satFat: 0, polyFat: 0, monoFat: 0,
    transFat: 0, cholesterol: 0, sodium: 0, potassium: 0, fiber: 0, sugar: 0,
    vitaminA: 0, vitaminC: 0, calcium: 0, iron: 0, ...o,
  }) as Nutrients

const food = (name: string, brand?: string): Food =>
  ({ id: 'f', name, brand, nutrients: n({}), servings: [], source: 'usda' }) as Food

describe('analyseFood', () => {
  it('separates collagen from the proteins that build muscle', () => {
    const r = analyseFood(food('Collagen Peptides'), n({ calories: 70, protein: 18 }))
    expect(r.protein).toBe('Collagen')
    expect(r.watch.some((i) => i.label.includes('Collagen'))).toBe(true)
  })

  it('reads whey isolate ahead of plain whey', () => {
    const r = analyseFood(food('Whey Isolate Vanilla'), n({ calories: 110, protein: 25 }))
    expect(r.protein).toBe('Whey isolate')
  })

  it('calls carbohydrate that is mostly sugar what it is', () => {
    const r = analyseFood(food('Cola'), n({ calories: 140, carbs: 39, sugar: 39 }))
    expect(r.carbs).toBe('Mostly sugar')
  })

  it('recognises whole grain when the fibre backs it up', () => {
    const r = analyseFood(food('Whole Wheat Bread'), n({ calories: 120, carbs: 22, fiber: 4 }))
    expect(r.carbs).toBe('Whole grain')
  })

  it('does not call it whole grain on the name alone', () => {
    const r = analyseFood(food('Whole Wheat Crackers'), n({ calories: 130, carbs: 24, fiber: 1 }))
    expect(r.carbs).not.toBe('Whole grain')
  })

  it('separates saturated from unsaturated fat', () => {
    const butter = analyseFood(food('Butter'), n({ calories: 100, fat: 11, satFat: 7 }))
    const oil = analyseFood(food('Olive Oil'), n({ calories: 120, fat: 14, satFat: 2, monoFat: 10 }))
    expect(butter.fat).toBe('Mostly saturated')
    expect(oil.fat).toBe('Mostly unsaturated')
  })

  it('flags sodium worth noticing and credits the opposite', () => {
    expect(
      analyseFood(food('Instant Noodles'), n({ calories: 380, sodium: 1600 })).watch.some((i) =>
        i.label.includes('sodium'),
      ),
    ).toBe(true)
    expect(
      analyseFood(food('Rolled Oats'), n({ calories: 150, sodium: 5 })).good.some((i) =>
        i.label.includes('Low sodium'),
      ),
    ).toBe(true)
  })
})
