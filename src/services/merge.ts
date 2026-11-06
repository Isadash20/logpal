import type { AppData } from '../types'

/**
 * Three-way merge of a device's edits onto a fresh cloud copy.
 *
 * `synced` is the last snapshot this device knew the server held, `local` is
 * what the device holds now, `remote` is what the server holds now. Anything
 * the device changed since `synced` is a local edit and is kept; everything
 * else comes from the server, so edits made on another device land here
 * without the two devices overwriting each other. A whole-snapshot "cloud
 * wins" or "device wins" cannot do that: one of them always loses a day's
 * water.
 *
 * Pure, so it can be tested without a database.
 */
export function mergeEdits(synced: AppData, local: AppData, remote: AppData): AppData {
  return {
    ...remote,

    profile: pick(synced.profile, local.profile, remote.profile),
    settings: pick(synced.settings, local.settings, remote.settings),
    fasting: pick(synced.fasting, local.fasting, remote.fasting),
    favoriteFoodIds: pick(synced.favoriteFoodIds, local.favoriteFoodIds, remote.favoriteFoodIds),
    recentFoodIds: pick(synced.recentFoodIds, local.recentFoodIds, remote.recentFoodIds),

    foodEntries: mergeList(synced.foodEntries, local.foodEntries, remote.foodEntries, (e) => e.id),
    exerciseEntries: mergeList(
      synced.exerciseEntries,
      local.exerciseEntries,
      remote.exerciseEntries,
      (e) => e.id,
    ),
    weights: mergeList(synced.weights, local.weights, remote.weights, (w) => w.date),
    measurements: mergeList(
      synced.measurements,
      local.measurements,
      remote.measurements,
      (m) => `${m.date}|${m.key}`,
    ),
    fasts: mergeList(synced.fasts, local.fasts, remote.fasts, (f) => f.id),
    customFoods: mergeList(synced.customFoods, local.customFoods, remote.customFoods, (f) => f.id),
    savedMeals: mergeList(synced.savedMeals, local.savedMeals, remote.savedMeals, (m) => m.id),
    recipes: mergeList(synced.recipes, local.recipes, remote.recipes, (r) => r.id),

    days: mergeRecord(synced.days, local.days, remote.days),
    foodCache: mergeRecord(synced.foodCache, local.foodCache, remote.foodCache),
    scannedBarcodes: mergeRecord(synced.scannedBarcodes, local.scannedBarcodes, remote.scannedBarcodes),

    /* Not in any cloud collection yet; the device is the only copy. */
    planEntries: local.planEntries,
    shopping: local.shopping,
    pantry: local.pantry,
    savedRecipeIds: local.savedRecipeIds,
    recentSearches: local.recentSearches,
    lifts: local.lifts,
  }
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** A singleton: the local copy if this device changed it, else the server's. */
function pick<T>(synced: T, local: T, remote: T): T {
  return same(synced, local) ? remote : local
}

function mergeRecord<T>(
  synced: Record<string, T>,
  local: Record<string, T>,
  remote: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = { ...remote }
  for (const key of new Set([...Object.keys(synced), ...Object.keys(local)])) {
    if (same(synced[key], local[key])) continue
    if (key in local) out[key] = local[key]
    else delete out[key]
  }
  return out
}

function mergeList<T>(synced: T[], local: T[], remote: T[], keyOf: (item: T) => string): T[] {
  const byKey = (items: T[]) => Object.fromEntries(items.map((i) => [keyOf(i), i]))
  const merged = mergeRecord(byKey(synced), byKey(local), byKey(remote))
  /* Server order first, then this device's additions in the order it made them. */
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of remote) {
    const k = keyOf(item)
    if (k in merged && !seen.has(k)) {
      out.push(merged[k])
      seen.add(k)
    }
  }
  for (const item of local) {
    const k = keyOf(item)
    if (k in merged && !seen.has(k)) {
      out.push(merged[k])
      seen.add(k)
    }
  }
  return out
}
