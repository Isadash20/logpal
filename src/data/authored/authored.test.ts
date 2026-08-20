import { describe, expect, it } from 'vitest'
import { AUTHORED_RECIPES } from '../authoredRecipes'
import { COOK_TIMES, CUISINES, DIETS, MEAL_TYPES, NUTRITION_TAGS } from '../../lib/recipeTags'

/*
 * Authored recipes state their own nutrition rather than deriving it, so
 * nothing else in the app can catch a typo in those numbers. These checks are
 * what stands in for that: the macros have to add up to the calories, and the
 * rest of the record has to be complete enough to render.
 */

const VOCAB = new Set<string>([
  ...MEAL_TYPES,
  ...DIETS,
  ...CUISINES,
  ...NUTRITION_TAGS,
  ...COOK_TIMES.map((c) => c.label),
])

describe('authored recipes', () => {
  it('have unique ids', () => {
    const ids = AUTHORED_RECIPES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('are complete enough to cook from', () => {
    for (const r of AUTHORED_RECIPES) {
      expect(r.name, r.id).toBeTruthy()
      expect(r.servingsMade, r.id).toBeGreaterThan(0)
      expect((r.ingredients ?? []).length, r.id).toBeGreaterThan(2)
      expect((r.steps ?? []).length, r.id).toBeGreaterThan(1)
      expect(r.description, r.id).toBeTruthy()
    }
  })

  it('state macros that add up to the stated calories', () => {
    /* Atwater: 4 kcal a gram for protein and carbohydrate, 9 for fat, and
       fibre at 2 rather than 4. It is counted inside carbohydrate but is only
       partly available, so a high-fibre dish legitimately comes in under the
       naive sum. Real food lands within a few percent of this; anything further
       out is a typo, not biochemistry. */
    for (const r of AUTHORED_RECIPES) {
      const n = r.nutritionPerServing
      if (!n) continue
      const fiber = n.fiber ?? 0
      const atwater =
        4 * (n.protein ?? 0) + 4 * ((n.carbs ?? 0) - fiber) + 2 * fiber + 9 * (n.fat ?? 0)
      const stated = n.calories ?? 0
      expect(Math.abs(atwater - stated) / stated, `${r.id}: ${stated} stated vs ${Math.round(atwater)}`).toBeLessThan(0.15)
    }
  })

  it('keep the parts of a nutrient inside the whole', () => {
    for (const r of AUTHORED_RECIPES) {
      const n = r.nutritionPerServing
      if (!n) continue
      expect(n.satFat ?? 0, r.id).toBeLessThanOrEqual(n.fat ?? 0)
      expect(n.sugar ?? 0, r.id).toBeLessThanOrEqual((n.carbs ?? 0) + 0.5)
      expect(n.fiber ?? 0, r.id).toBeLessThanOrEqual((n.carbs ?? 0) + 0.5)
    }
  })

  /* Tags are free-form by design, "Makes leftovers" is useful and belongs to
     no filter. What matters is that every recipe answers to at least one meal
     type and that anything looking like a diet or cuisine is spelled the way
     the filters spell it, or the recipe is invisible to the chip that should
     find it. */
  it('carry a meal type the filters can find them by', () => {
    const meals = new Set<string>(MEAL_TYPES)
    for (const r of AUTHORED_RECIPES) {
      expect((r.tags ?? []).some((t) => meals.has(t)), r.id).toBe(true)
    }
  })

  it('spell filter tags the way the filters do', () => {
    const lower = new Map([...VOCAB].map((t) => [t.toLowerCase(), t]))
    for (const r of AUTHORED_RECIPES) {
      for (const t of r.tags ?? []) {
        const canonical = lower.get(t.toLowerCase())
        if (canonical) expect(t, r.id).toBe(canonical)
      }
    }
  })
})
