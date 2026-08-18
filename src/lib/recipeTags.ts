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
  'High Carb',
  'Low Carb',
  'High Fiber',
  'Low Sugar',
  'Sugar Free',
  'Low Fat',
  'Low Sodium',
  'Low Cholesterol',
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

  /* The mirror of it, and asked for by name: someone eating to gain, or
     carb-loading before a race, is looking for exactly what the low-carb
     filter hides. Carbohydrate is not a fault to be filtered away. */
  if (n.carbs >= 45) out.push('High Carb')

  // "Low sugar" is not an FDA claim either; 5 g a serving is the common line.
  if (n.sugar <= 5) out.push('Low Sugar')

  /* 21 CFR 101.60: sugar free is under 0.5 g a serving. Strict on purpose —
     anything with fruit or honey in it will not qualify, and a Sugar Free
     filter that returned sweetened recipes would be the one lie in a set of
     tags whose whole point is that they are computed and cannot lie. */
  if (n.sugar < 0.5) out.push('Sugar Free')

  // 21 CFR 101.62: low fat is 3 g or less per serving.
  if (n.fat <= 3) out.push('Low Fat')

  // 21 CFR 101.61: low sodium is 140 mg or less per serving.
  if (n.sodium <= 140) out.push('Low Sodium')

  /* 21 CFR 101.62: low cholesterol is 20 mg or less per serving. Filterable
     for anyone who wants it, but deliberately not scored — the 2020–2025
     Dietary Guidelines set no numeric limit, and scoring it made eggs the
     worst thing in the catalogue. */
  if ((n.cholesterol ?? 0) <= 20) out.push('Low Cholesterol')

  /* 21 CFR 101.60 puts low calorie at 40 kcal per serving, which is written
     for a single food and absurd for a dinner. 400 was the first meal-sized
     translation and it matched 505 of 528 recipes — a filter that returns
     almost everything answers no question at all. 250 is a genuinely light
     serving and leaves the label meaning something. */
  if (n.calories <= 250) out.push('Low Calorie')

  if (isGlp1Friendly(n)) out.push('GLP-1 Friendly')

  return out
}

/* ------------------------------------------------------------------ diets -- */

/**
 * Diet labels read off the ingredient list.
 *
 * The catalogue is USDA's, and USDA files recipes by food group — "Protein
 * Foods", "Vegetables", "Grains" — not by diet. Nothing in the source data says
 * vegetarian, so matching the word against tags and titles found almost
 * nothing, and a Vegetarian filter that returns four recipes out of five
 * hundred is worse than no filter at all: it reads as "there is nothing here
 * for you" when the truth is "nobody labelled it".
 *
 * Reading the ingredients instead answers it properly. The lists below are the
 * things that disqualify, which is the only direction that can be decided from
 * an ingredient list — the absence of meat is knowable, whereas "is this dish
 * authentically vegan" is not.
 */

const MEAT = [
  'beef', 'steak', 'pork', 'bacon', 'ham', 'sausage', 'chicken', 'turkey',
  'lamb', 'veal', 'venison', 'chorizo', 'pepperoni', 'salami', 'prosciutto',
  'mince', 'meatball', 'brisket', 'ribs', 'liver', 'duck', 'goose', 'rabbit',
  'lard', 'gelatin', 'bouillon', 'broth', 'stock',
]

const FISH = [
  'fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'haddock',
  'sardine', 'anchovy', 'mackerel', 'shrimp', 'prawn', 'crab', 'lobster',
  'clam', 'mussel', 'oyster', 'scallop', 'squid', 'calamari', 'catfish',
  'pollock', 'snapper', 'herring', 'caviar', 'surimi',
]

const ANIMAL = [
  'milk', 'cream', 'butter', 'cheese', 'yogurt', 'yoghurt', 'egg', 'honey',
  'mayonnaise', 'ghee', 'buttermilk', 'custard', 'whey', 'casein',
  'mozzarella', 'parmesan', 'cheddar', 'feta', 'ricotta', 'half-and-half',
]

/**
 * Words that look like an animal product but are not.
 *
 * "Almond milk" contains "milk" and "peanut butter" contains "butter"; both are
 * vegan, and a naive substring check quietly disqualifies most of the plant
 * recipes in the catalogue. Checked before the disqualifying lists.
 */
const NOT_ANIMAL = [
  'almond milk', 'soy milk', 'oat milk', 'coconut milk', 'rice milk',
  'cashew milk', 'peanut butter', 'almond butter', 'cashew butter',
  'apple butter', 'cocoa butter', 'nut butter', 'sunflower butter',
  'vegetable broth', 'vegetable stock', 'vegetable bouillon',
  'buttermilk substitute', 'butternut', 'egg substitute', 'egg replacer',
  'milk-free', 'dairy-free', 'nutritional yeast',
]

function ingredientText(ingredients: string[]): string {
  let text = ingredients.join(' ; ').toLowerCase()
  // Neutralise the false friends before anything else looks at the string.
  for (const phrase of NOT_ANIMAL) text = text.split(phrase).join(' ')
  return text
}

function containsAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w))
}

export type DietTag = 'Vegan' | 'Vegetarian' | 'Pescatarian' | 'No Added Sugar'

/**
 * Sweeteners that count as added sugar.
 *
 * Fruit is deliberately absent: a smoothie sweetened only by its own bananas
 * is what most people mean by no added sugar, and excluding it would leave the
 * filter as thin as the FDA's 0.5 g line already makes "Sugar Free" — eleven
 * recipes out of five hundred, which answers nobody's question.
 */
export const ADDED_SUGARS = [
  'sugar', 'honey', 'maple syrup', 'agave', 'molasses', 'corn syrup',
  'golden syrup', 'treacle', 'chocolate chip', 'condensed milk', 'jam',
  'marmalade', 'caramel', 'icing', 'sweetener', 'dextrose', 'fructose',
  'sucrose', 'glucose syrup', 'brown sugar', 'palm sugar',
]

/**
 * Which diets a recipe is compatible with, from its ingredients alone.
 *
 * Nested deliberately: anything vegan is also vegetarian and pescatarian, and
 * anything vegetarian is also pescatarian, because someone filtering for
 * pescatarian wants everything they can eat and not only the dishes containing
 * fish. A filter that hid the vegetables from a pescatarian would be answering
 * a question nobody asked.
 */
/** Whether the ingredient list contains a sweetener. Used by the health score. */
export function hasAddedSugar(ingredients: string[]): boolean {
  return containsAny(ingredientText(ingredients), ADDED_SUGARS)
}

export function dietTagsFor(ingredients: string[]): DietTag[] {
  if (!ingredients.length) return []
  const text = ingredientText(ingredients)

  const hasMeat = containsAny(text, MEAT)
  const hasFish = containsAny(text, FISH)
  const hasAnimal = containsAny(text, ANIMAL)

  const out: DietTag[] = []
  if (!hasMeat && !hasFish && !hasAnimal) out.push('Vegan')
  if (!hasMeat && !hasFish) out.push('Vegetarian')
  if (!hasMeat) out.push('Pescatarian')
  if (!containsAny(text, ADDED_SUGARS)) out.push('No Added Sugar')
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
  'Keto', 'Paleo', 'Mediterranean', 'Low Carb', 'No Added Sugar',
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
