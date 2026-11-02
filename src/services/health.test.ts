import { describe, expect, it } from 'vitest'
import { defaultData } from '../lib/storage'
import { mergeHealth, type HealthReading } from './health'

const empty: HealthReading = { steps: [], weights: [], workouts: [] }
const TODAY = '2026-11-02'

describe('mergeHealth', () => {
  it('replaces typed steps with the phone count, but keeps a day Health has nothing for', () => {
    const d = defaultData()
    d.days['2026-11-01'] = { water: 0, completed: false, steps: 4000 }
    d.days['2026-10-31'] = { water: 0, completed: false, steps: 2500 }
    const r = mergeHealth(
      d,
      { ...empty, steps: [{ date: '2026-11-01', steps: 8123 }, { date: '2026-10-31', steps: 0 }, { date: '2026-11-03', steps: 900 }] },
      TODAY,
    )
    expect(r.steps).toBe(1)
    expect(d.days['2026-11-01'].steps).toBe(8123)
    expect(d.days['2026-10-31'].steps).toBe(2500)
    expect(d.days['2026-11-03']).toBeUndefined()
  })

  it('fills weigh-ins only where the diary has none, skipping what LogPal itself wrote', () => {
    const d = defaultData()
    d.weights = [{ date: '2026-11-01', weight: 180 }]
    const r = mergeHealth(
      d,
      {
        ...empty,
        weights: [
          { date: '2026-11-01', at: '', kg: 70, own: false, source: 'Scale' },
          { date: '2026-10-30', at: '', kg: 81, own: false, source: 'Scale' },
          { date: '2026-10-30', at: '', kg: 82, own: false, source: 'Scale' },
          { date: '2026-10-29', at: '', kg: 99, own: true, source: 'LogPal' },
        ],
      },
      TODAY,
    )
    expect(r.weights).toBe(1)
    expect(d.weights.map((w) => w.date)).toEqual(['2026-10-30', '2026-11-01'])
    expect(d.weights[0].weight).toBeCloseTo(180.8, 1)
    expect(d.profile.currentWeight).toBe(180)
  })

  it('imports workouts once, keyed by the Health id', () => {
    const d = defaultData()
    const reading: HealthReading = {
      ...empty,
      workouts: [
        { id: 'A', date: '2026-11-01', start: '2026-11-01T08:00:00Z', end: '', minutes: 31.6, calories: 287.4, activity: 'Running', source: 'Watch', own: false },
        { id: 'B', date: '2026-11-01', start: '', end: '', minutes: 0.4, activity: 'Walking', source: 'Watch', own: false },
      ],
    }
    expect(mergeHealth(d, reading, TODAY).workouts).toBe(1)
    expect(mergeHealth(d, reading, TODAY).workouts).toBe(0)
    expect(d.exerciseEntries).toHaveLength(1)
    expect(d.exerciseEntries[0]).toMatchObject({ id: 'hk:A', kind: 'cardio', name: 'Running', minutes: 32, caloriesBurned: 287 })
  })
})
