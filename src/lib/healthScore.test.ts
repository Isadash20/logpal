import { describe, expect, it } from 'vitest'
import { healthScore } from './healthScore'
import type { Nutrients } from '../types'

const n = (o: Partial<Nutrients>): Nutrients =>
  ({ calories: 0, protein: 0, fat: 0, satFat: 0, carbs: 0, fiber: 0, sugar: 0,
     sodium: 0, cholesterol: 0, ...o }) as Nutrients

describe('health score', () => {
  it('rates a spinach and egg frittata well', () => {
    /* The case that prompted the rebalance: 132 calories carrying 9.6 g of
       protein, from eggs and spinach, previously scored 4.6 — "Moderate",
       one notch above the bottom band. */
    const s = healthScore(
      n({ calories: 132, protein: 9.58, fat: 9.61, satFat: 3.19, carbs: 1.94,
          fiber: 0.43, sugar: 0.4, sodium: 363.72, cholesterol: 279.56 }),
    )
    expect(s.score).toBeGreaterThanOrEqual(7)
    expect(s.band).toBe('Great')
  })

  it('does not charge fruit for its own sugar', () => {
    const fruit = n({ calories: 160, protein: 2, carbs: 38, fiber: 4, sugar: 26, sodium: 5 })
    const withSweetener = healthScore(fruit, { hasAddedSugar: true }).score
    const asIs = healthScore(fruit).score
    expect(asIs).toBeGreaterThan(withSweetener)
  })

  it('still marks down something sweet and empty', () => {
    const s = healthScore(
      n({ calories: 210, protein: 1.5, fat: 9, satFat: 5.5, carbs: 31, fiber: 0.4,
          sugar: 22, sodium: 150 }),
      { hasAddedSugar: true },
    )
    expect(s.score).toBeLessThan(6)
  })

  it('does not let one salty dish read as bad food', () => {
    /* Sodium is judged per serving, not per calorie: a light savoury dish was
       being punished for being light. */
    const s = healthScore(n({ calories: 150, protein: 12, fiber: 3, sodium: 500, satFat: 1 }))
    expect(s.score).toBeGreaterThanOrEqual(7)
  })
})
