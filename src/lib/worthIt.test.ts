import { describe, expect, it } from 'vitest'
import { worthIt, type DayBudget } from './worthIt'
import type { Nutrients } from '../types'

const n = (o: Partial<Nutrients>): Nutrients =>
  ({
    calories: 0, carbs: 0, fat: 0, protein: 0, satFat: 0, polyFat: 0, monoFat: 0,
    transFat: 0, cholesterol: 0, sodium: 0, potassium: 0, fiber: 0, sugar: 0,
    vitaminA: 0, vitaminC: 0, calcium: 0, iron: 0, ...o,
  }) as Nutrients

const budget: DayBudget = {
  caloriesLeft: 1200,
  calorieGoal: 2000,
  proteinLeft: 90,
  proteinTarget: 150,
  fiberTarget: 28,
}

describe('worthIt', () => {
  it('rates a lean protein highly', () => {
    const r = worthIt(n({ calories: 190, protein: 40, fiber: 0 }), budget)
    expect(r.band).toBe('Worth it')
    expect(r.score).toBeGreaterThan(7)
  })

  it('rates a sugary drink poorly', () => {
    const r = worthIt(n({ calories: 240, protein: 0, fiber: 0, sugar: 60 }), budget)
    expect(r.band).toBe('Low return')
  })

  it('marks down a food that eats most of what is left', () => {
    const roomy = worthIt(n({ calories: 600, protein: 45, fiber: 6 }), budget)
    const tight = worthIt(n({ calories: 600, protein: 45, fiber: 6 }), {
      ...budget,
      caloriesLeft: 700,
    })
    expect(tight.score).toBeLessThan(roomy.score)
  })

  it('does not treat a full day as free room', () => {
    const r = worthIt(n({ calories: 300, protein: 20 }), { ...budget, caloriesLeft: 0 })
    expect(r.calorieShare).toBeGreaterThan(1)
    expect(r.notes.some((t) => t.includes('already at your calorie target'))).toBe(true)
  })

  it('judges protein against the plan rather than a fixed figure', () => {
    const food = n({ calories: 200, protein: 15 })
    const leanPlan = worthIt(food, { ...budget, proteinTarget: 200 })
    const easyPlan = worthIt(food, { ...budget, proteinTarget: 90 })
    expect(easyPlan.score).toBeGreaterThan(leanPlan.score)
  })
})
