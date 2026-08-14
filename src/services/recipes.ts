import type { Food, MealItem, Nutrients, Recipe } from '../types'
import { emptyNutrients, scaleNutrients, sumNutrients } from '../lib/nutrition'
import {
  parseIngredient,
  resolveIngredient,
  toMealItem,
  type ResolvedIngredient,
} from '../lib/ingredients'
export { parseIngredient }
import { searchLocal } from './foodSearch'
import { foodDbSize } from './foodDb'
import { SEED_RECIPES } from '../data/seedRecipes'
import { AUTHORED_RECIPES } from '../data/authoredRecipes'
import { catalogRecipes, catalogSize } from './recipeDb'
import { healthScore, type HealthScore } from '../lib/healthScore'
import {
  dietTagsFor,
  matchesTerm,
  nutritionTagsFor,
  type DietTag,
  type NutritionTag,
} from '../lib/recipeTags'

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
  /** Dietary labels worked out from the nutrition — High Protein, Low Carb… */
  nutritionTags: NutritionTag[]
  /** Vegan / Vegetarian / Pescatarian, read off the ingredient list. */
  dietTags: DietTag[]
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
 * How much of the food database is in memory, as a cache key.
 *
 * `foodDbSize()` reads a length. The first version of this ran a search for
 * "chicken" and counted the hits, which is a scan of every row in the database
 * — per recipe, on every render, with a hundred and twenty recipe cards on
 * screen. The cache meant to make resolution cheap was the most expensive thing
 * in the feature.
 */
function dbGeneration(): number {
  // Both matter: nutrition changes as the food database grows, and the set of
  // recipes changes as the catalogue lands.
  return foodDbSize() + catalogSize()
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

  const made = Math.max(1, recipe.servingsMade)
  const parsedTotal = items.length
    ? sumNutrients(items.map((i) => i.nutrients))
    : emptyNutrients()

  /* Published nutrition wins for the headline figures when the recipe has it.
     The per-ingredient calories below still come from the parser, because
     that is a breakdown nobody else can supply — but the number at the top of
     the screen should be the one its author stands behind. */
  const perServing = recipe.nutritionPerServing
    ? ({ ...emptyNutrients(), ...recipe.nutritionPerServing } as Nutrients)
    : scaleNutrients(parsedTotal, 1 / made)
  const total = recipe.nutritionPerServing
    ? scaleNutrients(perServing, made)
    : parsedTotal

  const resolved: ResolvedRecipe = {
    recipe,
    lines,
    items,
    total,
    perServing,
    health: healthScore(perServing),
    nutritionTags: nutritionTagsFor(perServing),
    dietTags: dietTagsFor(written),
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

/**
 * A recipe's headline numbers, without parsing anything.
 *
 * The cheap path, and the one every list uses. Five hundred recipes across
 * sixteen rails is eight thousand lookups if each one has to be resolved; with
 * published nutrition it is eight thousand property reads. Falls back to the
 * full resolve only for recipes with no published figures — which means the
 * user's own, of which there are never many.
 */
export interface RecipeSummary {
  perServing: Nutrients
  nutritionTags: NutritionTag[]
  dietTags: DietTag[]
  health: HealthScore
}

const SUMMARIES = new Map<string, RecipeSummary>()

export function summarise(recipe: Recipe, extraFoods: Food[] = []): RecipeSummary {
  const published = recipe.nutritionPerServing
  if (!published) {
    // No published figures: this is the user's own, so resolve it properly.
    const full = resolveRecipe(recipe, extraFoods)
    return {
      perServing: full.perServing,
      nutritionTags: full.nutritionTags,
      dietTags: full.dietTags,
      health: full.health,
    }
  }

  const key = `${recipe.id}~${recipe.servingsMade}`
  const hit = SUMMARIES.get(key)
  if (hit) return hit

  const perServing = { ...emptyNutrients(), ...published }
  const summary: RecipeSummary = {
    perServing,
    nutritionTags: nutritionTagsFor(perServing),
    dietTags: dietTagsFor(recipe.ingredients ?? []),
    health: healthScore(perServing),
  }
  SUMMARIES.set(key, summary)
  return summary
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
  const catalog = catalogRecipes()

  /* The eight hand-written seeds are a fallback, not a supplement.
   *
   * They exist so the Plan tab is not empty if recipes.json never arrives, and
   * they are the only recipes in the app with no photograph — so while the
   * catalogue is still downloading they were the entire screen, which is why
   * Plan opened as a wall of blank cards. With five hundred illustrated
   * recipes available there is no reason to mix them in. */
  /* Ours first among the shipped ones. They are the calorie-dense half the
     USDA library has none of, so burying them under four hundred lighter
     recipes would waste the reason they were written. */
  const shipped = catalog.length ? [...AUTHORED_RECIPES, ...catalog] : SEED_RECIPES
  return [...userRecipes, ...shipped.filter((r) => !seen.has(r.id))]
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
export interface RecipeFilters {
  /** Meal type, diet, cuisine and nutrition terms, all matched the same way. */
  terms?: string[]
  maxMinutes?: number
  ingredients?: string[]
  /** Restrict to recipes the user has saved. */
  savedOnly?: boolean
  savedIds?: string[]
}

export type SortKey = 'relevance' | 'calories' | 'time' | 'health' | 'name'

/**
 * Recipe search across every facet at once.
 *
 * Terms from different groups combine with AND — asking for High Protein *and*
 * Dinner should narrow — while ingredients combine with OR, because naming
 * three things in the fridge is an invitation to show anything using any of
 * them. Getting those two the same way round would make the ingredient picker
 * useless the moment you added a second ingredient.
 */
export function searchRecipes(
  recipes: Recipe[],
  query: string,
  filters: RecipeFilters = {},
  resolve: (r: Recipe) => { nutritionTags: string[]; dietTags: string[] } = (r) =>
    summarise(r),
): Recipe[] {
  const q = query.trim().toLowerCase()
  const terms = filters.terms ?? []
  const wanted = (filters.ingredients ?? []).map((i) => i.toLowerCase())
  const saved = new Set(filters.savedIds ?? [])

  return recipes.filter((r) => {
    if (filters.savedOnly && !saved.has(r.id)) return false

    if (q) {
      const hay = [r.name, r.description ?? '', ...(r.tags ?? []), ...(r.ingredients ?? [])]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }

    if (terms.length) {
      const res = resolve(r)
      const subject = {
        tags: r.tags,
        name: r.name,
        // Both computed sets count as labels the recipe answers to.
        nutritionTags: [...res.nutritionTags, ...res.dietTags],
      }
      if (!terms.every((t) => matchesTerm(t, subject))) return false
    }

    if (filters.maxMinutes != null) {
      const t = totalMinutes(r)
      if (t == null || t > filters.maxMinutes) return false
    }

    if (wanted.length) {
      const ing = (r.ingredients ?? []).join(' ').toLowerCase()
      if (!wanted.some((w) => ing.includes(w))) return false
    }

    return true
  })
}

/** Orders results. Relevance keeps whatever order the caller assembled. */
export function sortRecipes(
  recipes: Recipe[],
  key: SortKey,
  resolve: (r: Recipe) => { perServing: { calories: number }; health: { score: number } } = (r) =>
    summarise(r),
): Recipe[] {
  if (key === 'relevance') return recipes
  const out = [...recipes]
  if (key === 'name') return out.sort((a, b) => a.name.localeCompare(b.name))
  if (key === 'time') {
    return out.sort((a, b) => (totalMinutes(a) ?? 9999) - (totalMinutes(b) ?? 9999))
  }
  if (key === 'calories') {
    return out.sort((a, b) => resolve(a).perServing.calories - resolve(b).perServing.calories)
  }
  return out.sort((a, b) => resolve(b).health.score - resolve(a).health.score)
}

/** Every tag a recipe declares, for building the filter lists. */
export function allTags(recipes: Recipe[]): string[] {
  const s = new Set<string>()
  for (const r of recipes) for (const t of r.tags ?? []) s.add(t)
  return [...s].sort()
}

/**
 * The ingredients that turn up most across the library.
 *
 * Feeds the "Search by ingredients" chips, which Samsung Food seeds with
 * Recent, Favorites and Popular. Popular is the only one of the three that can
 * be answered without any history, so it is what a first-time list shows.
 */
export function popularIngredients(recipes: Recipe[], limit = 24): string[] {
  const counts = new Map<string, number>()
  for (const r of recipes) {
    const seen = new Set<string>()
    for (const line of r.ingredients ?? []) {
      const name = parseIngredient(line).name.toLowerCase().trim()
      // Multi-word ingredient lines are too specific to be a useful chip;
      // the head word is what someone would actually tap.
      const key = name.split(/\s+/).slice(-1)[0]
      if (!key || key.length < 3 || seen.has(key)) continue
      seen.add(key)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name)
}
