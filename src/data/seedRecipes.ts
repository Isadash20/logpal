import type { Recipe } from '../types'

/**
 * Recipes that ship with the app.
 *
 * Written for LogPal rather than collected: Samsung Food's library is community
 * content and MyFitnessPal's is licensed, so neither could be shipped here even
 * though both are what makes those apps feel full on first run. These are
 * plain, widely-known preparations written in our own words, enough that the
 * planner, the shopping list and the search have something real to work on
 * before anyone has typed a recipe in.
 *
 * `items` is empty on purpose. Nutrition is resolved from the ingredient lines
 * against the food database at display time, which means these get better as
 * the database loads rather than shipping a frozen guess. See
 * `services/recipes.ts`.
 */

function r(
  id: string,
  name: string,
  description: string,
  servingsMade: number,
  prepMin: number,
  cookMin: number,
  tags: string[],
  ingredients: string[],
  steps: string[],
): Recipe {
  return {
    id,
    name,
    description,
    servingsMade,
    prepMin,
    cookMin,
    tags,
    ingredients,
    steps,
    items: [],
    createdAt: 0,
  }
}

export const SEED_RECIPES: Recipe[] = [
  r(
    'r_oats_pb',
    'Peanut Butter Overnight Oats',
    'Mixed the night before and ready when you are. Keeps three days in the fridge.',
    2, 10, 0,
    ['Breakfast', 'High Protein', 'Under 15 min', 'Vegetarian'],
    [
      '1 cup rolled oats',
      '1 cup 2% milk',
      '2 tablespoons peanut butter',
      '1 banana, sliced',
      '1 tablespoon honey',
      '1 teaspoon vanilla',
      'Salt, a pinch',
    ],
    [
      'Stir the oats, milk, peanut butter, honey and vanilla together in a jar until there are no dry patches left.',
      'Cover and refrigerate overnight, or at least four hours.',
      'Top with the sliced banana and a pinch of salt before eating.',
    ],
  ),

  r(
    'r_chicken_rice',
    'Garlic Chicken and Rice Bowl',
    'The everyday bowl: seasoned chicken, rice and something green in one pan.',
    4, 15, 25,
    ['Dinner', 'High Protein', 'American'],
    [
      '1 pound chicken breast, cut into strips',
      '2 cups white rice, cooked',
      '2 tablespoons olive oil',
      '3 cloves garlic, minced',
      '2 cups broccoli',
      '1 tablespoon soy sauce',
      '1 teaspoon salt',
      '½ teaspoon ground black pepper',
    ],
    [
      'Season the chicken with the salt and pepper.',
      'Heat the oil in a large pan over medium-high heat and cook the chicken until browned through, about 8 minutes.',
      'Add the garlic and broccoli and cook another 4 minutes, until the broccoli is bright and just tender.',
      'Stir through the soy sauce and serve over the rice.',
    ],
  ),

  r(
    'r_greek_salad',
    'Greek Salad with Feta',
    'No cooking at all. Best made an hour ahead so the tomatoes let go of their juice.',
    2, 12, 0,
    ['Lunch', 'Vegetarian', 'Mediterranean', 'Under 15 min'],
    [
      '3 tomatoes, chopped',
      '1 cucumber, sliced',
      '½ red onion, thinly sliced',
      '½ cup feta cheese',
      '2 tablespoons olive oil',
      '1 tablespoon lemon juice',
      /* A quarter teaspoon, not one. The feta brings most of the salt already,
         and the original teaspoon worked out at 1,150 mg a serving, which the
         health score was quite right to mark down. The recipe was wrong, not
         the score. */
      '¼ teaspoon salt',
      'Black pepper, to taste',
    ],
    [
      'Combine the tomatoes, cucumber and onion in a bowl.',
      'Dress with the olive oil, lemon juice and salt and toss gently.',
      'Crumble the feta over the top and leave to sit for an hour if you have it.',
    ],
  ),

  r(
    'r_salmon_sheet',
    'Sheet Pan Salmon and Vegetables',
    'Everything roasts on one tray, so there is one thing to wash up.',
    4, 10, 20,
    ['Dinner', 'High Protein', 'Pescatarian'],
    [
      '1 pound salmon',
      '2 cups sweet potato, cubed',
      '2 cups green beans',
      '2 tablespoons olive oil',
      '1 lemon',
      '1 teaspoon salt',
      '1 teaspoon paprika',
    ],
    [
      'Heat the oven to 220°C / 425°F.',
      'Toss the sweet potato with half the oil and the paprika and roast for 12 minutes.',
      'Push the potato aside, add the salmon and green beans, dress with the rest of the oil and the salt, and roast another 12 minutes.',
      'Squeeze the lemon over everything before serving.',
    ],
  ),

  r(
    'r_egg_scramble',
    'Spinach and Feta Scramble',
    'Five minutes, one pan, and enough protein to hold until lunch.',
    1, 5, 5,
    ['Breakfast', 'Vegetarian', 'Under 15 min', 'High Protein'],
    [
      '3 eggs',
      '1 cup spinach',
      '¼ cup feta cheese',
      '1 teaspoon butter',
      'Salt and pepper, to taste',
    ],
    [
      'Beat the eggs with a little salt and pepper.',
      'Melt the butter in a non-stick pan over low heat and wilt the spinach for a minute.',
      'Pour in the eggs and stir slowly until just set, then fold through the feta off the heat.',
    ],
  ),

  r(
    'r_lentil_soup',
    'Everyday Lentil Soup',
    'Cheap, freezes well, and better the next day.',
    6, 15, 35,
    ['Dinner', 'Vegan', 'Vegetarian', 'High Fiber'],
    [
      '2 cups lentils, dry',
      '1 onion, diced',
      '2 carrots, diced',
      '2 stalks celery, diced',
      '3 cloves garlic, minced',
      '2 tablespoons olive oil',
      '6 cups vegetable stock',
      '1 teaspoon cumin',
      '1 teaspoon salt',
    ],
    [
      'Soften the onion, carrot and celery in the oil over medium heat for about 8 minutes.',
      'Add the garlic and cumin and cook one minute more, until it smells like something.',
      'Add the lentils and stock, bring to a boil, then simmer covered for 30 minutes until the lentils are soft.',
      'Season with the salt and blend half of it if you want it thicker.',
    ],
  ),

  r(
    'r_turkey_chili',
    'Turkey Chili',
    'A big pot on a Sunday that covers lunches for most of the week.',
    6, 15, 40,
    ['Dinner', 'High Protein', 'American', 'Makes leftovers'],
    [
      '1 pound ground turkey',
      '1 onion, diced',
      '2 cups black beans',
      '2 cups canned tomatoes',
      '1 red bell pepper, diced',
      '2 tablespoons olive oil',
      '2 teaspoons cumin',
      '1 tablespoon chili powder',
      '1 teaspoon salt',
    ],
    [
      'Brown the turkey in the oil in a heavy pot, breaking it up as it cooks.',
      'Add the onion and pepper and cook until softened, about 6 minutes.',
      'Stir in the cumin and chili powder, then the tomatoes and beans.',
      'Simmer uncovered for 30 minutes, stirring now and then, and season with the salt.',
    ],
  ),

  r(
    'r_berry_smoothie',
    'Berry Protein Smoothie',
    'Blender to glass in two minutes, and it travels.',
    1, 3, 0,
    ['Breakfast', 'High Protein', 'Under 15 min', 'Grab and go'],
    [
      '1 cup 2% milk',
      '1 cup strawberries, frozen',
      '1 banana',
      '1 scoop vanilla protein powder',
      '1 tablespoon peanut butter',
    ],
    [
      'Put everything in the blender with a little ice.',
      'Blend until completely smooth, about 45 seconds.',
    ],
  ),
]

export const SEED_RECIPE_BY_ID = new Map(SEED_RECIPES.map((r) => [r.id, r]))
