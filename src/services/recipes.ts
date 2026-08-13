import type { Food, MealItem, Nutrients, Recipe } from '../types'
import { emptyNutrients, scaleNutrients, sumNutrients } from '../lib/nutrition'
import {
  parseIngredient,
  resolveIngredient,
  toMealItem,
  type ResolvedIngredient,
} from '../lib/ingredients'
import { searchLocal } from './foodSearch'
import { SEED_RECIPES } from '../data/seedRecipes'
import { CATALOG_RECIPES } from '../data/catalogRecipes'
import { healthScore, type HealthScore } from '../lib/healthScore'

/**
 * Recipes, priced.
 *
 * A recipe arrives as sentences and has to leave as calories. That work happens
 * here, once per recipe, and is cached — resolving a ten-ingredient recipe means
 * ten searches across a couple of hundred thousand foods, which is fine once and
 * far too slow on every render of a planner showing twenty-one meals.
 *
 * The cache is keyed on the recipe *and* on how much of the food database has
 * loaded. The bulk database arrives a moment after the app does, so a recipe
 * resolved during that gap would otherwise be stuck with whatever the seed list
 * could match and never improve.
 */

export interface ResolvedRecipe {
  recipe: Recipe
  /** One entry per written line, matched or not. */
  lines: ResolvedIngredient[]
  /** Everything that could be priced, ready for the diary. */
  items: MealItem[]
  /** Nutrition for one serving as the recipe makes it. */
  perServing: Nutrients
  /** Nutrition for the whole recipe. */
  total: Nutrients
  health: HealthScore
  /**
   * Lines that found no food. Surfaced rather than swallowed: a recipe quietly
   * reporting 300 calories because it failed to price the chicken is the exact
   * failure a calorie tracker cannot afford.
   */
  unmatched: string[]
  /** Lines priced through a volume-to-weight assumption. */
  approximate: number
}

const CACHE = new Map<string, ResolvedRecipe>()

/**
 * Rough measure of how much of the food database is in memory. Used only as a
 * cache key — an exact count would be no more useful and costs a full scan.
 */
function dbGeneration(): number {
  try {
    // searchLocal against a common word returns more as the database grows.
    return searchLocal('chicken', [], 200).length
  } catch {
    return 0
  }
}

function fingerprint(recipe: Recipe): string {
  return [
    recipe.id,
    recipe.servingsMade,
    (recipe.ingredients ?? []).join('|'),
    recipe.items.length,
  ].join('~')
}

/**
 * Prices a recipe.
 *
 * Recipes written in the app's own editor already carry `items` — the editor
 * builds them by picking foods directly, so there is nothing to parse and
 * nothing to guess. Only recipes that came in as text need the parser.
 */
export function resolveRecipe(recipe: Recipe, extraFoods: Food[] = []): ResolvedRecipe {
  const key = `${fingerprint(recipe)}@${dbGeneration()}`
  const hit = CACHE.get(key)
  if (hit) return hit

  const written = recipe.ingredients ?? []
  let lines: ResolvedIngredient[] = []
  let items: MealItem[]

  if (written.length) {
    /* A shortlist, not a single answer. `matchIngredient` reranks these by how
       well the name actually fits, so handing it one row would leave it
       nothing to choose between and reintroduce the bad-guess problem. */
    const search = (q: string) => searchLocal(q, extraFoods, 25)
    lines = written.map((l) => resolveIngredient(parseIngredient(l), search))
    items = lines.map(toMealItem).filter((i): i is MealItem => i !== null)
  } else {
    // Built in the editor: already a list of foods and amounts.
    items = recipe.items
  }

  const total = items.length ? sumNutrients(items.map((i) => i.nutrients)) : emptyNutrients()
  const made = Math.max(1, recipe.servingsMade)
  const perServing = scaleNutrients(total, 1 / made)

  const resolved: ResolvedRecipe = {
    recipe,
    lines,
    items,
    total,
    perServing,
    health: healthScore(perServing),
    // Anything the calorie total does not include, whatever the reason.
    unmatched: lines.filter((l) => !l.nutrients).map((l) => l.parsed.raw),
    approximate: lines.filter((l) => l.approximate).length,
  }

  /* Bounded so a long session browsing recipes cannot grow without limit. The
     oldest entry goes; recency is a good enough proxy for what will be asked
     for again on a screen you scroll through. */
  if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value as string)
  CACHE.set(key, resolved)
  return resolved
}

/** Total minutes, or null when the recipe does not say. */
export function totalMinutes(r: Recipe): number | null {
  const t = (r.prepMin ?? 0) + (r.cookMin ?? 0)
  return t > 0 ? t : null
}

/** "1h 15m", "25m" — the form both reference apps use on a card. */
export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/** How many ingredients a recipe lists, however it was written. */
export function ingredientCount(r: Recipe): number {
  return (r.ingredients ?? []).length || r.items.length
}

/**
 * Everything the user can plan from: what they wrote, then what shipped.
 *
 * Theirs first, always — a recipe someone typed in should never rank below one
 * that came with the app. After that the eight hand-written seeds, then the
 * USDA catalogue, which is the largest but the least personal.
 */
export function allRecipes(userRecipes: Recipe[]): Recipe[] {
  const seen = new Set(userRecipes.map((r) => r.id))
  const shipped = [...SEED_RECIPES, ...CATALOG_RECIPES].filter((r) => !seen.has(r.id))
  return [...userRecipes, ...shipped]
}

/** Just the ones the user made, for the "your recipes" shelf. */
export function ownRecipes(userRecipes: Recipe[]): Recipe[] {
  return userRecipes
}

export function findRecipe(userRecipes: Recipe[], id: string): Recipe | undefined {
  return allRecipes(userRecipes).find((r) => r.id === id)
}

/* ----------------------------------------------------------------- search -- */

/**
 * Recipe search, over the fields a person would actually search by.
 *
 * Deliberately simple next to `foodSearch`: that one ranks a quarter of a
 * million rows on every keystroke, this one filters at most a few hundred.
 */
export function searchRecipes(
  recipes: Recipe[],
  query: string,
  filters: { tags?: string[]; maxMinutes?: number; ingredients?: string[] } = {},
): Recipe[] {
  const q = query.trim().toLowerCase()
  const tags = (filters.tags ?? []).map((t) => t.toLowerCase())
  const wanted = (filters.ingredients ?? []).map((i) => i.toLowerCase())

  return recipes.filter((r) => {
    if (q) {
      const hay = [r.name, r.description ?? '', ...(r.tags ?? []), ...(r.ingredients ?? [])]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (tags.length) {
      const rt = (r.tags ?? []).map((t) => t.toLowerCase())
      if (!tags.every((t) => rt.includes(t))) return false
    }
    if (filters.maxMinutes != null) {
      const t = totalMinutes(r)
      if (t == null || t > filters.maxMinutes) return false
    }
    if (wanted.length) {
      const ing = (r.ingredients ?? []).join(' ').toLowerCase()
      // Any, not all: picking three things you have should widen the results,
      // not narrow them to recipes needing exactly those three.
      if (!wanted.some((w) => ing.includes(w))) return false
    }
    return true
  })
}

/** Every tag in use, for the filter sheet. */
export function allTags(recipes: Recipe[]): string[] {
  const s = new Set<string>()
  for (const r of recipes) for (const t of r.tags ?? []) s.add(t)
  return [...s].sort()
}
