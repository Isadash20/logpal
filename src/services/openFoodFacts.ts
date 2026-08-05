import type { Food, Nutrients, Serving } from '../types'
import { emptyNutrients } from '../lib/nutrition'
import { titleCase } from '../lib/format'

/**
 * Open Food Facts adapter.
 *
 * Two endpoints on `world.openfoodfacts.org`: the v2 read API for barcode
 * lookup, and the legacy CGI search for full text. Both send CORS headers, so
 * they work from the browser.
 *
 * The newer Search-a-licious service (search.openfoodfacts.org) is deliberately
 * NOT used — it serves no `Access-Control-Allow-Origin` header, so browser
 * fetches fail with a bare "Failed to fetch". It works from curl, which is what
 * makes the difference easy to miss.
 *
 * OFF rate-limits to 15 product reads and 10 searches per minute per IP, so
 * searches are debounced by the caller and in-flight requests are aborted when
 * the query changes.
 */

const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product'
const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl'

const FIELDS = [
  'code',
  'product_name',
  'brands',
  'serving_size',
  'serving_quantity',
  'nutriments',
  'image_front_small_url',
  'quantity',
].join(',')

/** Browsers set their own User-Agent and forbid overriding it, so identify via
 *  a query parameter instead — OFF accepts `app_name`/`app_uuid` for this. */
const APP_PARAMS = 'app_name=FitLog&app_version=0.1'

interface OFFNutriments {
  [key: string]: number | string | undefined
}

interface OFFProduct {
  code?: string
  product_name?: string
  brands?: string | string[]
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: OFFNutriments
  image_front_small_url?: string
  quantity?: string
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

function brandOf(brands: string | string[] | undefined): string | undefined {
  if (!brands) return undefined
  const first = Array.isArray(brands) ? brands[0] : brands.split(',')[0]
  return first ? titleCase(first.trim()) : undefined
}

/** Reference daily values used to express micronutrients as a percentage. */
const DV = { vitaminA: 900e-6, vitaminC: 90e-3, calcium: 1300e-3, iron: 18e-3 }

/** OFF reports every `_100g` nutriment in grams. */
function nutrientsPer100g(nut: OFFNutriments): Nutrients {
  const g = (key: string) => num(nut[`${key}_100g`])

  // Sodium is often absent while salt is present; 1 g salt ≈ 0.4 g sodium.
  const sodiumG = nut['sodium_100g'] !== undefined ? g('sodium') : g('salt') * 0.4

  const pctOf = (key: string, dvGrams: number) => {
    const v = g(key)
    if (!v || !dvGrams) return 0
    return Math.min(999, (v / dvGrams) * 100)
  }

  return {
    ...emptyNutrients(),
    calories: g('energy-kcal') || num(nut['energy_100g']) / 4.184,
    carbs: g('carbohydrates'),
    fat: g('fat'),
    protein: g('proteins'),
    satFat: g('saturated-fat'),
    polyFat: g('polyunsaturated-fat'),
    monoFat: g('monounsaturated-fat'),
    transFat: g('trans-fat'),
    cholesterol: g('cholesterol') * 1000,
    sodium: sodiumG * 1000,
    potassium: g('potassium') * 1000,
    fiber: g('fiber'),
    sugar: g('sugars'),
    vitaminA: pctOf('vitamin-a', DV.vitaminA),
    vitaminC: pctOf('vitamin-c', DV.vitaminC),
    calcium: pctOf('calcium', DV.calcium),
    iron: pctOf('iron', DV.iron),
  }
}

function scale(n: Nutrients, factor: number): Nutrients {
  const out = { ...n }
  for (const k of Object.keys(out) as (keyof Nutrients)[]) out[k] = n[k] * factor
  return out
}

/**
 * OFF nutrition is always per 100 g. When the product declares a serving we
 * make that the primary portion, since that is what a user expects to log.
 */
function toFood(p: OFFProduct): Food | null {
  if (!p.code || !p.product_name || !p.nutriments) return null

  const per100 = nutrientsPer100g(p.nutriments)
  if (per100.calories <= 0 && per100.carbs <= 0 && per100.protein <= 0 && per100.fat <= 0) {
    return null // no usable nutrition data
  }

  const servingG = num(p.serving_quantity)
  const hasServing = servingG > 0

  const base = hasServing ? scale(per100, servingG / 100) : per100
  const baseLabel = hasServing
    ? p.serving_size?.trim() || `${Math.round(servingG)} g`
    : '100 g'
  const baseGrams = hasServing ? servingG : 100

  const servings: Serving[] = [
    { label: baseLabel, grams: baseGrams, multiplier: 1 },
    { label: '100 g', grams: 100, multiplier: 100 / baseGrams },
    { label: '1 g', grams: 1, multiplier: 1 / baseGrams },
    { label: '1 oz', grams: 28.35, multiplier: 28.35 / baseGrams },
  ].filter((s, i, arr) => i === 0 || Math.abs(s.grams - arr[0].grams) > 0.01)

  return {
    id: `off_${p.code}`,
    name: titleCase(p.product_name.trim()),
    brand: brandOf(p.brands),
    nutrients: base,
    servings,
    source: 'off',
    barcode: p.code,
    imageUrl: p.image_front_small_url,
  }
}

/* --------------------------------------------------- caching + throttling -- */

/**
 * Open Food Facts allows ~10 searches and ~15 product reads per minute per IP,
 * and punishes overuse by dropping CORS headers — which surfaces in the browser
 * as an opaque "Failed to fetch" rather than a 429. Typing a query one letter
 * at a time will blow through that budget in seconds, so requests are both
 * cached and rate-limited client-side.
 */
export class RateLimitedError extends Error {
  constructor(public retryInSeconds: number) {
    super('Rate limited')
    this.name = 'RateLimitedError'
  }
}

const WINDOW_MS = 60_000
const MAX_SEARCHES = 8
const MAX_LOOKUPS = 12

const searchTimes: number[] = []
const lookupTimes: number[] = []

function takeSlot(times: number[], max: number): void {
  const now = Date.now()
  while (times.length && now - times[0] > WINDOW_MS) times.shift()
  if (times.length >= max) {
    throw new RateLimitedError(Math.ceil((WINDOW_MS - (now - times[0])) / 1000))
  }
  times.push(now)
}

/** Bounded caches so repeating or backspacing a query costs nothing. */
const searchCache = new Map<string, Food[]>()
const barcodeCache = new Map<string, Food | null>()
const MAX_CACHE = 60

function remember<K, V>(cache: Map<K, V>, key: K, value: V): V {
  cache.set(key, value)
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value as K)
  return value
}

/** Network failure after a throttle looks identical to being offline; say so. */
function wrapNetworkError(err: unknown): never {
  if (err instanceof RateLimitedError) throw err
  if ((err as Error)?.name === 'AbortError') throw err
  throw new Error('offline')
}

/* ------------------------------------------------------------- requests -- */

export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal
): Promise<Food | null> {
  const cached = barcodeCache.get(barcode)
  if (cached !== undefined) return cached

  takeSlot(lookupTimes, MAX_LOOKUPS)

  const url = `${PRODUCT_URL}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}&${APP_PARAMS}`
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    wrapNetworkError(err)
  }
  if (res.status === 429) throw new RateLimitedError(60)
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`)

  const json = (await res.json()) as { status?: number; product?: OFFProduct }
  const food = json.status === 1 && json.product ? toFood(json.product) : null
  return remember(barcodeCache, barcode, food)
}

export async function searchProducts(
  query: string,
  signal?: AbortSignal,
  pageSize = 25
): Promise<Food[]> {
  const key = query.trim().toLowerCase().replace(/\s+/g, ' ')
  const cached = searchCache.get(key)
  if (cached) return cached

  takeSlot(searchTimes, MAX_SEARCHES)

  const url =
    `${SEARCH_URL}?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=${pageSize}` +
    `&sort_by=unique_scans_n&fields=${FIELDS}&${APP_PARAMS}`

  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    wrapNetworkError(err)
  }
  if (res.status === 429) throw new RateLimitedError(60)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)

  const json = (await res.json()) as { products?: OFFProduct[] }
  const seen = new Set<string>()
  const out: Food[] = []
  for (const hit of json.products ?? []) {
    const food = toFood(hit)
    if (!food) continue
    // OFF carries regional duplicates of the same product; collapse by label.
    const dedupe = `${food.name}|${food.brand ?? ''}|${Math.round(food.nutrients.calories)}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push(food)
  }
  return remember(searchCache, key, out)
}

/* ------------------------------------------------------------- scanning -- */

interface DetectedBarcode {
  rawValue: string
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}

type BarcodeDetectorCtor = new (opts?: {
  formats?: string[]
}) => BarcodeDetectorLike

/** Native barcode detection; available in Chromium browsers and Android. */
export function getBarcodeDetector(): BarcodeDetectorLike | null {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector
  if (!Ctor) return null
  try {
    return new Ctor({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
    })
  } catch {
    return null
  }
}

export function barcodeScanSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    getBarcodeDetector() !== null
  )
}
