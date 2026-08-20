/**
 * Builds an offline food database from Open Food Facts.
 *
 * NOTE: this is no longer what produces the shipped `public/food-db.json`,
 * `build-usda-db.mjs` is. USDA FoodData Central has generic foods, US brand
 * coverage and real household serving sizes, none of which Open Food Facts
 * offers in useful quantity. This is kept for the cases FDC does not cover:
 * non-US products, and anything identified only by barcode.
 *
 * Output from this script must be run through `trim-food-db.mjs`, and written
 * to a different path unless you intend to replace the USDA database.
 *
 * Pulls the most-scanned products from Open Food Facts across a wide spread of
 * brands and categories, normalises them into the app's Food shape, and writes
 * one compact JSON file. Run it with:
 *
 *     node scripts/build-food-db.mjs [--pages 3] [--out public/food-db.json]
 *
 * Sorting by `unique_scans_n` matters: it is the difference between a database
 * of things people actually eat and a database of obscure regional SKUs.
 *
 * OFF rate-limits search to roughly 10 requests per minute per IP, so requests
 * are spaced deliberately. A full run takes a while. That is the price of not
 * getting throttled into opaque failures halfway through.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

// Search-a-licious: far faster and far more reliable than the legacy CGI
// search, which returns intermittent 503s under load. Unusable from a browser
// (no CORS headers) but perfectly fine from Node, which is where this runs.
const SEARCH = 'https://search.openfoodfacts.org/search'
const UA = 'LogPal/0.1 (offline database build)'
const FIELDS = [
  'code',
  'product_name',
  'brands',
  'serving_size',
  'serving_quantity',
  'nutriments',
].join(',')

/** Queries chosen for coverage: big brands, restaurant chains, staple categories. */
const BRANDS = [
  'Chobani', 'Fairlife', 'Quest Nutrition', 'Clif Bar', 'KIND', 'RXBAR', 'Nature Valley',
  'General Mills', 'Kelloggs', 'Post', 'Quaker', 'Nabisco', 'Lays', 'Doritos', 'Cheetos',
  'Pringles', 'Ritz', 'Oreo', 'Goldfish', 'Pepperidge Farm', 'Campbells', 'Progresso',
  'Amys', 'Annies', 'Kraft', 'Heinz', 'Hellmanns', 'Hidden Valley', 'Ben & Jerrys',
  'Haagen Dazs', 'Halo Top', 'Talenti', 'Yoplait', 'Dannon', 'Oikos', 'Siggis',
  'Silk', 'Oatly', 'Almond Breeze', 'Califia Farms', 'Tropicana', 'Minute Maid',
  'Coca Cola', 'Pepsi', 'Dr Pepper', 'Gatorade', 'Powerade', 'Red Bull', 'Monster',
  'Celsius', 'Starbucks', 'Dunkin', 'Nespresso', 'Lipton', 'Snapple', 'La Croix',
  'Barilla', 'Ronzoni', 'Banza', 'Uncle Bens', 'Minute Rice', 'Near East',
  'Tyson', 'Perdue', 'Applegate', 'Oscar Mayer', 'Hormel', 'Jimmy Dean', 'Johnsonville',
  'Bumble Bee', 'StarKist', 'Chicken of the Sea', 'Morning Star', 'Beyond Meat',
  'Impossible Foods', 'Gardein', 'Tofurky', 'Boca',
  'Wonder Bread', 'Sara Lee', 'Daves Killer Bread', 'Thomas', 'Arnold', 'Nature’s Own',
  'Kodiak Cakes', 'Bisquick', 'Krusteaz', 'Eggo', 'Pillsbury', 'Betty Crocker',
  'Hersheys', 'Mars', 'Snickers', 'Reeses', 'Kit Kat', 'M&Ms', 'Twix', 'Milka',
  'Lindt', 'Ghirardelli', 'Nutella', 'Jif', 'Skippy', 'Peter Pan', 'Justins',
  'Planters', 'Blue Diamond', 'Wonderful Pistachios', 'Emerald',
  'Great Value', 'Kirkland Signature', 'Trader Joes', 'Whole Foods 365', 'Aldi',
  'Simple Truth', 'Good & Gather', 'Market Pantry', 'Signature Select',
  'Premier Protein', 'Optimum Nutrition', 'Gold Standard', 'Muscle Milk', 'Orgain',
  'Vega', 'Garden of Life', 'Isopure', 'BSN', 'Dymatize',
  'Nestle', 'Danone', 'Unilever', 'Mondelez', 'Ferrero', 'Lindt', 'Bahlsen',
  'President', 'Activia', 'Actimel', 'Alpro', 'Yeo Valley', 'Muller',
  'Tesco', 'Sainsburys', 'Asda', 'Morrisons', 'Waitrose', 'Marks & Spencer',
  'Carrefour', 'Auchan', 'Leclerc', 'Lidl', 'Rewe', 'Edeka',
]

const CATEGORIES = [
  'breakfast cereals', 'yogurts', 'greek yogurt', 'cheeses', 'cheddar', 'mozzarella',
  'milks', 'plant milk', 'oat milk', 'almond milk', 'soy milk', 'creamers',
  'breads', 'whole wheat bread', 'bagels', 'tortillas', 'pita', 'croissants',
  'pasta', 'rice', 'brown rice', 'quinoa', 'couscous', 'noodles', 'ramen',
  'chicken breast', 'ground beef', 'steak', 'pork', 'bacon', 'sausages', 'deli meat',
  'salmon', 'tuna', 'shrimp', 'white fish', 'sardines',
  'eggs', 'egg whites', 'tofu', 'tempeh', 'seitan',
  'beans', 'black beans', 'chickpeas', 'lentils', 'hummus', 'peanut butter',
  'almonds', 'walnuts', 'cashews', 'trail mix', 'granola', 'protein bars',
  'chips', 'crackers', 'popcorn', 'pretzels', 'cookies', 'candy', 'chocolate',
  'ice cream', 'frozen yogurt', 'frozen meals', 'pizza', 'frozen pizza',
  'soups', 'sauces', 'pasta sauce', 'salsa', 'salad dressing', 'mayonnaise',
  'olive oil', 'butter', 'margarine', 'honey', 'maple syrup', 'jam',
  'apples', 'bananas', 'berries', 'citrus', 'melons', 'grapes', 'dried fruit',
  'vegetables', 'salad', 'potatoes', 'sweet potato', 'broccoli', 'spinach',
  'juice', 'orange juice', 'smoothies', 'soda', 'energy drinks', 'sports drinks',
  'coffee', 'tea', 'kombucha', 'sparkling water', 'beer', 'wine',
  'protein powder', 'meal replacement', 'sandwiches', 'wraps', 'burritos', 'sushi',
]

const args = process.argv.slice(2)
const argVal = (flag, def) => {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const PAGES = Number(argVal('--pages', '4'))
const OUT = argVal('--out', 'public/food-db.json')
const PAGE_SIZE = 250
const DELAY_MS = Number(argVal('--delay', '300'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : 0
}

const DV = { vitaminA: 900e-6, vitaminC: 90e-3, calcium: 1300e-3, iron: 18e-3 }

function titleCase(s) {
  return s.replace(/\w\S*/g, (t) =>
    t.length > 3 && t === t.toUpperCase() ? t : t[0].toUpperCase() + t.slice(1)
  )
}

/** Same normalisation the runtime adapter uses, kept in sync deliberately. */
function toFood(p) {
  if (!p.code || !p.product_name || !p.nutriments) return null
  const nut = p.nutriments
  const g = (k) => num(nut[`${k}_100g`])

  const kcal = g('energy-kcal') || num(nut['energy_100g']) / 4.184
  const carbs = g('carbohydrates')
  const fat = g('fat')
  const protein = g('proteins')
  if (kcal <= 0 && carbs <= 0 && fat <= 0 && protein <= 0) return null
  // Implausible values are almost always unit-entry errors upstream.
  if (kcal > 950) return null

  const sodiumG = nut['sodium_100g'] !== undefined ? g('sodium') : g('salt') * 0.4
  const pctOf = (k, dv) => {
    const v = g(k)
    return !v || !dv ? 0 : Math.min(999, (v / dv) * 100)
  }

  const per100 = {
    calories: kcal,
    carbs,
    fat,
    protein,
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

  const servingG = num(p.serving_quantity)
  const hasServing = servingG > 0 && servingG < 2000
  const baseGrams = hasServing ? servingG : 100
  const factor = baseGrams / 100
  const base = {}
  for (const [k, v] of Object.entries(per100)) base[k] = Math.round(v * factor * 100) / 100

  const brandRaw = Array.isArray(p.brands) ? p.brands[0] : (p.brands || '').split(',')[0]

  return {
    c: p.code,
    n: titleCase(p.product_name.trim()).slice(0, 80),
    b: brandRaw ? titleCase(brandRaw.trim()).slice(0, 40) : '',
    s: hasServing ? (p.serving_size || `${Math.round(servingG)} g`).slice(0, 30) : '100 g',
    g: Math.round(baseGrams * 10) / 10,
    v: [
      base.calories, base.carbs, base.fat, base.protein, base.satFat, base.polyFat,
      base.monoFat, base.transFat, base.cholesterol, base.sodium, base.potassium,
      base.fiber, base.sugar, base.vitaminA, base.vitaminC, base.calcium, base.iron,
    ],
  }
}

/**
 * OFF's search endpoint throws intermittent 503s under load and 429s when
 * you're too eager. Both are transient, so back off and retry rather than
 * dropping the term, losing a term costs ~100 foods.
 */
async function fetchPage(term, page, attempt = 1) {
  const MAX_ATTEMPTS = 4
  const url =
    `${SEARCH}?q=${encodeURIComponent(term)}&page_size=${PAGE_SIZE}&page=${page}` +
    `&sort_by=-unique_scans_n&fields=${FIELDS}`

  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA } })
  } catch (err) {
    if (attempt >= MAX_ATTEMPTS) throw err
    await sleep(4000 * attempt)
    return fetchPage(term, page, attempt + 1)
  }

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= MAX_ATTEMPTS) throw new Error(`${res.status} after ${attempt} tries`)
    const wait = res.status === 429 ? 30_000 : 2000 * attempt
    await sleep(wait)
    return fetchPage(term, page, attempt + 1)
  }
  if (!res.ok) throw new Error(`${res.status} for "${term}" p${page}`)

  const json = await res.json()
  return json.hits ?? []
}

async function main() {
  const terms = [...CATEGORIES, ...BRANDS]
  const byCode = new Map()
  // Collapse regional duplicates of the same product.
  const seenLabel = new Set()
  let requests = 0

  console.log(`Fetching ${terms.length} terms × ${PAGES} page(s), ${PAGE_SIZE}/page…`)

  for (const [i, term] of terms.entries()) {
    for (let page = 1; page <= PAGES; page++) {
      try {
        const products = await fetchPage(term, page)
        requests++
        let added = 0
        for (const p of products) {
          const f = toFood(p)
          if (!f) continue
          if (byCode.has(f.c)) continue
          const label = `${f.n}|${f.b}|${Math.round(f.v[0])}`
          if (seenLabel.has(label)) continue
          seenLabel.add(label)
          byCode.set(f.c, f)
          added++
        }
        console.log(
          `[${i + 1}/${terms.length}] ${term} p${page}: +${added} (total ${byCode.size})`
        )
        if (products.length < PAGE_SIZE) break
      } catch (err) {
        console.warn(`  skip "${term}" p${page}: ${err.message}`)
      }
      await sleep(DELAY_MS)
    }
  }

  /* Insertion order is popularity order, results arrive sorted by
     `unique_scans_n` per term. It MUST survive to `trim-food-db.mjs`, whose
     whole selection strategy is "keep the first N".

     Sorting alphabetically here used to be the last step, and it silently
     turned that trim into "keep every food whose name begins A through C". The
     shipped database had 11,531 foods starting with C and 37 in total for D
     through Z: no Doritos, no Gatorade, no Eggo, and a search for a store's
     own-brand shrimp came back empty. Sort at display time, never here. */
  const foods = [...byCode.values()]
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify({ version: 1, count: foods.length, foods }))
  const mb = (JSON.stringify(foods).length / 1e6).toFixed(1)
  console.log(`\nWrote ${foods.length} foods to ${OUT} (${mb} MB) in ${requests} requests.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
