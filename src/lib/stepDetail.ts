import { parseIngredient, formatAmount } from './ingredients'

/**
 * What each step needs, worked out from the step's own words.
 *
 * The reference app puts a row of chips under every step: the ingredients that
 * step consumes, and the equipment it uses, with appliance settings spelled out
 * ("Oven, Heat, 400°F, 15min"). It is the single thing that makes a method
 * readable while cooking, because you can see what to reach for without
 * scrolling back to the ingredient list.
 *
 * Nothing here is authored per recipe. Ingredients are matched by name against
 * the recipe's own list, equipment by keyword, and appliance settings are read
 * out of the sentence, so it works across all 1200 recipes without anyone
 * writing chips by hand.
 */

export interface StepIngredient {
  name: string
  amount: string
}

export interface StepAppliance {
  /** "Oven", "Stovetop", "Microwave"… */
  name: string
  /** "Preheat, 400°F" / "Heat, 400°F, 15min", empty when nothing was stated. */
  setting: string
}

export interface StepDetail {
  ingredients: StepIngredient[]
  equipment: string[]
  appliances: StepAppliance[]
}

/** Plain tools. Matched on the step text, longest phrase first. */
const EQUIPMENT: [string, RegExp][] = [
  ['Baking sheet', /\b(baking sheet|sheet pan|cookie sheet)\b/i],
  ['Baking dish', /\b(baking dish|casserole dish|9x13|ovenproof dish)\b/i],
  ['Parchment paper', /\b(parchment|baking paper)\b/i],
  ['Skillet', /\b(skillet|frying pan|frypan)\b/i],
  ['Saucepan', /\b(saucepan|sauce pan)\b/i],
  ['Large pot', /\b(large pot|stock ?pot|dutch oven)\b/i],
  ['Blender', /\b(blender)\b/i],
  ['Food processor', /\b(food processor)\b/i],
  ['Mixing bowl', /\b(mixing bowl|large bowl|medium bowl|small bowl)\b/i],
  ['Colander', /\b(colander|strainer|sieve)\b/i],
  ['Whisk', /\b(whisk)\b/i],
  ['Thermometer', /\b(thermometer|internal temperature)\b/i],
  ['Grater', /\b(grater|grate)\b/i],
  ['Knife', /\b(sharp knife|chef'?s knife)\b/i],
  ['Skewers', /\b(skewers?)\b/i],
  ['Tin', /\b(loaf tin|cake tin|muffin tin|springform)\b/i],
  ['Slow cooker', /\b(slow cooker|crock ?pot)\b/i],
  ['Air fryer', /\b(air fry)/i],
  ['Grill', /\b(grill|barbecue|bbq)\b/i],
]

const F_DEGREES = /(\d{3})\s*[°º]?\s*F\b/i
const MINUTES = /(\d+)(?:\s*(?:to|, |-)\s*(\d+))?\s*(?:minutes?|mins?)\b/i
const HOURS = /(\d+)(?:\s*(?:to|, |-)\s*(\d+))?\s*(?:hours?|hrs?)\b/i

/** "Preheat, 400°F" or "Heat, 400°F, 15min", only what the step actually says. */
function applianceFor(step: string): StepAppliance[] {
  const out: StepAppliance[] = []
  const deg = step.match(F_DEGREES)
  const mins = step.match(MINUTES)
  const hrs = step.match(HOURS)

  const time = hrs
    ? `${hrs[1]}${hrs[2] ? `, ${hrs[2]}` : ''}h`
    : mins
      ? `${mins[1]}${mins[2] ? `, ${mins[2]}` : ''}min`
      : ''

  if (/\b(preheat|oven|bake|roast|broil)\b/i.test(step)) {
    const verb = /\bpreheat\b/i.test(step) ? 'Preheat' : 'Heat'
    const parts = [verb, deg ? `${deg[1]}°F` : '', /\bpreheat\b/i.test(step) ? '' : time]
    out.push({ name: 'Oven', setting: parts.filter(Boolean).join(', ') })
  }
  if (/\b(microwave)\b/i.test(step)) {
    out.push({ name: 'Microwave', setting: time })
  }
  if (
    !out.length &&
    /\b(simmer|boil|saut|fry|sear|stir-fry|medium heat|medium-high|low heat|high heat)\b/i.test(step)
  ) {
    const level =
      /\bmedium-high\b/i.test(step) ? 'Medium-high'
      : /\bmedium\b/i.test(step) ? 'Medium'
      : /\bhigh heat\b/i.test(step) ? 'High'
      : /\blow heat\b/i.test(step) ? 'Low'
      : ''
    out.push({ name: 'Stovetop', setting: [level, time].filter(Boolean).join(', ') })
  }
  return out
}

/**
 * Words too generic to match on. "Water" appears in half of all steps and
 * "salt" in most, and a chip row that repeats them on every step is noise
 * rather than help.
 */
const TOO_COMMON = /^(water|salt|pepper|black pepper|ice|cooking spray|nonstick cooking spray)$/i

/**
 * Words that name a category rather than a food.
 *
 * Matching on the last word alone made "soy sauce" claim any step that says
 * "the sauce", and there is almost always a sauce. Where an ingredient's only
 * distinctive word is one of these, the whole phrase has to appear instead.
 */
const GENERIC = new Set([
  'sauce', 'oil', 'powder', 'water', 'stock', 'broth', 'juice', 'paste',
  'mix', 'leaves', 'seeds', 'pieces', 'slices', 'wedges', 'strips', 'cheese',
])

/** Which of an ingredient's distinctive words appear in the step. Empty = no match. */
function matchedWords(name: string, step: string): string[] {
  const n = name.toLowerCase().trim()
  if (!n || n.length < 3) return []
  const head = n.split(/,| or /)[0].trim()
  const has = (w: string) =>
    new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(e?s)?\\b`, 'i').test(step)

  /* Any distinctive word will do, not only the last one: "panko breadcrumbs"
     must match a step that says only "panko". */
  const words = head
    .split(/\s+/)
    .map((w) => w.replace(/e?s$/, ''))
    .filter((w) => w.length >= 4 && !GENERIC.has(w) && !GENERIC.has(`${w}s`))
  if (words.length) return words.filter(has)

  return has(head) ? [head] : []
}

export function stepDetail(
  step: string,
  ingredientLines: string[],
  fmt: (qty: number | null, unit: string | null) => string = formatAmount,
): StepDetail {
  const hits: { name: string; amount: string; words: string[] }[] = []
  for (const line of ingredientLines) {
    const p = parseIngredient(line)
    if (!p.name || TOO_COMMON.test(p.name)) continue
    const words = matchedWords(p.name, step)
    if (!words.length) continue
    hits.push({
      name: p.name.replace(/^\w/, (c) => c.toUpperCase()),
      amount: fmt(p.qty, p.unit),
      words,
    })
  }

  /* "Chicken breasts" and "chicken stock" both answer to a step saying
     "chicken". Keep the one the step actually pinned down: an ingredient whose
     matched words are a subset of another's is the vaguer claim and goes, and
     where two tie exactly the earlier ingredient wins, the recipe's own list
     being ordered by importance. */
  const ingredients: StepIngredient[] = hits
    .filter((h, i) =>
      !hits.some((o, j) => {
        if (i === j) return false
        const subset = h.words.every((w) => o.words.includes(w))
        if (!subset) return false
        return o.words.length > h.words.length || j < i
      }),
    )
    .map(({ name, amount }) => ({ name, amount }))

  const appliances = applianceFor(step)
  const equipment: string[] = []
  for (const [label, re] of EQUIPMENT) {
    if (re.test(step) && !appliances.some((a) => a.name === label)) equipment.push(label)
  }

  return { ingredients, equipment, appliances }
}
