import type { Nutrients } from '../types'

/**
 * Dietary labels worked out from a recipe's own nutrition.
 *
 * Samsung Food files recipes under High Protein, Low Carb, High Fiber and so
 * on, and those labels are the main way anyone navigates a library of a hundred
 * thousand recipes. Theirs come from whoever uploaded the recipe, which is why
 * their tags are uneven — a recipe is "keto" because someone said so.
 *
 * Ours are computed from the nutrition we already resolve, per serving. That
 * costs nothing, cannot be gamed, and applies to a recipe somebody typed in
 * five minutes ago as readily as to one that shipped with the app. It also
 * means a filter can never lie: if a recipe is listed under High Protein it is
 * because it has the protein.
 *
 * Thresholds follow the FDA's nutrient content claims where they define one
 * (21 CFR 101.54/101.60), and are stated per serving rather than per 100 g,
 * because a serving is what someone is about to eat.
 */

export const NUTRITION_TAGS = [
  'High Protein',
  'Low Carb',
  'High Fiber',
  'Low Sugar',
  'Low Fat',
  'Low Sodium',
  'Low Calorie',
  'GLP-1 Friendly',
] as const

export type NutritionTag = (typeof NUTRITION_TAGS)[number]

/**
 * GLP-1 friendly.
 *
 * Named because people on semaglutide and tirzepatide are now a large part of
 * who uses a calorie tracker, and they are looking for something specific:
 * appetite is small, so every bite has to carry protein, and fat and sugar sit
 * badly. This is that combination — protein-dense, some fibre, modest portion,
 * not greasy, not sweet — rather than a medical claim. Nothing here is advice;
 * it is a filter over nutrition the recipe already declares.
 */
function isGlp1Friendly(n: Nutrients): boolean {
  return (
    n.protein >= 15 &&
    n.fiber >= 3 &&
    n.calories > 0 &&
    n.calories <= 550 &&
    n.sugar <= 12 &&
    n.fat <= 20
  )
}

export function nutritionTagsFor(n: Nutrients): NutritionTag[] {
  const out: NutritionTag[] = []
  if (!n.calories) return out

  // FDA "high" for a nutrient is 20% of its daily value in a serving.
  if (n.protein >= 15) out.push('High Protein')
  if (n.fiber >= 5.6) out.push('High Fiber')

  /* No federal definition of low carb exists, so this is the threshold the
     low-carb world actually uses for a meal rather than an invented one. */
  if (n.carbs <= 25) out.push('Low Carb')

  // "Low sugar" is not an FDA claim either; 5 g a serving is the common line.
  if (n.sugar <= 5) out.push('Low Sugar')

  // 21 CFR 101.62: low fat is 3 g or less per serving.
  if (n.fat <= 3) out.push('Low Fat')

  // 21 CFR 101.61: low sodium is 140 mg or less per serving.
  if (n.sodium <= 140) out.push('Low Sodium')

  // 21 CFR 101.60: low calorie is 40 kcal per serving, which is written for a
  // single food and absurd for a dinner. 400 is the meal-sized equivalent.
  if (n.calories <= 400) out.push('Low Calorie')

  if (isGlp1Friendly(n)) out.push('GLP-1 Friendly')

  return out
}

/* ------------------------------------------------------------- vocabulary -- */

/**
 * The filter vocabulary, in Samsung Food's own groups.
 *
 * Kept as data rather than hardcoded into the sheet so the same lists drive the
 * chips, the sheet and the matching, and cannot drift apart.
 */
export const MEAL_TYPES = [
  'Breakfast', 'Brunch', 'Lunch', 'Dinner', 'Snack', 'Dessert',
  'Appetizer', 'Side dish', 'Main dish', 'Salad', 'Soup', 'Beverage', 'Bread',
] as const

export const DIETS = [
  'Vegetarian', 'Vegan', 'Pescatarian', 'Dairy Free', 'Gluten Free',
  'Keto', 'Paleo', 'Mediterranean', 'Low Carb',
] as const

export const CUISINES = [
  'American', 'Italian', 'Mexican', 'Asian', 'Indian', 'Mediterranean',
  'Middle Eastern', 'African', 'Caribbean', 'French', 'Greek', 'Thai',
] as const

export interface CookTimeBand {
  label: string
  maxMinutes: number
}

export const COOK_TIMES: CookTimeBand[] = [
  { label: 'Under 15 min', maxMinutes: 15 },
  { label: 'Under 30 min', maxMinutes: 30 },
  { label: 'Under 1 hour', maxMinutes: 60 },
]

/**
 * Words in a recipe's own tags or title that imply a meal type or cuisine.
 *
 * The USDA catalogue labels recipes by food group ("Protein Foods",
 * "Vegetables") and dish type ("Main dish", "Salad"), which is close to but not
 * the same as Samsung Food's vocabulary. Mapping rather than renaming keeps the
 * source data intact and lets one recipe answer to several filters.
 */
export const TAG_SYNONYMS: Record<string, string[]> = {
  Breakfast: ['breakfast', 'brunch', 'oatmeal', 'pancake', 'smoothie', 'egg'],
  Lunch: ['lunch', 'sandwich', 'wrap'],
  Dinner: ['dinner', 'main dish', 'main course', 'entree', 'casserole'],
  Snack: ['snack', 'dip', 'bar'],
  Dessert: ['dessert', 'cake', 'cookie', 'pudding', 'pie', 'sweet'],
  Appetizer: ['appetizer', 'appetizers', 'starter', 'dip'],
  'Side dish': ['side dish', 'side'],
  'Main dish': ['main dish', 'main course', 'entree'],
  Salad: ['salad'],
  Soup: ['soup', 'stew', 'chili', 'chowder'],
  Beverage: ['beverage', 'drink', 'smoothie', 'juice'],
  Bread: ['bread', 'muffin', 'biscuit', 'roll'],
  Vegetarian: ['vegetarian', 'meatless'],
  Vegan: ['vegan'],
  Pescatarian: ['pescatarian', 'fish', 'salmon', 'seafood', 'tuna'],
  'Gluten Free': ['gluten free', 'gluten-free'],
  'Dairy Free': ['dairy free', 'dairy-free'],
  Mediterranean: ['mediterranean', 'greek'],
  American: ['american'],
  Italian: ['italian', 'pasta', 'pizza'],
  Mexican: ['mexican', 'taco', 'burrito', 'salsa', 'quesadilla'],
  Asian: ['asian', 'chinese', 'japanese', 'korean', 'stir fry', 'stir-fry', 'teriyaki'],
  Indian: ['indian', 'curry', 'masala'],
  Thai: ['thai'],
  French: ['french'],
  Greek: ['greek'],
  Caribbean: ['caribbean', 'jamaican'],
  African: ['african'],
  'Middle Eastern': ['middle eastern', 'hummus', 'falafel'],
  Keto: ['keto'],
  Paleo: ['paleo'],
}

/**
 * True when a recipe answers to a filter term.
 *
 * Checks the recipe's declared tags and its title, because the USDA catalogue
 * often says "Salad" only in the name. Substring matching on a word list rather
 * than exact equality, so "Main dish" catches "main dish" and "Main Dishes".
 */
export function matchesTerm(
  term: string,
  haystack: { tags?: string[]; name: string; nutritionTags: string[] },
): boolean {
  if (haystack.nutritionTags.includes(term)) return true

  const text = [...(haystack.tags ?? []), haystack.name].join(' ').toLowerCase()
  const words = TAG_SYNONYMS[term] ?? [term.toLowerCase()]
  return words.some((w) => text.includes(w))
}
