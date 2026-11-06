import type { GoalKind, Nutrients, Recipe, Sex } from '../types'

/**
 * Which recipes to put in front of someone right now.
 *
 * Phillip's ask (2026-11-05): "based off of recently logged foods, gender,
 * age, recommend specific meal prep, tailored to their plan". So this is a
 * ranking, not a filter. Every candidate gets a score from a handful of
 * parts, each in words below, and the top few go on the rail. Nothing here
 * reads the clock or the store; the screen hands in a context and gets a
 * list back, which is what makes it testable.
 *
 * The parts, roughly in order of weight:
 *
 *  1. Room. A dish should fill a sensible share of what is left today, not
 *     a sliver and not all of it. Over what is left is out.
 *  2. Protein need. The further behind the protein target, the more a
 *     protein-dense dish is worth. Gaining muscle, recomposition and age
 *     past fifty all raise that weight (older adults need more protein per
 *     kilo to hold on to muscle).
 *  3. The plan. Losing weight favours dishes with fewer calories per bite
 *     and more fibre, and marks down sugar. Gaining favours dishes that
 *     actually use the room. Maintaining leans on the health score.
 *  4. Balance. Carbs or fat already over target make a carb- or fat-heavy
 *     dish worth less.
 *  5. Familiarity. A dish whose name or ingredients overlap what this
 *     person has been logging is one they are likelier to cook and eat.
 *  6. Variety. A dish that looks like something eaten today is marked
 *     down, and a small date-seeded jitter rotates near-ties so the rail
 *     is not the same six every evening.
 *  7. Time of day. Before eleven, breakfasts count; after, mains.
 */
export interface IdeaContext {
  caloriesLeft: number
  calorieGoal: number
  proteinLeft: number
  proteinTarget: number
  carbsLeft: number
  fatLeft: number
  goalKind: GoalKind
  sex: Sex
  age: number
  /** Body weight in lb. Heavier bodies get bigger plates and more protein. */
  weightLb: number
  /** Anything stable per person; two people with the same day see different near-ties. */
  userSeed: number
  /** Names of foods logged over the last couple of weeks, most recent first. */
  recentNames: string[]
  /** Names of foods logged today. */
  todayNames: string[]
  hour: number
  /** Anything that changes once a day; the date as a number does. */
  seed: number
}

export interface IdeaCandidate {
  recipe: Recipe
  n: Nutrients
  /** Health score 0–10. */
  health: number
}

export interface Idea {
  recipe: Recipe
  calories: number
  protein: number
  score: number
}

const STOP = new Set([
  'with', 'and', 'the', 'style', 'fresh', 'large', 'small', 'medium', 'cup', 'cups', 'tbsp', 'tsp',
  'ounce', 'ounces', 'pound', 'pounds', 'slice', 'slices', 'piece', 'pieces', 'chopped', 'diced',
  'minced', 'sliced', 'ground', 'whole', 'plain', 'raw', 'cooked', 'from', 'into', 'about', 'taste',
  'salt', 'pepper', 'water', 'oil', 'olive', 'sugar', 'butter', 'flour',
  /* Label words, not foods: "Greek nonfat yogurt" is yogurt. */
  'greek', 'nonfat', 'lowfat', 'light', 'lite', 'organic', 'original', 'natural', 'reduced', 'skim',
  'unsweetened', 'sweetened', 'boneless', 'skinless', 'frozen', 'canned', 'dried', 'grilled', 'roasted',
  'baked', 'fried', 'steamed', 'homemade', 'serving', 'gram', 'grams',
])

/** The words that carry a food's identity: four letters or more, not a measure. */
export function foodTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .map((w) => (w.endsWith('es') && w.length > 5 ? w.slice(0, -2) : w.endsWith('s') && w.length > 4 ? w.slice(0, -1) : w))
    .filter((w) => w.length >= 4 && !STOP.has(w))
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

/** How much of today's room one meal should take, by the time of day. */
export function mealShare(hour: number): number {
  return hour < 11 ? 0.35 : hour < 15 ? 0.42 : 0.6
}

/**
 * The words this person keeps logging, most frequent first: "chicken",
 * "rice", "eggs". Counted once per entry, so one long ingredient list does
 * not swamp a fortnight of breakfasts.
 */
export function typicalFoods(recentNames: string[], limit = 3): string[] {
  const count = new Map<string, number>()
  for (const name of recentNames.slice(0, 80)) {
    for (const tok of new Set(foodTokens(name))) count.set(tok, (count.get(tok) ?? 0) + 1)
  }
  return [...count.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t)
}

/** 0..1 jitter that differs per person and per day, so near-ties rotate. */
function jitter(ctx: IdeaContext, id: string): number {
  return (((ctx.seed * 9301 + ctx.userSeed * 7919 + hash(id) * 49297) >>> 0) % 233280) / 233280
}

export function rankIdeas(cands: IdeaCandidate[], ctx: IdeaContext, limit = 8): Idea[] {
  const room = Math.max(350, ctx.caloriesLeft)
  /* A 220 lb body eats a bigger plate than a 120 lb one at the same share of
     the day; the room already carries most of that, this nudges the rest. */
  const bodyScale = clamp(ctx.weightLb / 160, 0.85, 1.2)
  const target = clamp(room * mealShare(ctx.hour) * bodyScale, 300, 900)

  const proteinNeed = clamp(ctx.proteinLeft / Math.max(1, ctx.proteinTarget))
  /* Grams still owed per pound of body: past 0.4 g/lb the day is well behind. */
  const perLb = clamp(ctx.proteinLeft / Math.max(80, ctx.weightLb) / 0.4)
  let proteinWeight = 0.8 + proteinNeed * 0.8 + perLb * 0.6
  if (ctx.goalKind === 'gain-muscle' || ctx.goalKind === 'recomp') proteinWeight *= 1.3
  if (ctx.goalKind === 'lose-weight') proteinWeight *= 1.1
  if (ctx.age >= 50) proteinWeight *= 1.2
  /* Fibre matters more with age, and women are likelier to fall short of
     it; neither changes the dish much, both nudge. */
  const fiberWeight = 0.35 + (ctx.age >= 40 ? 0.15 : 0) + (ctx.sex === 'female' ? 0.1 : 0)
  /* Past fifty, salt starts to matter; before that it is noise. */
  const sodiumWeight = ctx.age >= 50 ? 0.35 : ctx.age >= 40 ? 0.15 : 0

  const recent = ctx.recentNames.slice(0, 60).map((s) => new Set(foodTokens(s)))
  const todayTok = new Set(ctx.todayNames.flatMap(foodTokens))
  const morning = ctx.hour < 11

  const scored: Idea[] = []
  for (const { recipe, n, health } of cands) {
    const kcal = n.calories
    if (kcal < 180 || kcal > room) continue
    const tags = recipe.tags ?? []
    const isBreakfast = tags.includes('Breakfast')
    const isMain = tags.includes('Main dish')
    if (!isMain && !(morning && isBreakfast)) continue

    let s = 0

    /* 1. Room: full marks at the target, falling off either side. */
    s += 1.6 * (1 - clamp(Math.abs(kcal - target) / target))

    /* 2. Protein: grams per 100 calories, 12 is about as dense as food gets. */
    const density = (n.protein / Math.max(1, kcal)) * 100
    s += proteinWeight * clamp(density / 12)

    /* 3. The plan. */
    const fiberPer100 = (n.fiber / Math.max(1, kcal)) * 100
    s += fiberWeight * clamp(fiberPer100 / 3)
    if (ctx.goalKind === 'lose-weight') {
      s += 0.5 * (1 - clamp(kcal / Math.max(1, target))) // fewer calories for the same plate
      s -= 0.4 * clamp(n.sugar / 25)
    } else if (ctx.goalKind === 'gain-muscle') {
      s += 0.4 * clamp(kcal / Math.max(1, target))
    } else {
      s += 0.3 * clamp(health / 10)
    }
    s += 0.3 * clamp(health / 10)
    s -= sodiumWeight * clamp((n.sodium / Math.max(1, kcal)) * 100 / 250)

    /* 4. Balance: over on carbs or fat already, and a dish heavy in it costs. */
    const carbShare = (n.carbs * 4) / Math.max(1, kcal)
    const fatShare = (n.fat * 9) / Math.max(1, kcal)
    if (ctx.carbsLeft <= 0) s -= 0.5 * clamp((carbShare - 0.4) / 0.3)
    if (ctx.fatLeft <= 0) s -= 0.5 * clamp((fatShare - 0.35) / 0.3)

    /* 5. Familiarity: what they have been eating, by name and ingredient. */
    const dishTok = new Set([...foodTokens(recipe.name), ...(recipe.ingredients ?? []).flatMap(foodTokens)])
    let familiar = 0
    for (const r of recent) if (overlap(r, dishTok) > 0) familiar++
    s += 0.8 * clamp(familiar / 5)

    /* 6. Variety: not what they just ate; and a daily rotation of near-ties. */
    const nameTok = new Set(foodTokens(recipe.name))
    if (overlap(nameTok, todayTok) >= Math.max(1, Math.ceil(nameTok.size / 2))) s -= 0.8
    s += jitter(ctx, recipe.id) * 0.25

    /* 7. Time of day. */
    if (morning && isBreakfast) s += 0.4
    if (!morning && !isMain) s -= 0.3

    scored.push({ recipe, calories: kcal, protein: n.protein, score: s })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

/**
 * "Recipes you may like": taste over timing. Ranked by how much a dish
 * resembles what this person actually logs, then by fit for the plan and
 * body, with no calorie-room gate, because this rail is for later in the
 * week as much as tonight. Anything already on the ideas rail is left out.
 * With nothing logged yet it falls back to the plan and the body, and a
 * different jitter from the ideas rail so the two never look like one list.
 */
export function rankLikes(cands: IdeaCandidate[], ctx: IdeaContext, excludeIds: Set<string>, limit = 8): Idea[] {
  const recent = ctx.recentNames.slice(0, 80).map((s) => new Set(foodTokens(s)))
  const typical = new Set(typicalFoods(ctx.recentNames, 8))
  const perMeal = clamp(ctx.calorieGoal * 0.4 * clamp(ctx.weightLb / 160, 0.85, 1.2), 350, 950)
  const proteinWeight =
    (ctx.goalKind === 'gain-muscle' || ctx.goalKind === 'recomp' ? 1.3 : 1) * (ctx.age >= 50 ? 1.2 : 1)
  const fiberWeight = 0.3 + (ctx.age >= 40 ? 0.15 : 0) + (ctx.sex === 'female' ? 0.1 : 0)

  const scored: Idea[] = []
  for (const { recipe, n, health } of cands) {
    if (excludeIds.has(recipe.id)) continue
    const kcal = n.calories
    if (kcal < 180 || kcal > perMeal * 1.6) continue
    const tags = recipe.tags ?? []
    if (!tags.includes('Main dish') && !tags.includes('Breakfast')) continue

    const dishTok = new Set([...foodTokens(recipe.name), ...(recipe.ingredients ?? []).flatMap(foodTokens)])
    let familiar = 0
    for (const r of recent) if (overlap(r, dishTok) > 0) familiar++
    const core = overlap(typical, dishTok)

    let s = 0
    s += 1.4 * clamp(familiar / 6) + 0.6 * clamp(core / 2)
    s += 0.9 * (1 - clamp(Math.abs(kcal - perMeal) / perMeal))
    s += proteinWeight * 0.7 * clamp(((n.protein / Math.max(1, kcal)) * 100) / 12)
    s += fiberWeight * clamp(((n.fiber / Math.max(1, kcal)) * 100) / 3)
    s += 0.4 * clamp(health / 10)
    if (ctx.goalKind === 'lose-weight') s -= 0.4 * clamp(n.sugar / 25) + 0.3 * clamp(kcal / perMeal - 0.8)
    if (ctx.goalKind === 'gain-muscle') s += 0.3 * clamp(kcal / perMeal)
    if (ctx.age >= 50) s -= 0.3 * clamp(((n.sodium / Math.max(1, kcal)) * 100) / 250)
    s += jitter({ ...ctx, seed: ctx.seed + 17 }, recipe.id) * 0.3

    scored.push({ recipe, calories: kcal, protein: n.protein, score: s })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
