import type { Recipe } from '../../types'

/**
 * The shape every authored recipe is written in, and the helper that expands it.
 *
 * Split out of `authoredRecipes.ts` once the authored library outgrew one file:
 * the themed batches under this directory all register their photo credits into
 * the same map, so it has to live somewhere neither side imports back.
 */
export interface Authored extends Recipe {
  /** What to look for when fetching a photograph. Consumed by the photo script. */
  photoQuery?: string
}

/** Photographer and licence, shown on the recipe. Their work, their credit. */
export const PHOTO_CREDITS: Record<string, string> = {}

export interface AuthoredInput {
  id: string
  name: string
  description: string
  servings: number
  prep: number
  cook: number
  tags: string[]
  ingredients: string[]
  steps: string[]
  n: {
    calories: number
    protein: number
    carbs: number
    fat: number
    satFat: number
    fiber: number
    sugar: number
    sodium: number
  }
  photo: string
  imageUrl?: string
  photoCredit?: string
}

export function r(a: AuthoredInput): Authored {
  if (a.imageUrl && a.photoCredit) PHOTO_CREDITS[`own_${a.id}`] = a.photoCredit
  return {
    id: `own_${a.id}`,
    name: a.name,
    description: a.description,
    servingsMade: a.servings,
    prepMin: a.prep,
    cookMin: a.cook,
    tags: a.tags,
    ingredients: a.ingredients,
    steps: a.steps,
    items: [],
    createdAt: 0,
    nutritionPerServing: { ...a.n, cholesterol: 0 },
    photoQuery: a.photo,
    imageUrl: a.imageUrl,
  }
}
