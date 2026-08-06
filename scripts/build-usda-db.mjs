/**
 * Builds the food database from USDA FoodData Central bulk exports.
 *
 *     node scripts/build-usda-db.mjs --src <dir> [--out-dir public]
 *
 * FDC is the right backbone for a US audience in a way Open Food Facts is not.
 * OFF is crowd-sourced and Europe-heavy: searching "white rice" there returns
 * Asda and Sainsbury's before anything a US shopper recognises, and it has
 * almost no *generic* foods at all — no plain "Shrimp", no "Chicken breast,
 * grilled", only packaged goods with barcodes. FDC supplies both halves:
 *
 *   Survey (FNDDS)  ~5.4k  generic foods as people actually eat them, with
 *                          household portions ("1 cup", "1 small/medium shrimp")
 *   SR Legacy       ~7.8k  reference whole foods, portions as amount + modifier
 *   Foundation      ~0.3k  newer lab-analysed whole foods
 *   Branded         ~1.9M  US packaged goods, with real serving sizes
 *
 * Everything here is public domain (USDA), so it can ship inside the app.
 *
 * Get the source files from https://fdc.nal.usda.gov/download-datasets — the
 * JSON exports, unzipped into one directory. `--src` points at that directory.
 *
 * Output is two files, not one. See `pickBranded` for why.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argVal = (flag, def) => {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

const SRC = argVal('--src', 'usda')
const OUT_DIR = argVal('--out-dir', 'public')
/** Branded rows in the eagerly-loaded core file. */
const CORE_BRANDED = Number(argVal('--core-branded', '45000'))
/** Branded rows in the lazily-loaded extension file. */
const EXT_BRANDED = Number(argVal('--ext-branded', '175000'))

/* ------------------------------------------------------------- nutrients -- */

/** FDC nutrient IDs, in the app's fixed NUTRIENT_ORDER. */
const N = {
  calories: 1008,
  carbs: 1005,
  fat: 1004,
  protein: 1003,
  satFat: 1258,
  polyFat: 1293,
  monoFat: 1292,
  transFat: 1257,
  cholesterol: 1253,
  sodium: 1093,
  potassium: 1306,
  fiber: 1079,
  sugar: 2000,
  vitaminA: 1106,
  vitaminC: 1162,
  calcium: 1087,
  iron: 1089,
}

/** Potassium moved IDs between datasets; try both. */
const POTASSIUM_IDS = [1092, 1306]
/** Energy: kcal directly, else the Atwater general factor, else kJ. */
const ENERGY_IDS = [1008, 2047, 2048]
/** Sugars: "total including NLEA" in newer sets, plain "total" in SR Legacy. */
const SUGAR_IDS = [2000, 1063]

/** The app stores these four as a percentage of a daily value, not an amount. */
const DV = { vitaminA: 900, vitaminC: 90, calcium: 1300, iron: 18 }

function nutrientMap(food) {
  const m = new Map()
  for (const fn of food.foodNutrients ?? []) {
    // Bulk exports nest the descriptor; the abridged API flattens it.
    const id = fn.nutrient?.id ?? fn.nutrientId
    const amount = fn.amount ?? fn.value
    if (id == null || amount == null) continue
    // Keep the first non-zero reading; duplicates differ only in derivation.
    if (!m.has(id) || (!m.get(id) && amount)) m.set(id, amount)
  }
  return m
}

function firstOf(m, ids) {
  for (const id of ids) {
    const v = m.get(id)
    if (v) return v
  }
  return 0
}

/** Nutrients per 100 g, in NUTRIENT_ORDER, rounded to keep the file small. */
function nutrientsPer100g(food) {
  const m = nutrientMap(food)

  let kcal = firstOf(m, ENERGY_IDS)
  // 1062 is energy in kJ; only useful if no kcal figure exists at all.
  if (!kcal && m.get(1062)) kcal = m.get(1062) / 4.184

  const pct = (id, dv) => {
    const v = m.get(id)
    return v ? Math.min(999, (v / dv) * 100) : 0
  }

  const vals = [
    kcal,
    m.get(N.carbs) ?? 0,
    m.get(N.fat) ?? 0,
    m.get(N.protein) ?? 0,
    m.get(N.satFat) ?? 0,
    m.get(N.polyFat) ?? 0,
    m.get(N.monoFat) ?? 0,
    m.get(N.transFat) ?? 0,
    m.get(N.cholesterol) ?? 0,
    m.get(N.sodium) ?? 0,
    firstOf(m, POTASSIUM_IDS),
    m.get(N.fiber) ?? 0,
    firstOf(m, SUGAR_IDS),
    pct(N.vitaminA, DV.vitaminA),
    pct(N.vitaminC, DV.vitaminC),
    pct(N.calcium, DV.calcium),
    pct(N.iron, DV.iron),
  ]

  return vals.map((v) => Math.round((Number(v) || 0) * 100) / 100)
}

/* -------------------------------------------------------------- portions -- */

/**
 * FDC writes units as LanguaL codes in places and as plain words in others.
 * Left alone these reach the UI verbatim: "1 ONZ" and "8 OZA" on the serving
 * picker, which reads as corruption.
 */
const UNIT_ALIASES = {
  ONZ: 'oz',
  OZA: 'fl oz',
  GRM: 'g',
  MLT: 'ml',
  LTR: 'l',
  MC: 'cup',
  MP: 'piece',
}

/** Values FDC uses to mean "no household serving given". */
const NO_SERVING = /^(none|n\/a|na|null|undefined|0)$/i

function cleanPortionLabel(s) {
  let out = String(s)
    .replace(/\s+/g, ' ')
    // Unit codes first, while they are still recognisably upper case.
    .replace(/\b(ONZ|OZA|GRM|MLT|LTR)\b/g, (m) => UNIT_ALIASES[m] ?? m)
    /* Portion nouns arrive shouted — "1 CONTAINER", "1 SLICE", "3 PIECES".
       They are ordinary words, not acronyms, and shouting them in a serving
       picker looks like a bug. */
    .replace(/\b[A-Z]{2,}\b/g, (w) => w.toLowerCase())
    // "1 breast quarter (yield after cooking, bone removed)" — the parenthetical
    // is survey bookkeeping and is what pushes these labels past any sane width.
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()

  // Labels arrive with dangling separators and hedges — "12 chips | about".
  out = out.replace(/[\s|,;:-]*\b(about|approx\.?|approximately)?[\s|,;:-]*$/i, '').trim()

  // Truncate on a word boundary; a label cut mid-word ("1 breast quarter
  // (yield after cooking, b") reads as corruption rather than as an ellipsis.
  if (out.length > 34) {
    const cut = out.slice(0, 34)
    const space = cut.lastIndexOf(' ')
    out = (space > 12 ? cut.slice(0, space) : cut).trim()
  }
  return out
}

/**
 * FDC spells portions three different ways depending on the dataset, and none
 * of them is the one the UI wants. Survey has a ready-made `portionDescription`
 * ("1 cup"); SR Legacy has `amount` + `modifier` ("3" + "oz") that need joining;
 * Branded has a `householdServingFullText` plus a gram `servingSize`.
 */
function portionsOf(food) {
  const out = []
  const push = (label, grams) => {
    const g = Number(grams)
    if (!(g > 0) || g > 5000) return
    const l = cleanPortionLabel(label)
    if (!l || !/\p{L}|\d/u.test(l)) return
    if (out.some((p) => p[0].toLowerCase() === l.toLowerCase())) return
    out.push([l, Math.round(g * 10) / 10])
  }

  for (const p of food.foodPortions ?? []) {
    if (p.portionDescription) {
      // "Quantity not specified" is a statistical placeholder, not a portion.
      if (/quantity not specified/i.test(p.portionDescription)) continue
      push(p.portionDescription, p.gramWeight)
      continue
    }
    const unit =
      p.modifier ||
      p.measureUnit?.name ||
      p.measureUnit?.abbreviation ||
      ''
    if (unit && !/undetermined/i.test(unit)) {
      const amount = p.amount ?? p.value ?? 1
      push(`${amount} ${UNIT_ALIASES[unit] ?? unit}`, p.gramWeight)
    }
  }

  return out.slice(0, 6)
}

/** Branded rows carry their serving on the food itself rather than in portions. */
function brandedPortions(food) {
  const out = []
  const size = Number(food.servingSize)
  const unit = String(food.servingSizeUnit ?? '').toLowerCase()
  // ml is only equivalent to grams for water-like products, but FDC gives no
  // density; treating 1 ml as 1 g is the same assumption the labels make.
  const grams = unit === 'g' || unit === 'gram' || unit === 'ml' ? size : 0

  if (grams > 0) {
    const raw = String(food.householdServingFullText ?? '').trim()
    // "None" is a literal value in this dataset, not a missing field.
    const household = raw && !NO_SERVING.test(raw) ? cleanPortionLabel(raw) : ''
    out.push([household || `${Math.round(grams)} g`, grams])
  }
  return out
}

/* ----------------------------------------------------------------- names -- */

/** Genuine acronyms, which look wrong title-cased. */
const ALL_CAPS_KEEP = new Set([
  'BBQ', 'LLC', 'INC', 'II', 'III', 'IV', 'XL', 'XXL', 'USA', 'DHA', 'EPA',
  'MCT', 'UHT', 'NY', 'PB', 'GF', 'BOGO', 'IPA', 'RTD', 'OZ', 'ML',
])

/** Joining words, which look wrong capitalised anywhere but the start. */
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor',
  'of', 'on', 'onto', 'or', 'per', 'the', 'to', 'up', 'via', 'with', 'without',
])

/**
 * Branded descriptions are shouted in the source — "STARKIST, CHUNK LIGHT TUNA
 * IN WATER". A naive rule that preserves any short all-caps token leaves "IN",
 * "TO" and "OF" capitalised mid-sentence, which reads worse than the original.
 */
function titleCase(s) {
  let first = true
  return String(s).replace(/[\p{L}\p{N}''&.-]+/gu, (t) => {
    const upper = t.toUpperCase()
    const lower = t.toLowerCase()
    const isFirst = first
    first = false

    if (ALL_CAPS_KEEP.has(upper)) return upper
    if (!isFirst && MINOR_WORDS.has(lower)) return lower
    // Keep mixed-case and numeric tokens as written ("iPhone", "2%", "8z").
    if (/\d/.test(t)) return t
    return lower[0].toUpperCase() + lower.slice(1)
  })
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** "ALBACORE ALBACORE WHITE TUNA" — the source really does repeat words. */
function collapseRepeats(s) {
  return s.replace(/\b(\p{L}{3,})\b(\s+\1\b)+/giu, '$1')
}

/**
 * Branded descriptions often append the flavour that is already in the name:
 * "Barbecue Tortilla Chips, Barbecue". Dropped only when every meaningful word
 * of the trailing clause already appears earlier, so genuinely additional
 * detail ("Tortilla Chips, Nacho Cheese") survives.
 */
function dropRedundantSuffix(s) {
  const i = s.lastIndexOf(', ')
  if (i < 1) return s
  const head = s.slice(0, i)
  const tail = s.slice(i + 2)
  const headLc = head.toLowerCase()
  const words = tail.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  if (words.length && words.every((w) => headLc.includes(w))) return head
  return s
}

/**
 * FDC descriptions are written for a nutrient database, not for a person
 * scanning a list: "Crustaceans, shrimp, mixed species, cooked, breaded and
 * fried". The leading term is the head noun, which is what makes them sort and
 * read well, so the order is kept — but the taxonomic prefixes that carry no
 * meaning for a diner are dropped.
 */
const NOISE_PREFIXES = [
  /^Crustaceans,\s*/i,
  /^Mollusks,\s*/i,
  /^Fish,\s*/i,
  /^Beef,\s*/i,
  /^Pork,\s*/i,
  /^Chicken,\s*/i,
  /^Turkey,\s*/i,
]

function cleanDescription(desc, { stripTaxonomy }) {
  let s = String(desc).replace(/\s+/g, ' ').trim()

  /* FNDDS survey jargon. "NFS" is "not further specified" and "NS as to X" is
     "not specified as to X" — both mark the *default* version of a food, which
     is exactly the row a plain search for "shrimp" should land on. Left in, the
     abbreviations read as noise and, worse, stop "Shrimp, NFS" from ever
     matching a bare "shrimp" as a whole word. */
  s = s
    .replace(/,?\s*\bNFS\b\.?/gi, '')
    .replace(/,?\s*\bNS as to [^,]*/gi, '')
    .replace(/\s*,\s*$/, '')
    .trim()

  if (stripTaxonomy) {
    for (const re of NOISE_PREFIXES) {
      const next = s.replace(re, '')
      // Only strip when something meaningful survives.
      if (next !== s && next.length > 4) {
        s = next[0].toUpperCase() + next.slice(1)
        break
      }
    }
  }
  return s.slice(0, 90)
}

/* ------------------------------------------------------------- assembling -- */

/** Rejects rows whose numbers cannot be true; see also trim-food-db.mjs. */
function plausible(v) {
  const [kcal, carbs, fat, protein] = v
  if (!(kcal > 0) || kcal > 950) return false
  if (carbs > 105 || fat > 100 || protein > 100) return false
  const implied = carbs * 4 + fat * 9 + protein * 4
  if (implied > 0 && (implied > kcal * 2.6 || implied < kcal * 0.3)) return false
  return true
}

function makeRow({ id, name, brand, kind, portions, v }) {
  if (!name || name.length < 2) return null
  if (!plausible(v)) return null
  return {
    c: String(id),
    n: name,
    b: brand ? titleCase(brand).slice(0, 40) : '',
    k: kind, // 0 = generic, 1 = branded — search ranks generics first
    p: portions.length ? portions : [['100 g', 100]],
    v,
  }
}

/** Only ever matches `.json` — the download directory usually still holds the
 *  original `.zip` beside it, and those match the same name patterns. */
async function findFile(dir, patterns) {
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'))
  for (const p of patterns) {
    const hit = files.find((f) => p.test(f))
    if (hit) return join(dir, hit)
  }
  return null
}

async function loadJson(path) {
  const raw = await readFile(path, 'utf8')
  const json = JSON.parse(raw)
  const key = Object.keys(json).find((k) => Array.isArray(json[k]))
  return key ? json[key] : json
}

/**
 * Streams one food record at a time out of a bulk export.
 *
 * The branded export is 3.3 GB — well past the maximum length of a single JS
 * string, so `JSON.parse` on the whole file throws before it starts. FDC
 * fortunately writes exactly one record per line inside the wrapping array, so
 * the file can be read as if it were JSON Lines: skip the `{"BrandedFoods": [`
 * opener, strip the trailing comma (or the closing `]}` on the final record),
 * and parse each line on its own.
 */
async function* streamFoods(path) {
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  for await (const raw of rl) {
    let line = raw.trim()
    if (!line || line === ']}' || line === ']') continue
    // First line is the object opener plus the array bracket.
    if (line.endsWith('[')) continue
    if (line.endsWith(']}')) line = line.slice(0, -2)
    else if (line.endsWith(',')) line = line.slice(0, -1)
    if (!line.startsWith('{')) continue

    try {
      yield JSON.parse(line)
    } catch {
      // A record split across lines is not worth recovering from; there are
      // half a million more.
    }
  }
}

/* ------------------------------------------------------------------ main -- */

async function buildGenerics() {
  const rows = []
  const sources = [
    {
      label: 'Survey (FNDDS)',
      patterns: [/survey/i],
      stripTaxonomy: false,
    },
    {
      label: 'SR Legacy',
      patterns: [/sr_legacy/i],
      stripTaxonomy: true,
    },
    {
      label: 'Foundation',
      patterns: [/foundation/i],
      stripTaxonomy: true,
    },
  ]

  for (const src of sources) {
    const path = await findFile(SRC, src.patterns)
    if (!path) {
      console.warn(`  ! ${src.label}: no file matched in ${SRC} — skipping`)
      continue
    }
    const arr = await loadJson(path)
    let kept = 0
    for (const food of arr) {
      const row = makeRow({
        id: `usda${food.fdcId}`,
        name: cleanDescription(food.description ?? '', src),
        brand: '',
        kind: 0,
        portions: portionsOf(food),
        v: nutrientsPer100g(food),
      })
      if (row) {
        rows.push(row)
        kept++
      }
    }
    console.log(`  ${src.label.padEnd(15)} ${arr.length} rows → ${kept} kept`)
  }
  return rows
}

/**
 * Branded is 1.9M rows — far too many to ship, so it has to be ranked and cut.
 *
 * FDC has no popularity signal at all, which is the one thing that would make
 * this easy. What it does have is a category, a brand owner and a publication
 * date. Ranking on those gets the everyday shelf away from the long tail of
 * one-off regional SKUs: a recognisable brand beats an unknown one, a food
 * category beats an unclassified row, and a complete nutrient panel beats a
 * sparse one.
 */
const MAJOR_BRANDS =
  /\b(kraft|general mills|kellogg|post|quaker|nabisco|nestle|pepsi|coca.?cola|frito.?lay|conagra|campbell|hormel|tyson|perdue|smithfield|danone|dannon|chobani|yoplait|fairlife|starkist|bumble bee|chicken of the sea|unilever|mars|hershey|ferrero|mondelez|lindt|kind|clif|quest|premier protein|gatorade|monster|red bull|celsius|starbucks|dunkin|barilla|ronzoni|goya|la costena|old el paso|amy|annie|newman|stonyfield|horizon|organic valley|land o.?lakes|sargento|tillamook|philadelphia|oscar mayer|jimmy dean|johnsonville|applegate|boar.?s head|sara lee|pepperidge|entenmann|little debbie|hostess|thomas|arnold|nature.?s own|dave.?s killer|king.?s hawaiian|mission|tostitos|doritos|cheetos|lay.?s|pringles|ruffles|sun chips|triscuit|wheat thins|ritz|oreo|chips ahoy|goldfish|planters|blue diamond|wonderful|emerald|jif|skippy|peter pan|justin|smucker|welch|ocean spray|tropicana|minute maid|simply|naked juice|bolthouse|silk|oatly|almond breeze|califia|so delicious|ben.?s original|uncle ben|minute rice|near east|rice a roni|betty crocker|pillsbury|duncan hines|bisquick|krusteaz|kodiak|eggo|birds eye|green giant|del monte|libby|bush.?s|van camp|progresso|swanson|college inn|knorr|lipton|celestial|bigelow|twinings|folgers|maxwell house|peet|caribou|keurig|international delight|coffee.?mate|reddi.?wip|cool whip|breyers|haagen|talenti|halo top|blue bunny|dreyer|edy|magnum|klondike|drumstick)\b/i

const STORE_BRANDS =
  /\b(great value|kirkland|trader joe|whole foods|365|market pantry|good & gather|simple truth|signature select|o organics|private selection|kroger|safeway|publix|wegmans|h.?e.?b|meijer|giant eagle|food lion|hy.?vee|albertsons|vons|ralphs|stop & shop|shoprite|winco|sprouts|aldi|lidl|target|walmart|sam.?s club|costco|bj.?s|wawa|sheetz|7.?eleven)\b/i

function brandedScore(food, v, portions) {
  let s = 0
  const owner = `${food.brandOwner ?? ''} ${food.brandName ?? ''}`

  if (MAJOR_BRANDS.test(owner)) s += 100
  if (STORE_BRANDS.test(owner)) s += 90

  // A branded category means the row was curated rather than dumped.
  if (food.brandedFoodCategory) s += 25

  // Rows with a real household serving are far more useful to log.
  if (portions.length && !/^\d+(\.\d+)?\s*(g|ml)$/i.test(portions[0][0])) s += 35

  // Completeness of the panel, as a proxy for record quality.
  const filled = v.filter((x) => x > 0).length
  s += Math.min(30, filled * 2)

  // Recency: FDC keeps discontinued products forever.
  const year = Number(String(food.modifiedDate ?? food.availableDate ?? '').slice(-4))
  if (year >= 2019) s += 20
  else if (year && year < 2015) s -= 15

  // Very long names are usually variant spam ("... 12 PACK 16.9 FL OZ BOTTLES").
  if ((food.description ?? '').length > 70) s -= 20

  return s
}

async function buildBranded() {
  // Generic foods build in seconds; branded takes minutes. Being able to skip
  // it makes iterating on the generic side bearable.
  if (args.includes('--generics-only')) {
    console.log('  (skipped: --generics-only)')
    return []
  }
  const path = await findFile(SRC, [/branded/i])
  if (!path) {
    console.warn(`  ! Branded: no file matched in ${SRC} — skipping`)
    return []
  }

  console.log('  streaming branded export (a few GB — this takes a minute)…')

  const scored = []
  const seen = new Set()
  let read = 0

  for await (const food of streamFoods(path)) {
    if (++read % 100_000 === 0) {
      console.log(`    read ${read.toLocaleString()} — kept ${scored.length.toLocaleString()}`)
    }
    const v = nutrientsPer100g(food)
    if (!plausible(v)) continue

    const portions = brandedPortions(food)
    const brand = food.brandName || food.brandOwner || ''
    let name = cleanDescription(food.description ?? '', { stripTaxonomy: false })
    if (!name) continue

    /* Branded descriptions usually lead with the brand — "STARKIST, CHUNK
       LIGHT TUNA IN WATER" — and the row already carries the brand in its own
       field, which the UI shows on the second line. Repeating it costs width
       in the results list and pushes the part that distinguishes one product
       from another off the end. */
    if (brand) {
      const stripped = name.replace(
        new RegExp(`^${escapeRe(String(brand))}\\s*[,:-]\\s*`, 'i'),
        ''
      )
      if (stripped.length > 2) name = stripped
    }
    name = dropRedundantSuffix(collapseRepeats(name))

    // One row per name+brand; FDC carries many near-identical package sizes.
    const key = `${name.toLowerCase()}|${String(brand).toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    const row = makeRow({
      id: food.gtinUpc ? String(food.gtinUpc).replace(/\D/g, '') : `usda${food.fdcId}`,
      name: titleCase(name),
      brand,
      kind: 1,
      portions,
      v,
    })
    if (!row) continue

    scored.push({ row, s: brandedScore(food, v, portions) })
  }

  scored.sort((a, b) => b.s - a.s)
  console.log(`  branded read ${read.toLocaleString()} → usable ${scored.length.toLocaleString()}`)
  return scored.map((x) => x.row)
}

function packFile(rows) {
  return JSON.stringify({ version: 2, count: rows.length, foods: rows })
}

async function main() {
  console.log(`Reading USDA exports from ${SRC}\n`)

  console.log('Generic foods:')
  const generics = await buildGenerics()
  console.log(`  → ${generics.length} generic foods\n`)

  console.log('Branded foods:')
  const branded = await buildBranded()
  console.log('')

  /* Two files, because one big one is the wrong trade either way. The core
     holds every generic food plus the highest-ranked branded rows and is
     fetched on the first search; the extension holds the long tail and is
     fetched in the background afterwards. A user searching "shrimp" gets an
     answer immediately instead of waiting on a 20 MB download, and still ends
     up with the full database a few seconds later. */
  const core = [...generics, ...branded.slice(0, CORE_BRANDED)].sort((a, b) =>
    a.n.localeCompare(b.n)
  )
  const ext = branded
    .slice(CORE_BRANDED, CORE_BRANDED + EXT_BRANDED)
    .sort((a, b) => a.n.localeCompare(b.n))

  await mkdir(OUT_DIR, { recursive: true })
  const corePath = join(OUT_DIR, 'food-db.json')
  const extPath = join(OUT_DIR, 'food-db-ext.json')
  const coreJson = packFile(core)
  const extJson = packFile(ext)
  await writeFile(corePath, coreJson)
  await writeFile(extPath, extJson)

  const mb = (s) => (s.length / 1e6).toFixed(1)
  console.log(`Wrote ${corePath}  ${core.length} foods  ${mb(coreJson)} MB`)
  console.log(`Wrote ${extPath}  ${ext.length} foods  ${mb(extJson)} MB`)
  console.log(`Total: ${core.length + ext.length} foods`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
