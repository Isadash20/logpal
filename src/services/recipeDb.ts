import type { Recipe } from '../types'

/**
 * The shipped recipe catalogue, fetched rather than bundled.
 *
 * Five hundred recipes with their methods and ingredient lists is about 600 kB.
 * Compiled into the bundle that is 600 kB every visitor downloads before the
 * app paints, whether or not they ever open the Plan tab. As an asset it is
 * fetched the first time recipes are wanted and cached by the browser for a
 * week, which is the same bargain `food-db.json` already makes and for the same
 * reason.
 *
 * A failed fetch is not an error state. The app still has the recipes the user
 * wrote and the handful of seeds, which is a smaller Plan tab rather than a
 * broken one.
 */

interface CatalogPayload {
  source: string
  license: string
  count: number
  publishedCalories: Record<string, number>
  recipes: Recipe[]
}

let catalog: Recipe[] = []
let published: Record<string, number> = {}
let loaded = false
let failed = false
let inflight: Promise<void> | null = null

const listeners = new Set<() => void>()

/** Notified when the catalogue lands, so an open Plan tab can re-render. */
export function onCatalogLoaded(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function loadCatalog(): Promise<void> {
  if (loaded || failed) return Promise.resolve()
  if (inflight) return inflight

  inflight = fetch('/recipes.json')
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status))
      return res.json() as Promise<CatalogPayload>
    })
    .then((payload) => {
      catalog = payload.recipes ?? []
      published = payload.publishedCalories ?? {}
      loaded = true
      for (const fn of listeners) fn()
    })
    .catch(() => {
      // No catalogue is a smaller app, not a broken one.
      failed = true
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

export function catalogRecipes(): Recipe[] {
  return catalog
}

/** How many are in memory. Doubles as a cache key while the fetch is in flight. */
export function catalogSize(): number {
  return catalog.length
}

/**
 * Per-serving calories as USDA published them.
 *
 * Kept alongside the recipes so the ingredient parser can be checked against
 * five hundred known answers rather than against itself. The only reason its
 * accuracy is a number anyone can quote.
 */
export function publishedCaloriesFor(id: string): number | undefined {
  return published[id]
}

export function allPublishedCalories(): Record<string, number> {
  return published
}
