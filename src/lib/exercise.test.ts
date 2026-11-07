import { describe, expect, it } from 'vitest'
import { CURVES, climbCalories, estimate, metAtSpeed, paceLabel } from './exercise'
import { EXERCISE_BY_ID, EXERCISES, searchExercises } from '../data/exercises'

describe('speed curves', () => {
  it('interpolates between points and clamps at the ends', () => {
    expect(metAtSpeed(CURVES.walking, 3.0)).toBe(3.5)
    expect(metAtSpeed(CURVES.walking, 3.25)).toBeCloseTo(3.9, 5)
    expect(metAtSpeed(CURVES.walking, 1.0)).toBe(2.8)
    expect(metAtSpeed(CURVES.running, 20)).toBe(23)
    expect(metAtSpeed(CURVES.running, 0)).toBe(6)
  })
})

describe('estimate', () => {
  const walking = EXERCISE_BY_ID.get('cardio:walking')!
  const football = EXERCISE_BY_ID.get('sports:football')!
  const yoga = EXERCISE_BY_ID.get('cardio:yoga')!

  it('is rough on time alone and asks for distance', () => {
    const e = estimate(walking, { minutes: 60, weightLb: 176 })
    expect(e.tier).toBe('rough')
    expect(e.met).toBe(3.5)
    expect(e.kcal).toBe(293)
    expect(e.next).toMatch(/distance/)
  })

  it('gets closer with a distance: a brisk hour costs more than a slow one', () => {
    const slow = estimate(walking, { minutes: 60, distanceMi: 2, weightLb: 176 })
    const brisk = estimate(walking, { minutes: 60, distanceMi: 4, weightLb: 176 })
    expect(slow.tier).toBe('closer')
    expect(slow.met).toBe(2.8)
    expect(brisk.met).toBe(5)
    expect(brisk.kcal).toBeGreaterThan(slow.kcal)
    expect(brisk.next).toMatch(/elevation/)
  })

  it('adds the climb on top and calls that the best', () => {
    const flat = estimate(walking, { minutes: 60, distanceMi: 3, weightLb: 176 })
    const hilly = estimate(walking, { minutes: 60, distanceMi: 3, elevationFt: 1000, weightLb: 176 })
    expect(hilly.tier).toBe('best')
    expect(hilly.kcal - flat.kcal).toBe(climbCalories(176, 1000))
    expect(climbCalories(176, 1000)).toBe(238)
  })

  it('ignores elevation for activities that do not climb', () => {
    const e = estimate(yoga, { minutes: 30, distanceMi: 1, elevationFt: 500, weightLb: 150 })
    expect(e.tier).toBe('rough')
    expect(e.kcal).toBe(estimate(yoga, { minutes: 30, weightLb: 150 }).kcal)
  })

  it('floors a sport at itself and lets a watch push it up', () => {
    const plain = estimate(football, { minutes: 30, weightLb: 180 })
    const slowWatch = estimate(football, { minutes: 30, distanceMi: 1.5, weightLb: 180 })
    const fastWatch = estimate(football, { minutes: 30, distanceMi: 4, weightLb: 180 })
    expect(plain.next).toMatch(/watch/)
    expect(slowWatch.met).toBe(8)
    expect(slowWatch.tier).toBe('closer')
    expect(fastWatch.met).toBeGreaterThan(8)
  })

  it('formats pace', () => {
    expect(paceLabel(3, 30, 'mi')).toBe('10:00 /mi')
    expect(paceLabel(5, 24.5, 'km')).toBe('4:54 /km')
    expect(paceLabel(0, 30, 'mi')).toBeNull()
  })
})

describe('catalog', () => {
  it('files overlapping activities on both tabs and has no duplicate ids', () => {
    const ids = EXERCISES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    const sports = searchExercises('', 'sports').map((e) => e.name)
    expect(sports).toContain('Mountain Biking')
    expect(sports).toContain('Water Polo')
    expect(searchExercises('', 'cardio').map((e) => e.name)).toContain('Mountain Biking')
    expect(searchExercises('', 'strength').map((e) => e.name)).not.toContain('Walking')
    expect(searchExercises('walk', 'cardio')[0].name).toBe('Walking')
  })
})
