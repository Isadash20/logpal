import { describe, expect, it } from 'vitest'
import { dayInsight, type DayFacts } from './dayInsight'

const base: DayFacts = {
  hour: 15,
  isToday: true,
  consumed: 1100,
  goal: 1900,
  protein: 70,
  proteinTarget: 188,
  water: 1400,
  waterTarget: 3000,
  waterReadout: '6 of 13 cups',
  streak: 3,
  entries: 4,
  mealsLogged: ['morning', 'afternoon'],
  allMacrosMet: false,
}

describe('dayInsight', () => {
  it('says nothing about a day that is not today', () => {
    expect(dayInsight({ ...base, isToday: false })).toBeNull()
  })

  it('opens an empty morning with breakfast', () => {
    const i = dayInsight({ ...base, hour: 8, entries: 0, mealsLogged: [] })!
    expect(i.action?.meal).toBe('morning')
    expect(i.text).toMatch(/Breakfast/)
  })

  it('names the protein gap in the afternoon', () => {
    const i = dayInsight(base)!
    expect(i.text).toMatch(/Protein is at 70 of 188 g/)
    expect(i.text).toMatch(/dinner/)
    expect(i.action?.kind).toBe('recipes')
  })

  it('does not scold for being over', () => {
    const i = dayInsight({ ...base, consumed: 2130, protein: 150 })!
    expect(i.tone).toBe('warn')
    expect(i.text).toMatch(/230 calories over/)
    expect(i.text).not.toMatch(/!/)
  })

  it('celebrates a full set of targets over everything else', () => {
    const i = dayInsight({ ...base, consumed: 2500, allMacrosMet: true })!
    expect(i.tone).toBe('good')
    expect(i.text).toMatch(/Every macro target met/)
  })

  it('nudges water once protein is fine', () => {
    const i = dayInsight({ ...base, protein: 150, water: 500 })!
    expect(i.action?.kind).toBe('water')
    expect(i.text).toMatch(/6 of 13 cups/)
  })
})
