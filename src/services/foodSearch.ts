import type { Food } from '../types'
import { SEED_FOODS } from '../data/seedFoods'
import { foodIndex, unpackRow, type PackedFood } from './foodDb'

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

/**
 * Reference foods outrank packaged ones.
 *
 * The branded half of the database is two orders of magnitude larger than the
 * generic half, so on raw text relevance a search for "shrimp" fills with
 * Maruchan Shrimp Flavour Ramen and shrimp-flavoured crisps long before it
 * reaches shrimp. Someone typing a bare food name almost always wants the food.
 * The bonus is large enough to clear a whole extra term match, because that is
 * the size of the gap it has to close.
 */
const GENERIC_BONUS = 130
/** Hand-checked, so they win ties against anything imported. */
const SEED_BONUS = 150

function sourceBonus(food: Food): number {
  if (food.source === 'seed') return SEED_BONUS
  if (food.generic) return GENERIC_BONUS
  if (food.source === 'custom') return SEED_BONUS
  return 0
}

function score(
  name: string,
  brand: string,
  len: number,
  bonus: number,
  terms: string[][]
): number {
  let total = 0
  for (const forms of terms) {
    let best = -1
    for (let i = 0; i < forms.length; i++) {
      const term = forms[i]
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

  // Prefer concise names, "Apple" over "Apple Juice" for the query "apple".
  total -= len * 0.2
  return total + bonus
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

  /* Ranked but unsliced. The alias promotion below has to see the whole list,
     or a caller asking for one result never gets the promotion applied.

     Two pools are scored against the same scale: the in-memory `Food` objects
     (seed, custom, previously scanned) and the packed bulk database, which is
     left packed. Only the rows that survive into the returned slice are turned
     into `Food` objects, materialising all of them costs about 100 MB of heap
     to build nutrient and serving objects for rows nobody looks at.

     Written as explicit loops rather than map/filter/sort because this runs on
     every keystroke over a couple of hundred thousand rows: the chained version
     allocates a wrapper object per row, and that garbage is easily the most
     expensive thing here. Scoring only what matches keeps allocation
     proportional to the results rather than to the database. */
  const run = (words: string[]) => {
    const forms = words.map(variants)
    const first = forms[0]
    const matched: { f?: Food; row?: PackedFood; s: number }[] = []

    // Cheap rejection on the first term before the full scorer runs. Every
    // term has to match somewhere, so a miss here is a miss overall.
    const possible = (name: string, brand: string) => {
      for (let j = 0; j < first.length; j++) {
        if (name.includes(first[j]) || brand.includes(first[j])) return true
      }
      return false
    }

    for (let i = 0; i < pool.length; i++) {
      const food = pool[i]
      const { name, brand } = keysFor(food)
      if (!possible(name, brand)) continue
      const s = score(name, brand, name.length + brand.length + 1, sourceBonus(food), forms)
      if (s >= 0) matched.push({ f: food, s })
    }

    const { rows, namesLc, brandsLc } = foodIndex()
    for (let i = 0; i < rows.length; i++) {
      const name = namesLc[i]
      const brand = brandsLc[i]
      if (!possible(name, brand)) continue
      const bonus = rows[i].k === 0 ? GENERIC_BONUS : 0
      const s = score(name, brand, name.length + brand.length + 1, bonus, forms)
      if (s >= 0) matched.push({ row: rows[i], s })
    }

    matched.sort((a, b) => b.s - a.s)
    return matched
  }

  let hits = run(raw)
  let matchedWords = raw

  /* Every word must match, which is right for "chicken breast" but wrong for
     "salmon fillet" when the database only knows "Salmon". Fall back to single
     words, in the order given. The head noun is nearly always first. */
  if (hits.length === 0 && raw.length > 1) {
    for (const w of raw) {
      hits = run([w])
      if (hits.length) {
        matchedWords = [w]
        break
      }
    }
  }

  /* A bare everyday word should land on the obvious food, not an oddity,
     "egg" means a whole egg, not the yolk. Keyed on whatever actually matched,
     so the single-word fallback gets the promotion too. */
  const alias = COMMON_ALIASES[matchedWords.join(' ')]
  if (alias) {
    const i = hits.findIndex(
      (h) => (h.f ? h.f.name : (h.row?.n ?? '')).toLowerCase() === alias
    )
    if (i > 0) hits = [hits[i], ...hits.filter((_, k) => k !== i)]
  }

  // Packed rows become Food objects only here, once the list is final.
  return hits.slice(0, limit).map((h) => h.f ?? unpackRow(h.row as PackedFood))
}

/** A barcode is 8-14 digits; used to route a typed query straight to lookup. */
export function looksLikeBarcode(query: string): boolean {
  return /^\d{8,14}$/.test(query.trim())
}
