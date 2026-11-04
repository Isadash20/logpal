import { beforeEach, describe, expect, it } from 'vitest'
import { ZERO_NUTRIENTS } from './nutrition'
import { achievementsFor, markCelebrated, uncelebrated, type DayState } from './celebrations'

function state(over: Partial<DayState> = {}): DayState {
  return {
    date: '2026-11-04',
    consumed: 0,
    goal: 2000,
    nutrients: { ...ZERO_NUTRIENTS },
    macroTargets: { protein: 150, carbs: 200, fat: 60 },
    log: { water: 0, completed: false },
    waterTarget: 2000,
    waterText: '8 cups',
    profile: { stepGoal: 8000, sleepGoalMin: 480, goalWeight: 160, startWeight: 190 },
    latestWeight: 180,
    fasts: [],
    now: Date.parse('2026-11-04T12:00:00Z'),
    weightText: '160 lb',
    ...over,
  }
}

const keys = (s: DayState) => achievementsFor(s).map((a) => a.key)

describe('achievementsFor', () => {
  it('finds nothing on an empty day', () => {
    expect(keys(state())).toEqual([])
  })

  it('counts calories only inside five percent of the goal', () => {
    expect(keys(state({ consumed: 1900 }))).toEqual(['calories'])
    expect(keys(state({ consumed: 1700 }))).toEqual([])
    expect(keys(state({ consumed: 2200 }))).toEqual([])
  })

  it('cheers water, steps, sleep and the diary', () => {
    const s = state({ log: { water: 2100, completed: true, steps: 9000, sleepMin: 500 } })
    expect(keys(s)).toEqual(['water', 'steps', 'sleep', 'diary'])
  })

  it('cheers a fast that has reached its target, running or not', () => {
    const now = Date.parse('2026-11-04T12:00:00Z')
    const s = state({
      now,
      fasts: [
        { id: 'a', startedAt: now - 17 * 3_600_000, targetHours: 16, protocol: '16:8' as never },
        { id: 'b', startedAt: now - 5 * 3_600_000, targetHours: 16, protocol: '16:8' as never },
      ],
    })
    expect(achievementsFor(s).map((a) => a.id)).toEqual(['fast:a'])
  })

  it('treats the goal weight by the direction of the journey', () => {
    expect(keys(state({ latestWeight: 159.5 }))).toEqual(['weight'])
    const up = state({
      profile: { stepGoal: 0, sleepGoalMin: 0, goalWeight: 170, startWeight: 150 },
      latestWeight: 171,
    })
    expect(keys(up)).toEqual(['weight'])
    expect(keys(state({ latestWeight: 161 }))).toEqual([])
  })

  it('never cheers a weight above a lower target, whatever the goal kind says', () => {
    const s = state({ profile: { stepGoal: 0, sleepGoalMin: 0, goalWeight: 115, startWeight: 130 }, latestWeight: 130 })
    expect(keys(s)).toEqual([])
  })

  it('needs a logged weigh-in', () => {
    expect(keys(state({ latestWeight: null }))).toEqual([])
  })
})

describe('memory', () => {
  /* Node has no localStorage; a map is all the module needs. */
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    }
  })

  it('cheers each id once', () => {
    const items = achievementsFor(state({ log: { water: 3000, completed: false } }))
    expect(uncelebrated(items)).toHaveLength(1)
    markCelebrated(items)
    expect(uncelebrated(items)).toHaveLength(0)
  })

  it('remembers the weight target across days', () => {
    const items = achievementsFor(state({ latestWeight: 159 }))
    markCelebrated(items)
    const nextDay = achievementsFor(state({ date: '2026-11-05', latestWeight: 158 }))
    expect(uncelebrated(nextDay)).toHaveLength(0)
  })
})
