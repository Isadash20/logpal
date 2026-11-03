import { describe, expect, it } from 'vitest'
import { defaultData } from '../lib/storage'
import { mergeEdits } from './merge'
import type { AppData } from '../types'

function withDays(days: AppData['days']): AppData {
  return { ...defaultData(), days }
}

describe('mergeEdits', () => {
  it('keeps water logged on this device and water logged on another', () => {
    const synced = withDays({ '2026-11-02': { water: 3, completed: false } })
    const local = withDays({
      '2026-11-02': { water: 3, completed: false },
      '2026-11-03': { water: 25, completed: false },
    })
    const remote = withDays({ '2026-11-02': { water: 5, completed: true } })
    const out = mergeEdits(synced, local, remote)
    expect(out.days['2026-11-03'].water).toBe(25)
    expect(out.days['2026-11-02']).toEqual({ water: 5, completed: true })
  })

  it('lets a local edit beat the server for the same day', () => {
    const synced = withDays({ d: { water: 1, completed: false } })
    const local = withDays({ d: { water: 9, completed: false } })
    const remote = withDays({ d: { water: 2, completed: false } })
    expect(mergeEdits(synced, local, remote).days.d.water).toBe(9)
  })

  it('takes the server copy when this device changed nothing', () => {
    const synced = withDays({ d: { water: 1, completed: false } })
    const remote = withDays({ d: { water: 4, completed: false } })
    expect(mergeEdits(synced, synced, remote).days.d.water).toBe(4)
  })

  it('carries a local deletion and keeps server additions in a list', () => {
    const base = defaultData()
    const entry = (id: string) =>
      ({ id, date: 'd', meal: 'morning', foodId: id, name: id, servingLabel: 's', servings: 1, nutrients: {}, source: 'seed', loggedAt: 1 }) as unknown as AppData['foodEntries'][number]
    const synced = { ...base, foodEntries: [entry('a'), entry('b')] }
    const local = { ...base, foodEntries: [entry('b'), entry('c')] }
    const remote = { ...base, foodEntries: [entry('a'), entry('b'), entry('z')] }
    const ids = mergeEdits(synced, local, remote).foodEntries.map((e) => e.id)
    expect(ids).toEqual(['b', 'z', 'c'])
  })

  it('prefers a locally changed profile and otherwise the server one', () => {
    const base = defaultData()
    const synced = { ...base, profile: { ...base.profile, name: 'old' } }
    const remote = { ...base, profile: { ...base.profile, name: 'server' } }
    const local = { ...base, profile: { ...base.profile, name: 'mine' } }
    expect(mergeEdits(synced, local, remote).profile.name).toBe('mine')
    expect(mergeEdits(synced, synced, remote).profile.name).toBe('server')
  })

  it('never takes planner data from the server', () => {
    const base = defaultData()
    const local = { ...base, pantry: ['eggs'] }
    expect(mergeEdits(base, local, base).pantry).toEqual(['eggs'])
  })
})
