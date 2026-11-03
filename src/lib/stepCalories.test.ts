import { describe, expect, it } from 'vitest'
import { stepCalories } from './nutrition'

describe('stepCalories', () => {
  it('puts 10,000 steps for an average adult in the usual 300 to 500 range', () => {
    const kcal = stepCalories(10000, 68, 170)
    expect(kcal).toBeGreaterThan(300)
    expect(kcal).toBeLessThan(500)
  })

  it('scales with the step count', () => {
    expect(stepCalories(0, 68, 170)).toBe(0)
    expect(stepCalories(20000, 68, 170)).toBeCloseTo(2 * stepCalories(10000, 68, 170), -1)
  })

  it('burns more for a heavier walker and a longer stride', () => {
    expect(stepCalories(8000, 68, 220)).toBeGreaterThan(stepCalories(8000, 68, 140))
    expect(stepCalories(8000, 74, 170)).toBeGreaterThan(stepCalories(8000, 62, 170))
  })

  it('ignores a half-filled profile instead of producing nonsense', () => {
    expect(stepCalories(5000, 0, 0)).toBe(stepCalories(5000, 66, 150))
  })
})
