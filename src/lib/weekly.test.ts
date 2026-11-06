import { describe, expect, it } from 'vitest'
import { weekCounts } from './weekly'

describe('weekCounts', () => {
  it('counts days inside the goal, not every logged day', () => {
    const w = weekCounts([
      { calories: 1900, calorieGoal: 2000, waterMl: 2500, waterGoalMl: 2500, steps: 9000, stepGoal: 8000 },
      { calories: 2300, calorieGoal: 2000, waterMl: 1000, waterGoalMl: 2500, steps: null, stepGoal: 8000 },
      { calories: 300, calorieGoal: 2000, waterMl: 2600, waterGoalMl: 2500, steps: 7999, stepGoal: 8000 },
      { calories: 0, calorieGoal: 2000, waterMl: 0, waterGoalMl: 2500, steps: 12000, stepGoal: 8000 },
    ])
    expect(w).toEqual({ loggedDays: 3, calorieDays: 1, waterDays: 2, stepDays: 2, steps: 28999 })
  })
})
