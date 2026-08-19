import { describe, expect, it } from 'vitest'
import { restMinutes, workingMinutes } from './recipeTime'
import type { Recipe } from '../types'

const recipe = (steps: string[]): Recipe =>
  ({ id: 'r', name: 'r', servingsMade: 1, items: [], createdAt: 0, steps }) as Recipe

describe('restMinutes', () => {
  it('reads a wait stated in hours', () => {
    expect(restMinutes(recipe(['Leave the dough to rise for 4 hours.']))).toBe(240)
  })

  it('treats overnight as eight hours', () => {
    expect(restMinutes(recipe(['Chill overnight.']))).toBe(480)
  })

  it('ignores the short rest after cooking', () => {
    expect(restMinutes(recipe(['Rest the chops 3 minutes before serving.']))).toBeNull()
  })

  it('does not read cooking time as waiting', () => {
    expect(restMinutes(recipe(['Simmer covered for 2 hours.', 'Bake 45 minutes.']))).toBeNull()
  })

  it('takes the longest wait rather than the sum', () => {
    expect(
      restMinutes(recipe(['Marinate 8 hours.', 'Chill the shaped rolls 40 minutes.'])),
    ).toBe(480)
  })

  it('reads a wait that follows cooking in the same step', () => {
    expect(restMinutes(recipe(['Simmer 20 minutes, then chill for 3 hours.']))).toBe(180)
  })
})

describe('workingMinutes', () => {
  it('prefers the recipe’s own figures', () => {
    const r = { ...recipe(['Bake 45 minutes.']), prepMin: 10, cookMin: 20 } as Recipe
    expect(workingMinutes(r)).toEqual({ mins: 30, estimated: false })
  })

  it('reads the method when the recipe states no time', () => {
    const r = recipe([
      'Chop the onion.',
      'Bake butternut squash until tender (about 45 minutes).',
      'Serve.',
    ])
    expect(workingMinutes(r)).toEqual({ mins: 51, estimated: true })
  })

  it('takes one figure per step, the largest', () => {
    expect(workingMinutes(recipe(['Sear 4 minutes a side, 8 minutes in total.']))).toEqual({
      mins: 8,
      estimated: true,
    })
  })

  it('leaves the long waits to restMinutes', () => {
    const r = recipe(['Marinate 8 hours.', 'Grill 10 minutes.'])
    expect(workingMinutes(r)).toEqual({ mins: 13, estimated: true })
    expect(restMinutes(r)).toBe(480)
  })
})
