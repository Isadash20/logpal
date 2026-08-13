import type { Food, MealItem, Nutrients, Serving } from '../types'
import { emptyNutrients, scaleNutrients } from './nutrition'

/**
 * Turning a written ingredient line into something with calories on it.
 *
 * This is the piece the whole meal planner stands on. A recipe is a list of
 * sentences written for a person — "1 ¼ cups all-purpose flour", "1 red bell
 * pepper, sliced", "Cooking spray" — and a planner has to answer "how many
 * calories is that" for every one of them. Everything else in the feature is
 * presentation over this file's output.
 *
 * Three steps, kept separate because they fail differently:
 *
 *   parseIngredient   text        -> { qty, unit, name, note }   (never fails)
 *   matchIngredient   name        -> a Food from the database    (can miss)
 *   resolveIngredient the two     -> a MealItem with nutrients   (can be partial)
 *
 * A miss is normal and must stay visible rather than being quietly counted as
 * zero: a recipe that silently under-reports its calories is worse than one
 * that admits it could not price an ingredient.
 */

/* ------------------------------------------------------------ quantities -- */

/** Unicode fractions, which recipe sites use constantly. */
const VULGAR: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

const VULGAR_RE = new RegExp(`[${Object.keys(VULGAR).join('')}]`)

/**
 * Reads the amount off the front of a line.
 *
 * Handles `2`, `2.5`, `1/2`, `1 1/2`, `½`, `1 ½`, and ranges like `1-2` or
 * `1 to 2`. A range takes its lower bound: over-reporting an ingredient someone
 * may not have used is the worse direction for a calorie tracker to err in.
 *
 * Returns null when the line does not start with a number at all, which is a
 * real and common case — "Cooking spray", "Salt and pepper to taste".
 */
function readQuantity(s: string): { qty: number; rest: string } | null {
  const text = s.trim()

  /* Mixed number first, then bare fraction, then a plain number. The order is
     load-bearing: reading the number first turns "1/4 cup" into a quantity of
     one followed by a stray "/4", which is how a quarter cup of teriyaki sauce
     becomes a whole one. */
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/)
  if (mixed) {
    const qty = parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])
    return { qty, rest: dropRange(text.slice(mixed[0].length).trim()) }
  }

  const frac = text.match(/^(\d+)\s*\/\s*(\d+)/)
  if (frac) {
    return {
      qty: parseInt(frac[1]) / parseInt(frac[2]),
      rest: dropRange(text.slice(frac[0].length).trim()),
    }
  }

  const num = text.match(/^(\d+(?:\.\d+)?)/)
  if (num) {
    let qty = parseFloat(num[1])
    let rest = dropRange(text.slice(num[0].length).trim())
    // A whole number followed by a unicode fraction — "1 ½ cups".
    if (VULGAR_RE.test(rest[0] ?? '')) {
      qty += VULGAR[rest[0]]
      rest = rest.slice(1).trim()
    }
    return { qty, rest }
  }

  if (VULGAR_RE.test(text[0] ?? '')) {
    return { qty: VULGAR[text[0]], rest: text.slice(1).trim() }
  }

  return null
}

/** Drops the upper half of "1-2" / "2 to 3"; the low end already stands. */
function dropRange(s: string): string {
  const range = s.match(/^(?:-|–|—|to)\s*\d+(?:\s*\/\s*\d+)?(?:\.\d+)?/)
  return range ? s.slice(range[0].length).trim() : s
}

/* ----------------------------------------------------------------- units -- */

export type UnitKind = 'volume' | 'weight' | 'count'

interface UnitDef {
  /** Canonical name, and what gets shown. */
  key: string
  kind: UnitKind
  /** Millilitres for volume, grams for weight. Absent for counts. */
  base?: number
  /** Everything that should resolve to this unit, lowercased, no trailing s. */
  aliases: string[]
}

/**
 * The units recipes actually use.
 *
 * US volume measures, because the food database is USDA and its household
 * portions are written the same way — that alignment is the whole reason a
 * "1 cup" ingredient can be priced without converting to grams first.
 */
const UNITS: UnitDef[] = [
  { key: 'tsp', kind: 'volume', base: 4.92892, aliases: ['tsp', 't', 'teaspoon'] },
  { key: 'tbsp', kind: 'volume', base: 14.7868, aliases: ['tbsp', 'tbs', 'tb', 'T', 'tablespoon'] },
  {
    key: 'fl oz',
    kind: 'volume',
    base: 29.5735,
    /* "us fluid ounce" is how USDA writes it, and missing it is not a rounding
       error: the unit stays unparsed, the words fall into the food name, and
       "16 us fluid ounces orange juice" went looking for a food called that and
       came back with a Snickers bar priced sixteen times over. */
    aliases: ['fl oz', 'floz', 'fluid ounce', 'us fluid ounce', 'fl. oz'],
  },
  { key: 'cup', kind: 'volume', base: 236.588, aliases: ['cup', 'c'] },
  { key: 'pint', kind: 'volume', base: 473.176, aliases: ['pint', 'pt'] },
  { key: 'quart', kind: 'volume', base: 946.353, aliases: ['quart', 'qt'] },
  { key: 'gallon', kind: 'volume', base: 3785.41, aliases: ['gallon', 'gal'] },
  { key: 'ml', kind: 'volume', base: 1, aliases: ['ml', 'millilitre', 'milliliter', 'cc'] },
  { key: 'l', kind: 'volume', base: 1000, aliases: ['l', 'litre', 'liter'] },

  { key: 'g', kind: 'weight', base: 1, aliases: ['g', 'gram', 'gr'] },
  { key: 'kg', kind: 'weight', base: 1000, aliases: ['kg', 'kilo', 'kilogram'] },
  { key: 'oz', kind: 'weight', base: 28.3495, aliases: ['oz', 'ounce'] },
  { key: 'lb', kind: 'weight', base: 453.592, aliases: ['lb', 'lbs', 'pound'] },

  /* Counted things. No base amount — how much a "clove" weighs depends
     entirely on what it is a clove of, so these resolve through the matched
     food's own serving list instead. */
  { key: 'clove', kind: 'count', aliases: ['clove'] },
  { key: 'slice', kind: 'count', aliases: ['slice'] },
  { key: 'piece', kind: 'count', aliases: ['piece'] },
  { key: 'can', kind: 'count', aliases: ['can'] },
  { key: 'jar', kind: 'count', aliases: ['jar'] },
  { key: 'package', kind: 'count', aliases: ['package', 'pkg', 'packet'] },
  { key: 'container', kind: 'count', aliases: ['container', 'tub'] },
  { key: 'bunch', kind: 'count', aliases: ['bunch'] },
  { key: 'head', kind: 'count', aliases: ['head'] },
  { key: 'stalk', kind: 'count', aliases: ['stalk', 'rib'] },
  { key: 'sprig', kind: 'count', aliases: ['sprig'] },
  { key: 'scoop', kind: 'count', aliases: ['scoop'] },
  { key: 'fillet', kind: 'count', aliases: ['fillet', 'filet'] },
  { key: 'breast', kind: 'count', aliases: ['breast'] },
  { key: 'pinch', kind: 'count', aliases: ['pinch'] },
  { key: 'dash', kind: 'count', aliases: ['dash'] },
  { key: 'handful', kind: 'count', aliases: ['handful'] },
]

const UNIT_BY_ALIAS = new Map<string, UnitDef>()
for (const u of UNITS) {
  for (const a of u.aliases) UNIT_BY_ALIAS.set(a.toLowerCase(), u)
}

export const UNIT_BY_KEY = new Map(UNITS.map((u) => [u.key, u]))

/* Note what is deliberately absent from UNITS: `large`, `medium`, `small`,
   `jumbo`, `whole`. "1 large egg" has no unit — it is one egg, and `large`
   describes it. Listing them as units would leave the name as "egg" carrying a
   phantom measure, and would strip the word before the database, which does
   stock "Egg, Large" as its own entry, ever got to see it. */

/**
 * Looks a unit up, plural or not.
 *
 * Both singular forms are tried rather than picking one by rule. Dropping "es"
 * turns "boxes" into "box" correctly and "ounces" into "ounc", which is how
 * "8 ounces low-fat cheddar cheese" ended up with no unit at all and a food
 * named "ounces low-fat cheddar cheese" that nothing could match.
 */
function unitFor(word: string): UnitDef | null {
  const w = word.toLowerCase().replace(/\./g, '').trim()
  const forms = [w, w.replace(/s$/, ''), w.replace(/es$/, '')]
  for (const f of forms) {
    const def = UNIT_BY_ALIAS.get(f)
    if (def) return def
  }
  return null
}

/** Words between the amount and the food that carry no measurement. */
const FILLER = new Set(['of', 'a', 'an'])

/* ---------------------------------------------------------------- parsing -- */

export interface ParsedIngredient {
  /** Original line, kept verbatim so the recipe can always be shown as written. */
  raw: string
  /** Amount, or null when the line gives none ("Salt to taste"). */
  qty: number | null
  /** Canonical unit key, or null for a bare count ("2 eggs") or no amount. */
  unit: string | null
  /** The food itself, cleaned of amount, unit and preparation. */
  name: string
  /**
   * Preparation and qualifiers: "chopped", "or parsley, minced", "for serving".
   * Split off because it is written for the cook and only confuses a database
   * lookup — "1 red bell pepper, sliced" must search for a pepper, not a slice.
   */
  note: string | null
}

/**
 * Preparation words. When a line has no comma, a trailing one of these is still
 * preparation — "2 cups chicken breasts cooked" reads the same as
 * "2 cups chicken breasts, cooked" and has to lose the word just the same.
 */
const PREP_WORDS = [
  'chopped', 'minced', 'diced', 'sliced', 'grated', 'shredded', 'crushed',
  'cooked', 'uncooked', 'raw', 'peeled', 'seeded', 'drained', 'rinsed',
  'melted', 'softened', 'divided', 'packed', 'beaten', 'cubed', 'julienned',
  'halved', 'quartered', 'trimmed', 'thawed', 'frozen', 'fresh', 'optional',
  'to taste', 'for serving', 'for garnish', 'plus more', 'room temperature',
]

export function parseIngredient(line: string): ParsedIngredient {
  const raw = line.trim()
  let text = raw

  // Parenthesised asides are always notes: "1 can (14 oz) tomatoes".
  const parens: string[] = []
  text = text.replace(/\(([^)]*)\)/g, (_, inner) => {
    parens.push(String(inner).trim())
    return ' '
  })

  const q = readQuantity(text)
  const qty = q ? q.qty : null
  text = (q ? q.rest : text).trim()

  /* Unit, longest phrase first so "us fluid ounce" beats "us" and "fl oz"
     beats "fl". Plurals are singularised before lookup at each width. */
  let unit: string | null = null
  const multi = text.match(/^(\w+\.?\s+\w+\.?\s+\w+\.?)\b/)
  const two = text.match(/^(\w+\.?\s+\w+\.?)\b/)
  for (const m of [multi, two]) {
    if (!m) continue
    const def = unitFor(m[1])
    if (def) {
      unit = def.key
      text = text.slice(m[1].length).trim()
      break
    }
  }

  if (!unit) {
    const oneWord = text.match(/^([A-Za-z]+)\.?\b/)
    const def = oneWord ? unitFor(oneWord[1]) : null
    if (oneWord && def) {
      unit = def.key
      text = text.slice(oneWord[0].length).trim()
    }
  }

  // Drop connecting words the database has no use for.
  const lead = text.match(/^([A-Za-z]+)\b/)
  if (lead && FILLER.has(lead[1].toLowerCase())) text = text.slice(lead[0].length).trim()

  // Size words stay in the name — "large egg" is a real database entry — but a
  // leading one is recorded so it can be shown on its own line, as recipes do.
  const notes = [...parens]

  // Everything after the first comma is preparation.
  const comma = text.indexOf(',')
  if (comma >= 0) {
    const after = text.slice(comma + 1).trim()
    if (after) notes.push(after)
    text = text.slice(0, comma).trim()
  }

  // A trailing preparation word with no comma in front of it.
  for (const p of PREP_WORDS) {
    const re = new RegExp(`\\s+${p}$`, 'i')
    if (re.test(text)) {
      notes.unshift(p)
      text = text.replace(re, '').trim()
    }
  }

  return {
    raw,
    qty,
    unit,
    name: text.replace(/\s+/g, ' ').trim(),
    note: notes.length ? notes.join(', ') : null,
  }
}

/* --------------------------------------------------------------- matching -- */

/**
 * Things that are genuinely zero, resolved before any search runs.
 *
 * Water and ice carry no calories, and the database has no clean entry for
 * either — searching sent "cold water" to Cold Water Sardines and "1 cup ice"
 * to a 530-calorie cup of ice cream. Neither is a near miss to be tuned away;
 * they are the search doing its job on a query that has no right answer.
 */
const ZERO_CALORIE = /^(cold |warm |hot |boiling |cool |iced )?(water|ice|ice cubes?|crushed ice)$/i

const STOP = new Set([
  'and', 'or', 'the', 'with', 'into', 'for', 'plus', 'about', 'your', 'any',
  'fresh', 'frozen', 'dried', 'ground', 'chopped', 'sliced', 'raw', 'cooked',
  'low', 'free', 'reduced', 'nonfat', 'non', 'fat', 'lean', 'skinless',
  'boneless', 'unsalted', 'salted', 'sweetened', 'unsweetened', 'canned',
])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1)
}

/**
 * A word reduced to its stem for comparison.
 *
 * Recipes write plurals and the database writes singulars — "4 medium apples"
 * against "Apple", "acorn squashes" against "Squash, acorn", "broccoli florets"
 * against "Broccoli". Comparing the surface forms means none of those match,
 * which was the single largest source of "no match" in the catalogue.
 */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 4 && (w.endsWith('ses') || w.endsWith('xes') || w.endsWith('hes'))) {
    return w.slice(0, -2)
  }
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** Adjectives that describe a piece of food rather than name one. */
const SIZE_WORDS = new Set([
  'large', 'medium', 'small', 'extra', 'jumbo', 'whole', 'half', 'mini',
  'thick', 'thin', 'baby', 'hot', 'cold', 'warm',
])

/**
 * The word an ingredient is really about.
 *
 * English compounds are head-final — "orange juice" is a juice, "black pepper"
 * is a pepper, "fat-free dry milk" is a milk — so the last meaningful word is
 * the thing itself and the ones before it are modifiers. Requiring a candidate
 * to contain that word is what stops "cinnamon" landing on a cinnamon bun and
 * "salt" on a chocolate sea salt bar.
 */
function headNoun(name: string): string {
  const words = tokens(name).filter((w) => !STOP.has(w) && !SIZE_WORDS.has(w))
  const last = words.length ? words[words.length - 1] : tokens(name).pop()
  return last ? stem(last) : ''
}

/**
 * Picks the best food for an ingredient, or nothing.
 *
 * `searchLocal` is built for a person choosing from a list: it always returns
 * its best guess, however poor, because a human will simply not tap the wrong
 * one. Used automatically that becomes a liability — every bad guess silently
 * becomes calories. This narrows the result to candidates that plausibly *are*
 * the ingredient, and returns null rather than settling.
 *
 * Two rules, in order:
 *   1. The candidate must contain the ingredient's head noun.
 *   2. Among those, fewest extra words wins. "Spices, cinnamon, ground" carries
 *      two words the query did not ask for; "Cinnamon buns, frosted (includes
 *      honey buns)" carries five. The first is the spice, the second is cake.
 */
export function matchIngredient(name: string, search: (q: string) => Food[]): Food | null {
  const head = headNoun(name)
  if (!head) return null

  /* A ladder of progressively plainer queries.
   *
   * "1 medium celery stalk (chopped)" is a celery stalk to a cook and a
   * three-word phrase nothing is filed under to a database. Rather than trying
   * to guess which words matter, ask for the whole thing, then the same thing
   * without size adjectives, then the bare noun — and stop at the first rung
   * that answers. The full phrase still gets first refusal, so "brown rice"
   * never degrades to "rice" while a brown rice entry exists. */
  const words = tokens(name)
  const withoutSize = words.filter((w) => !SIZE_WORDS.has(w))
  const attempts = [
    name,
    withoutSize.join(' '),
    withoutSize.filter((w) => !STOP.has(w)).join(' '),
    head,
  ]

  const asked = new Set(words.map(stem))
  const seen = new Set<string>()

  for (const attempt of attempts) {
    const q = attempt.trim()
    if (!q || seen.has(q)) continue
    seen.add(q)

    let best: Food | null = null
    let bestExtra = Infinity

    for (const food of search(q)) {
      const foodWords = tokens(`${food.name} ${food.brand ?? ''}`).map(stem)
      if (!foodWords.includes(head)) continue

      let extra = 0
      for (const w of foodWords) if (!asked.has(w) && !STOP.has(w)) extra++
      /* Ties go to the earlier candidate, which is the one the ranked search
         already preferred — this reorders within the shortlist, it does not
         replace the ranking. */
      if (extra < bestExtra) {
        bestExtra = extra
        best = food
      }
    }

    if (best) return best
  }

  return null
}

/**
 * Picks the serving that best expresses the parsed amount.
 *
 * Preferring a serving whose label already uses the ingredient's own unit is
 * what makes USDA's household portions pay off: "1 cup" of rice is a portion
 * the database already knows the weight of, so no volume-to-weight guess is
 * needed. Only when there is no such serving does this fall back to grams,
 * and for a count unit like "clove" there is no sensible fallback at all.
 */
function servingFor(
  food: Food,
  parsed: ParsedIngredient,
): { serving: Serving; servings: number } | null {
  const servings = food.servings ?? []
  if (!servings.length) return null

  const qty = parsed.qty ?? 1
  const unitDef = parsed.unit ? UNIT_BY_KEY.get(parsed.unit) : null

  // A serving labelled in the same unit: "1 cup", "2 tbsp", "1 oz".
  if (parsed.unit) {
    for (const s of servings) {
      const label = s.label.toLowerCase()
      const alias = [...UNIT_BY_ALIAS.entries()]
        .filter(([, d]) => d.key === parsed.unit)
        .map(([a]) => a)
      // Match "1 cup" / "cup" / "cups", but not "cupcake".
      if (alias.some((a) => new RegExp(`(^|[\\d\\s])${a}s?\\b`).test(label))) {
        const per = readQuantity(s.label)?.qty ?? 1
        return { serving: s, servings: qty / per }
      }
    }
  }

  // Convertible to grams, and the food has a serving with a known weight.
  if (unitDef?.base && unitDef.kind === 'weight') {
    const grams = qty * unitDef.base
    const withGrams = servings.find((s) => s.grams && s.grams > 0)
    if (withGrams) return { serving: withGrams, servings: grams / withGrams.grams! }
  }

  /* Volume with no matching serving. Water's density is the only assumption
     available without a per-food figure, and it is wrong for oil and flour —
     so this is deliberately last, and callers surface it as approximate. */
  if (unitDef?.base && unitDef.kind === 'volume') {
    const withGrams = servings.find((s) => s.grams && s.grams > 0)
    if (withGrams) return { serving: withGrams, servings: (qty * unitDef.base) / withGrams.grams! }
  }

  /* Tins and packets are deliberately left unpriced.
   *
   * The size is often right there — "1 can pumpkin (15 ounce)" — and converting
   * it was tried. It made things worse, because a can multiplies whatever the
   * match happened to be: "pumpkin" resolves to Pumpkin Seeds in this database,
   * and fifteen ounces of those is 2,400 calories arriving silently. Leaving the
   * line uncounted understates the recipe, but it says so on screen, and an
   * undercount you can see beats an overcount you cannot. Worth revisiting once
   * ingredient matching can express confidence rather than just a best guess. */

  // No unit at all — "2 eggs", "1 avocado". The food's own first serving is
  // exactly the right notion of "one of them".
  if (!parsed.unit) return { serving: servings[0], servings: qty }

  return null
}

export interface ResolvedIngredient {
  parsed: ParsedIngredient
  /** The database food it matched, or null when nothing plausible was found. */
  food: Food | null
  /** Nutrition for the amount written, or null when it could not be priced. */
  nutrients: Nutrients | null
  /** Why there is no nutrition, when there isn't. */
  reason?: 'no-amount' | 'no-match' | 'no-serving'
  servingLabel: string
  servings: number
  /**
   * True when the amount was converted through a density assumption rather than
   * a portion the database actually lists. Shown to the user, because it is the
   * difference between "a cup of rice" and a guess.
   */
  approximate: boolean
}

/**
 * Prices one parsed line against the food database.
 *
 * `search` is injected rather than imported so this stays testable without
 * loading a 40 MB database, and so callers can narrow the pool.
 */
export function resolveIngredient(
  parsed: ParsedIngredient,
  search: (q: string) => Food[],
): ResolvedIngredient {
  const empty: ResolvedIngredient = {
    parsed,
    food: null,
    nutrients: null,
    servingLabel: parsed.raw,
    servings: 1,
    approximate: false,
  }
  if (!parsed.name) return { ...empty, reason: 'no-match' }

  /* Water and ice are zero, and are answered here rather than searched for. */
  if (ZERO_CALORIE.test(parsed.name.trim())) {
    return {
      ...empty,
      nutrients: emptyNutrients(),
      servingLabel: parsed.raw,
      servings: 1,
    }
  }

  /* A line with no amount is not priced, deliberately.
   *
   * "Salt and pepper, to taste", "Cooking spray", "Lettuce, as needed" name a
   * food without saying how much, so there is nothing to scale and any answer
   * would be invented. Charging them one whole database serving is how
   * "Salt and pepper" became a 210-calorie chocolate sea salt bar — a recipe
   * gaining a third of its calories from a seasoning nobody weighed.
   *
   * The match is still returned: the shopping list wants the name even though
   * the calorie count cannot have it. */
  if (parsed.qty == null) {
    return { ...empty, food: matchIngredient(parsed.name, search), reason: 'no-amount' }
  }

  const food = matchIngredient(parsed.name, search)
  if (!food) return { ...empty, reason: 'no-match' }

  const chosen = servingFor(food, parsed)
  if (!chosen) return { ...empty, food, reason: 'no-serving' }

  const unitDef = parsed.unit ? UNIT_BY_KEY.get(parsed.unit) : null
  const usedLabel = chosen.serving.label.toLowerCase()
  const labelMatchesUnit =
    !parsed.unit ||
    (!!parsed.unit && usedLabel.includes(parsed.unit.replace(/s$/, '')))

  return {
    parsed,
    food,
    nutrients: scaleNutrients(food.nutrients, chosen.servings * chosen.serving.multiplier),
    servingLabel: chosen.serving.label,
    servings: chosen.servings,
    approximate: unitDef?.kind === 'volume' && !labelMatchesUnit,
  }
}

/** A resolved line as the diary stores it, ready to log. */
export function toMealItem(r: ResolvedIngredient): MealItem | null {
  if (!r.food || !r.nutrients) return null
  return {
    foodId: r.food.id,
    name: r.food.name,
    brand: r.food.brand,
    servingLabel: r.servingLabel,
    servings: r.servings,
    nutrients: r.nutrients,
  }
}

/* -------------------------------------------------------------- display -- */

const FRACTIONS: [number, string][] = [
  [0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.375, '⅜'], [0.5, '½'],
  [0.625, '⅝'], [2 / 3, '⅔'], [0.75, '¾'], [0.875, '⅞'],
]

/**
 * An amount written the way a recipe writes it.
 *
 * Recipes say "1 ½ cups", never "1.5 cups", and scaling a recipe to three
 * servings is exactly when thirds appear — so decimals here would make the
 * common case look broken.
 */
export function formatQuantity(n: number): string {
  if (!isFinite(n) || n <= 0) return ''
  const whole = Math.floor(n + 1e-9)
  const frac = n - whole

  let best = ''
  let bestErr = 0.02 // tighter than an eighth, so odd amounts stay decimal
  for (const [value, glyph] of FRACTIONS) {
    const err = Math.abs(frac - value)
    if (err < bestErr) {
      bestErr = err
      best = glyph
    }
  }

  if (frac < 0.02) return String(whole)
  if (best) return whole ? `${whole} ${best}` : best
  return String(Math.round(n * 100) / 100)
}

/**
 * Units written short. Listed rather than inferred from length, because "cup"
 * and "tbsp" are both three or four characters and only one of them takes an s.
 */
const ABBREVIATIONS = new Set(['tsp', 'tbsp', 'fl oz', 'ml', 'l', 'g', 'kg', 'oz', 'lb'])

/** "1 ½ cups flour" from its parts, pluralising the unit when it needs it. */
export function formatAmount(qty: number | null, unit: string | null): string {
  if (qty == null) return ''
  const n = formatQuantity(qty)
  if (!unit) return n
  const plural = qty > 1 && !ABBREVIATIONS.has(unit) ? `${unit}s` : unit
  return `${n} ${plural}`
}
