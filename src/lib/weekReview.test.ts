import { describe, expect, it } from 'vitest'
import { dayStatus, weekReview, weekScore, weekStart, type DayInput } from './weekReview'

function day(date: string, calories: number, extra: Partial<DayInput> = {}): DayInput {
  return {
    date, calories, protein: 120, carbs: 200, fat: 60, goal: 2000, proteinTarget: 130, carbsTarget: 220, fatTarget: 65,
    waterMl: 2500, waterGoal: 2500, steps: null, stepGoal: 8000, sleepMin: null, sleepGoal: 450,
    exerciseMinutes: 0, exerciseCalories: 0, ...extra,
  }
}
const START = '2026-10-26' // a Monday
const week = (cals: number[]) => cals.map((c, i) => day(`2026-10-${26 + i}`, c))

describe('week review', () => {
  it('finds Monday', () => {
    expect(weekStart('2026-11-06')).toBe('2026-11-02')
    expect(weekStart('2026-11-02')).toBe('2026-11-02')
    expect(weekStart('2026-11-01')).toBe('2026-10-26')
  })

  it('reads a day', () => {
    expect(dayStatus(day('x', 0))).toBe('none')
    expect(dayStatus(day('x', 1900))).toBe('in')
    expect(dayStatus(day('x', 2300))).toBe('over')
    expect(dayStatus(day('x', 600))).toBe('under')
  })

  it('scores a full good week high and an empty one at zero', () => {
    expect(weekScore(week([1900, 1950, 2000, 1800, 2050, 1900, 1990]), 7).score).toBeGreaterThan(8.5)
    expect(weekScore(week([0, 0, 0, 0, 0, 0, 0]).map((d) => ({ ...d, waterMl: 0 })), 7).score).toBe(0)
  })

  it('ignores steps and sleep for someone who never records them', () => {
    const a = weekScore(week([1900, 1950, 2000, 1800, 2050, 1900, 1990]), 7).score
    const b = weekScore(week([1900, 1950, 2000, 1800, 2050, 1900, 1990]).map((d) => ({ ...d, steps: 100 })), 7).score
    expect(a).toBeGreaterThan(b)
  })

  it('points next week at the weakest part, and counts only elapsed days mid-week', () => {
    const r = weekReview({
      start: START, today: '2026-10-28',
      days: week([1900, 0, 1950, 0, 0, 0, 0]), prev: null, foods: [], weightBefore: null, weightEnd: null, lifts: [],
    })
    expect(r.partial).toBe(true)
    expect(r.elapsed).toBe(3)
    expect(r.logged).toBe(2)
    expect(r.focus.title).toBe('Log every day')
    expect(r.word).toMatch(/so far$/)
  })

  it('picks stars and swaps from what was eaten more than once', () => {
    const r = weekReview({
      start: START, today: '2026-11-01', days: week([1900, 1950, 2000, 1800, 2050, 1900, 1990]), prev: null,
      foods: [
        { name: 'Greek yogurt', count: 5, score: 8.2, calories: 600 },
        { name: 'Chips', count: 3, score: 2.1, calories: 450 },
        { name: 'Cake', count: 1, score: 1.5, calories: 400 },
        { name: 'Chicken', count: 4, score: 7.4, calories: 900 },
      ],
      weightBefore: 170, weightEnd: 168.5, lifts: [],
    })
    expect(r.stars.map((f) => f.name)).toEqual(['Greek yogurt', 'Chicken'])
    expect(r.swaps.map((f) => f.name)).toEqual(['Chips'])
    expect(r.focus.title).toBe('Keep this going')
  })
})
