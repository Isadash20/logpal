import { describe, expect, it } from 'vitest'
import { daysSoFar, duel, margin, scores, suggestedTitle } from './challenges'

describe('challenges', () => {
  it('lists the days covered so far, capped at today and at the end', () => {
    expect(daysSoFar('2026-11-01', '2026-11-07', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(daysSoFar('2026-11-01', '2026-11-03', '2026-11-09')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(daysSoFar('2026-11-05', '2026-11-07', '2026-11-03')).toEqual([])
  })

  it('totals only the window, keeps non-sharers last, and counts days', () => {
    const rows = new Map([
      ['a', [
        { day: '2026-10-31', steps: 9000, waterMl: null },
        { day: '2026-11-01', steps: 4000, waterMl: 500 },
        { day: '2026-11-02', steps: 6000, waterMl: null },
      ]],
      ['b', [{ day: '2026-11-01', steps: 7000, waterMl: 1000 }]],
      ['c', []],
    ])
    const s = scores('steps', ['c', 'a', 'b'], rows, '2026-11-01', '2026-11-07', '2026-11-02')
    expect(s.map((x) => x.userId)).toEqual(['a', 'b', 'c'])
    expect(s[0]).toEqual({ userId: 'a', total: 10000, days: 2 })
    expect(s[2].total).toBeNull()
    const w = scores('water', ['a', 'b'], rows, '2026-11-01', '2026-11-07', '2026-11-02')
    expect(w[0]).toEqual({ userId: 'b', total: 1000, days: 1 })
  })

  it('frames a duel from my side and words the margin', () => {
    const list = [
      { userId: 'them', total: 5000, days: 1 },
      { userId: 'me', total: 4000, days: 1 },
    ]
    const d = duel('me', list)!
    expect(d.you.userId).toBe('me')
    expect(margin(d.you, d.them, String)).toBe('Behind by 1000')
    expect(margin(d.them, d.you, String)).toBe('Leading by 1000')
    expect(margin({ userId: 'me', total: null, days: 0 }, d.them, String)).toBe('Not sharing yet')
    expect(duel('me', [list[0]])).toBeNull()
  })

  it('suggests a name', () => {
    expect(suggestedTitle('water', 7)).toBe('7-Day Water Challenge')
  })
})
