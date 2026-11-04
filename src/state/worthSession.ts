import { useSyncExternalStore } from 'react'
import type { Food } from '../types'

/**
 * The NutriScan comparison, held outside the screen.
 *
 * The router shows one route at a time, so pushing the barcode or label
 * scanner on top of NutriScan unmounts it, and whatever it was holding went
 * with it. Comparing two scanned foods was impossible: the second scan came
 * back to an empty screen. The pair lives here instead, and a scanner hands
 * its result in with `deliver` rather than pushing a new route. Which slot it
 * fills is decided by which one NutriScan asked for.
 */
export interface WorthSession {
  first: Food | null
  second: Food | null
  /** Which slot the next scan or search fills. */
  picking: 'first' | 'second'
}

let state: WorthSession = { first: null, second: null, picking: 'first' }
const listeners = new Set<() => void>()

function set(next: Partial<WorthSession>) {
  state = { ...state, ...next }
  for (const fn of listeners) fn()
}

export const worthSession = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  /** A food arriving from a scanner, a search, or a route. */
  deliver(food: Food) {
    if (state.picking === 'second' && state.first) set({ second: food, picking: 'first' })
    else set({ first: food, second: null, picking: 'first' })
  },
  pick(slot: 'first' | 'second') {
    set({ picking: slot })
  },
  clearSecond() {
    set({ second: null, picking: 'first' })
  },
  reset() {
    set({ first: null, second: null, picking: 'first' })
  },
}

export function useWorthSession(): WorthSession {
  return useSyncExternalStore(worthSession.subscribe, worthSession.get, worthSession.get)
}
