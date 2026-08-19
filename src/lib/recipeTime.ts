import type { Recipe } from '../types'

/**
 * Time a recipe needs *before* you can start it — dough rising, meat
 * marinating, a mousse setting, anything frozen overnight.
 *
 * It is not in the data. USDA publishes prep and cook minutes and nothing
 * else, so a pizza whose dough proves for four hours reports "42 minutes" and
 * reads like a weeknight dinner. That figure is not wrong — it is the time
 * you spend working — but on its own it misleads, which is why this is shown
 * beside it rather than added to it.
 *
 * Derived from the method text, because the alternative is hand-annotating
 * twelve hundred recipes and every one written afterwards.
 */

/** Waiting verbs. "Cook for 40 minutes" is work; "chill for 40" is not. */
const WAIT =
  '(?:chill|chilled|chilling|refrigerat\\w*|marinat\\w*|soak\\w*|rise|rising|prove|proof\\w*|ferment\\w*|freeze|frozen|freezing|rest|resting|stand|standing|sit|sitting|leave|leaving|brine|brining|thaw\\w*|set|setting|cool|cooling|steep\\w*)'

const UNIT_MIN: Record<string, number> = {
  minute: 1, minutes: 1, min: 1, mins: 1,
  hour: 60, hours: 60, hr: 60, hrs: 60,
  day: 1440, days: 1440,
  week: 10080, weeks: 10080,
}

/**
 * Under half an hour is not something you plan around.
 *
 * It also keeps the meat off: "rest the chops 3 minutes" and "leave it two
 * minutes before eating" are steps in the cooking, not a wait before it, and
 * both match the same words as an overnight marinade.
 */
const FLOOR = 30

/** An unqualified "overnight" is treated as eight hours. */
const OVERNIGHT = 8 * 60

function amountsIn(text: string): number[] {
  const out: number[] = []
  const lower = text.toLowerCase()

  /* The verb has to come first and stay close: "simmer 2 hours, then chill"
     should read the chill, not the simmer. Fifty characters is about one
     clause, which is as far as the two can sit apart and still be one
     instruction. */
  const re = new RegExp(
    `${WAIT}\\b[^.]{0,50}?(\\d+(?:\\.\\d+)?)\\s*(${Object.keys(UNIT_MIN).join('|')})\\b`,
    'g',
  )
  for (const m of lower.matchAll(re)) {
    out.push(parseFloat(m[1]) * UNIT_MIN[m[2]])
  }

  /* "Chill overnight", "leave it overnight in the fridge" — no number at all,
     and the most common way a recipe asks for the longest wait it has. */
  const nightly = new RegExp(`${WAIT}\\b[^.]{0,50}?overnight|overnight[^.]{0,30}?${WAIT}\\b`, 'g')
  for (const _ of lower.matchAll(nightly)) out.push(OVERNIGHT)

  return out
}

/**
 * The longest single wait, in minutes, or null when there is none worth
 * planning around.
 *
 * The longest rather than the sum: waits usually nest — a dough that proves
 * for four hours and then rests twenty minutes is a four-hour job, not a
 * four-hour-twenty one — and overcounting here would push recipes out of
 * "under 30 minutes" for no reason.
 */
export function restMinutes(recipe: Recipe): number | null {
  const text = [...(recipe.steps ?? []), ...(recipe.ingredients ?? [])]
  let longest = 0
  for (const line of text) {
    for (const mins of amountsIn(line)) {
      if (mins >= FLOOR && mins > longest) longest = mins
    }
  }
  return longest || null
}

/** "4h", "overnight", "1h 30m" — how the wait is written on the card. */
export function formatRest(mins: number): string {
  if (mins >= 20 * 60) return `${Math.round(mins / 1440)}d`
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m ? `${h}h ${m}m` : `${h}h`
  }
  return `${mins}m`
}

/* ------------------------------------------------------- working time ------ */

/**
 * How long a recipe takes, when it does not say.
 *
 * Every one of the 1,054 USDA recipes ships without prep or cook minutes —
 * MyPlate publishes the method and nothing else — so the whole catalogue showed
 * a dash where the time goes, and every cook-time filter dropped all of it.
 * The method does contain the numbers, just in prose: "Bake until tender (about
 * 45 minutes)".
 *
 * Deliberately an estimate and labelled as one on screen. It is better than a
 * dash and it is not the author's own figure.
 */

const COOK_UNIT: Record<string, number> = {
  minute: 1, minutes: 1, min: 1, mins: 1,
  hour: 60, hours: 60, hr: 60, hrs: 60,
  second: 0, seconds: 0,
}

/** Work that happens while something else cooks, and should not be added on. */
const PER_STEP = 3

/** Anything longer is a wait, not work — `restMinutes` reports it separately. */
const LONG = 120

/* Read off the method text on every call otherwise, and lists ask for it once
   per recipe per render. Keyed by identity, so an edited recipe is a new key. */
const ESTIMATES = new WeakMap<Recipe, number | null>()

export function estimateMinutes(recipe: Recipe): number | null {
  const cached = ESTIMATES.get(recipe)
  if (cached !== undefined) return cached
  const value = computeEstimate(recipe)
  ESTIMATES.set(recipe, value)
  return value
}

function computeEstimate(recipe: Recipe): number | null {
  const steps = recipe.steps ?? []
  if (!steps.length) return null

  let total = 0
  for (const step of steps) {
    const lower = step.toLowerCase()
    let stepMax = 0

    /* One figure per step, the largest: "cook 4 minutes a side, 8 minutes in
       total" is eight minutes of cooking, not twelve. */
    const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${Object.keys(COOK_UNIT).join('|')})\\b`, 'g')
    for (const m of lower.matchAll(re)) {
      const mins = parseFloat(m[1]) * COOK_UNIT[m[2]]
      // A wait belongs to restMinutes; counting it here would say a marinade
      // is four hours of cooking.
      if (mins > LONG) continue
      if (mins > stepMax) stepMax = mins
    }

    total += stepMax || PER_STEP
  }

  return Math.max(PER_STEP, Math.round(total))
}

/**
 * The working time to show: the author's own figure where there is one, and an
 * estimate read off the method where there is not.
 */
export function workingMinutes(recipe: Recipe): { mins: number; estimated: boolean } | null {
  const stated = (recipe.prepMin ?? 0) + (recipe.cookMin ?? 0)
  if (stated > 0) return { mins: stated, estimated: false }
  const guess = estimateMinutes(recipe)
  return guess == null ? null : { mins: guess, estimated: true }
}
