import type { Food } from '../types'
import { SEED_FOODS } from '../data/seedFoods'

/**
 * Local relevance scoring for the built-in database.
 *
 * Ranks by where the query lands rather than raw substring presence, so
 * "chicken" surfaces "Chicken Breast" above "Chipotle Chicken Burrito Bowl".
 */
/**
 * Forms of a term worth matching. Spoken and typed queries are usually plural
 * ("eggs", "berries") while database names are singular ("Egg, Large"), so a
 * strict match misses the obvious answer.
 */
function variants(term: string): string[] {
  const out = [term]
  if (term.length > 3) {
    if (term.endsWith('ies')) out.push(term.slice(0, -3) + 'y')
    else if (term.endsWith('es')) out.push(term.slice(0, -2))
    if (term.endsWith('s')) out.push(term.slice(0, -1))
  }
  return out
}

/**
 * Lowercased name/brand per food, computed once.
 *
 * With tens of thousands of foods in the pool, calling `toLowerCase()` inside
 * the scorer means hundreds of thousands of string allocations per keystroke.
 * A WeakMap keeps the cache tied to the food objects' own lifetime.
 */
const KEYS = new WeakMap<Food, { name: string; brand: string; len: number }>()

function keysFor(food: Food) {
  let k = KEYS.get(food)
  if (!k) {
    const name = food.name.toLowerCase()
    const brand = (food.brand ?? '').toLowerCase()
    k = { name, brand, len: name.length + brand.length + 1 }
    KEYS.set(food, k)
  }
  return k
}

function score(food: Food, terms: string[][]): number {
  const { name, brand, len } = keysFor(food)

  let total = 0
  for (const forms of terms) {
    let best = -1
    for (const [i, term] of forms.entries()) {
      const inName = name.indexOf(term)
      const inBrand = brand.indexOf(term)
      if (inName < 0 && inBrand < 0) continue

      let s = 0
      if (inName === 0) s += 100
      else if (inName > 0 && /\s/.test(name[inName - 1] ?? '')) s += 70
      else if (inName > 0) s += 35
      if (inBrand === 0) s += 40
      else if (inBrand > 0) s += 20

      /* Whole-word matches beat matches buried inside a longer word, or
         "egg" ranks Eggplant above Egg. This bonus has to outweigh the
         length tie-break below, which otherwise favours the shorter name. */
      if (inName >= 0) {
        const after = name[inName + term.length]
        if (after === undefined || /[\s,(]/.test(after)) s += 60
      }

      // Slight penalty for matching on a derived form rather than the original.
      s -= i * 5
      best = Math.max(best, s)
    }
    if (best < 0) return -1 // every term must appear in some form
    total += best
  }

  // Prefer concise names — "Apple" over "Apple Juice" for the query "apple".
  total -= len * 0.2
  return total
}

/**
 * Everyday words map to the food people actually mean. Without this, "egg"
 * ranks "Egg Yolk" first and "rice" ranks "Rice Cake" first, because the
 * scorer has no way to know which entry is the base food.
 */
const COMMON_ALIASES: Record<string, string> = {
  egg: 'egg, large',
  eggs: 'egg, large',
  chicken: 'chicken breast, grilled',
  'chicken breast': 'chicken breast, grilled',
  rice: 'white rice, cooked',
  'brown rice': 'brown rice, cooked',
  bread: 'whole wheat bread',
  milk: '2% milk',
  yogurt: 'greek yogurt, plain nonfat',
  'greek yogurt': 'greek yogurt, plain nonfat',
  cheese: 'cheddar cheese',
  salmon: 'salmon, cooked',
  tuna: 'tuna, canned in water',
  beef: 'ground beef, 93% lean',
  steak: 'sirloin steak',
  pork: 'pork chop',
  turkey: 'ground turkey, 93% lean',
  shrimp: 'shrimp, cooked',
  oatmeal: 'oatmeal, cooked',
  oats: 'rolled oats, dry',
  pasta: 'pasta, cooked',
  potato: 'potato, baked',
  potatoes: 'potato, baked',
  'sweet potato': 'sweet potato, baked',
  spinach: 'spinach, raw',
  kale: 'kale, raw',
  lettuce: 'romaine lettuce',
  beans: 'black beans',
  lentils: 'lentils, cooked',
  coffee: 'coffee, black',
  butter: 'butter',
  avocado: 'avocado',
  banana: 'banana',
  apple: 'apple',
}

export function searchLocal(query: string, extra: Food[] = [], limit = 60): Food[] {
  const raw = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  // Seed foods first: they're curated, so they win ties against bulk imports.
  const pool = [...SEED_FOODS, ...extra]
  if (!raw.length) return pool.slice(0, limit)

  // Ranked but unsliced — the alias promotion below has to see the whole list,
  // or a caller asking for one result never gets the promotion applied.
  const run = (words: string[]) =>
    pool
      .map((f) => ({ f, s: score(f, words.map(variants)) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.f)

  let hits = run(raw)
  let matchedWords = raw

  /* Every word must match, which is right for "chicken breast" but wrong for
     "salmon fillet" when the database only knows "Salmon". Fall back to single
     words, in the order given — the head noun is nearly always first. */
  if (hits.length === 0 && raw.length > 1) {
    for (const w of raw) {
      hits = run([w])
      if (hits.length) {
        matchedWords = [w]
        break
      }
    }
  }

  /* A bare everyday word should land on the obvious food, not an oddity —
     "egg" means a whole egg, not the yolk. Keyed on whatever actually matched,
     so the single-word fallback gets the promotion too. */
  const alias = COMMON_ALIASES[matchedWords.join(' ')]
  if (alias) {
    const i = hits.findIndex((f) => f.name.toLowerCase() === alias)
    if (i > 0) hits = [hits[i], ...hits.filter((_, k) => k !== i)]
  }

  return hits.slice(0, limit)
}

/** A barcode is 8–14 digits; used to route a typed query straight to lookup. */
export function looksLikeBarcode(query: string): boolean {
  return /^\d{8,14}$/.test(query.trim())
}
