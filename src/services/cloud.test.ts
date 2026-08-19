import { describe, expect, it } from 'vitest'
import type { AppData, FoodEntry } from '../types'
import { defaultData } from '../lib/storage'
import { emptyNutrients } from '../lib/nutrition'
import { days, diffCollection, foodEntries, measurements } from './cloud'

/**
 * The differ decides what gets written to and deleted from a user's account.
 * A mistake here does not throw — it quietly loses a day's food or re-uploads
 * the entire diary every 250 ms — so it is tested directly rather than only
 * through the UI.
 */

function entry(id: string, over: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id,
    date: '2026-08-06',
    meal: 'morning',
    foodId: `food_${id}`,
    name: 'Oatmeal',
    servingLabel: '1 cup',
    servings: 1,
    nutrients: emptyNutrients(),
    source: 'seed',
    loggedAt: 1_754_400_000_000,
    ...over,
  }
}

function withEntries(...es: FoodEntry[]): AppData {
  return { ...defaultData(), foodEntries: es }
}

describe('diffCollection', () => {
  it('uploads everything when there is no previous snapshot', () => {
    const next = withEntries(entry('a'), entry('b'))
    const { changed, gone } = diffCollection(foodEntries, null, next)

    expect(changed).toHaveLength(2)
    expect(gone).toHaveLength(0)
  })

  it('writes nothing when nothing changed', () => {
    // The store re-renders constantly; if an unchanged snapshot produced a
    // write, every keystroke anywhere in the app would re-upload the diary.
    const snapshot = withEntries(entry('a'), entry('b'))
    const { changed, gone } = diffCollection(foodEntries, snapshot, snapshot)

    expect(changed).toEqual([])
    expect(gone).toEqual([])
  })

  it('ignores object identity and compares by value', () => {
    // The store deep-clones on every mutation, so nothing is ever ===.
    const prev = withEntries(entry('a'))
    const next = withEntries(entry('a'))
    expect(diffCollection(foodEntries, prev, next).changed).toEqual([])
  })

  it('sends only the row that changed', () => {
    const prev = withEntries(entry('a'), entry('b'))
    const next = withEntries(entry('a'), entry('b', { servings: 2 }))
    const { changed, gone } = diffCollection(foodEntries, prev, next)

    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatchObject({ id: 'b', servings: 2 })
    expect(gone).toEqual([])
  })

  it('sends an added row without touching the others', () => {
    const prev = withEntries(entry('a'))
    const next = withEntries(entry('a'), entry('b'))
    const { changed, gone } = diffCollection(foodEntries, prev, next)

    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatchObject({ id: 'b' })
    expect(gone).toEqual([])
  })

  it('reports a removed row by primary key alone', () => {
    const prev = withEntries(entry('a'), entry('b'))
    const next = withEntries(entry('a'))
    const { changed, gone } = diffCollection(foodEntries, prev, next)

    expect(changed).toEqual([])
    expect(gone).toEqual([{ id: 'b' }])
  })

  it('maps optional fields to null rather than dropping them', () => {
    // An absent key in an upsert leaves the old value in place, so clearing a
    // brand would not actually clear it.
    const prev = withEntries(entry('a', { brand: 'Quaker' }))
    const next = withEntries(entry('a', { brand: undefined }))
    const { changed } = diffCollection(foodEntries, prev, next)

    expect(changed).toHaveLength(1)
    expect(changed[0]).toHaveProperty('brand', null)
  })

  describe('days, which is a record rather than a list', () => {
    const withDays = (d: AppData['days']): AppData => ({ ...defaultData(), days: d })

    it('flattens the record into keyed rows', () => {
      const next = withDays({ '2026-08-06': { water: 500, completed: false } })
      const { changed } = diffCollection(days, null, next)

      expect(changed).toEqual([
        { date: '2026-08-06', water: 500, completed: false, sleep_min: null, steps: null },
      ])
    })

    it('detects an edit to an existing day', () => {
      const prev = withDays({ '2026-08-06': { water: 500, completed: false } })
      const next = withDays({ '2026-08-06': { water: 750, completed: true } })
      const { changed, gone } = diffCollection(days, prev, next)

      expect(changed).toEqual([
        { date: '2026-08-06', water: 750, completed: true, sleep_min: null, steps: null },
      ])
      expect(gone).toEqual([])
    })

    /* Null, not zero: a day with no figure has not been slept through, it has
       not been recorded, and the two must not arrive at the server the same. */
    it('sends sleep and steps, and nulls when they are absent', () => {
      const next = withDays({
        '2026-08-06': { water: 500, completed: false, sleepMin: 435, steps: 8200 },
        '2026-08-07': { water: 0, completed: false },
      })
      const { changed } = diffCollection(days, null, next)

      expect(changed).toEqual([
        { date: '2026-08-06', water: 500, completed: false, sleep_min: 435, steps: 8200 },
        { date: '2026-08-07', water: 0, completed: false, sleep_min: null, steps: null },
      ])
    })

    it('deletes a day that disappeared', () => {
      const prev = withDays({
        '2026-08-05': { water: 100, completed: false },
        '2026-08-06': { water: 500, completed: false },
      })
      const next = withDays({ '2026-08-06': { water: 500, completed: false } })

      expect(diffCollection(days, prev, next).gone).toEqual([{ date: '2026-08-05' }])
    })
  })

  describe('measurements, which have a composite key', () => {
    const withMeasurements = (m: AppData['measurements']): AppData => ({
      ...defaultData(),
      measurements: m,
    })

    it('treats two sites on the same date as separate rows', () => {
      const next = withMeasurements([
        { date: '2026-08-06', key: 'waist', value: 32 },
        { date: '2026-08-06', key: 'hips', value: 38 },
      ])
      expect(diffCollection(measurements, null, next).changed).toHaveLength(2)
    })

    it('deletes by both key columns', () => {
      const prev = withMeasurements([
        { date: '2026-08-06', key: 'waist', value: 32 },
        { date: '2026-08-06', key: 'hips', value: 38 },
      ])
      const next = withMeasurements([{ date: '2026-08-06', key: 'hips', value: 38 }])

      expect(diffCollection(measurements, prev, next).gone).toEqual([
        { date: '2026-08-06', key: 'waist' },
      ])
    })

    it('cannot confuse two keys that differ only in where the split falls', () => {
      // Keys are joined on NUL for exactly this case: naive joining on a space
      // would make both of these "2026-08-06 left arm".
      const prev = withMeasurements([
        { date: '2026-08-06', key: 'left arm', value: 12 },
        { date: '2026-08-06 left', key: 'arm', value: 99 },
      ])
      const next = withMeasurements([{ date: '2026-08-06', key: 'left arm', value: 12 }])

      const { changed, gone } = diffCollection(measurements, prev, next)
      expect(changed).toEqual([])
      expect(gone).toEqual([{ date: '2026-08-06 left', key: 'arm' }])
    })
  })
})
