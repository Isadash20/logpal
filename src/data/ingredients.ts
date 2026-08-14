/**
 * The ingredient vocabulary for searching by what you have.
 *
 * The first version of this derived its chips from the catalogue, by taking the
 * last word of every ingredient line and counting them. That is why it offered
 * "oil", "powder", "juice" and "sauce" — those really are the commonest final
 * words, and every one of them is useless to tap. Nobody opens a recipe app
 * wondering what they can make with sauce.
 *
 * This is written instead, and grouped, so the picker reads like a shop rather
 * than a word-frequency table. Terms are matched as substrings against a
 * recipe's ingredient lines, so "chicken" catches "boneless skinless chicken
 * breasts" and the more specific "chicken breast" narrows it further — both are
 * offered, because both are things people actually search for.
 */

export interface IngredientGroup {
  label: string
  items: string[]
}

export const INGREDIENT_GROUPS: IngredientGroup[] = [
  {
    label: 'Meat and poultry',
    items: [
      'chicken', 'chicken breast', 'chicken thighs', 'ground chicken',
      'beef', 'ground beef', 'steak', 'roast beef', 'brisket',
      'pork', 'pork chops', 'ground pork', 'bacon', 'ham', 'sausage',
      'turkey', 'ground turkey', 'lamb', 'venison', 'chorizo',
    ],
  },
  {
    label: 'Fish and seafood',
    items: [
      'salmon', 'tuna', 'cod', 'tilapia', 'catfish', 'haddock', 'pollock',
      'trout', 'sardines', 'anchovies', 'mackerel',
      'shrimp', 'crab', 'lobster', 'clams', 'mussels', 'scallops',
    ],
  },
  {
    label: 'Vegetables',
    items: [
      'onion', 'garlic', 'tomato', 'potato', 'sweet potato', 'carrot',
      'celery', 'bell pepper', 'broccoli', 'cauliflower', 'spinach', 'kale',
      'lettuce', 'cabbage', 'cucumber', 'zucchini', 'squash', 'mushroom',
      'green beans', 'peas', 'corn', 'asparagus', 'beets', 'eggplant',
      'pumpkin', 'okra', 'leek', 'scallion', 'jalapeño', 'chili pepper',
    ],
  },
  {
    label: 'Fruit',
    items: [
      'apple', 'banana', 'orange', 'lemon', 'lime', 'grapefruit',
      'strawberries', 'blueberries', 'raspberries', 'cranberries',
      'grapes', 'peach', 'pear', 'plum', 'pineapple', 'mango', 'melon',
      'watermelon', 'avocado', 'raisins', 'dates', 'coconut',
    ],
  },
  {
    label: 'Dairy and eggs',
    items: [
      'eggs', 'milk', 'butter', 'cheese', 'cheddar', 'mozzarella',
      'parmesan', 'feta', 'cream cheese', 'cottage cheese', 'ricotta',
      'yogurt', 'greek yogurt', 'sour cream', 'heavy cream', 'buttermilk',
    ],
  },
  {
    label: 'Grains and pasta',
    items: [
      'rice', 'brown rice', 'pasta', 'spaghetti', 'macaroni', 'noodles',
      'bread', 'tortilla', 'oats', 'oatmeal', 'quinoa', 'barley',
      'couscous', 'cornmeal', 'flour', 'breadcrumbs', 'cereal', 'crackers',
    ],
  },
  {
    label: 'Beans, nuts and soy',
    items: [
      'black beans', 'kidney beans', 'pinto beans', 'white beans',
      'chickpeas', 'lentils', 'split peas', 'refried beans',
      'peanut butter', 'peanuts', 'almonds', 'walnuts', 'pecans', 'cashews',
      'sunflower seeds', 'sesame', 'tofu', 'edamame',
    ],
  },
  {
    label: 'Pantry and seasoning',
    items: [
      'olive oil', 'vegetable oil', 'vinegar', 'soy sauce', 'tomato sauce',
      'salsa', 'ketchup', 'mustard', 'mayonnaise', 'honey', 'maple syrup',
      'sugar', 'brown sugar', 'salt', 'black pepper', 'cinnamon', 'cumin',
      'paprika', 'chili powder', 'garlic powder', 'oregano', 'basil',
      'parsley', 'cilantro', 'ginger', 'vanilla', 'baking powder',
      'chicken broth', 'vegetable broth',
    ],
  },
]

/** Everything, flat — for matching and for counting how many there are. */
export const ALL_INGREDIENTS: string[] = INGREDIENT_GROUPS.flatMap((g) => g.items)

/**
 * A short list for the search field's own suggestions.
 *
 * Two from each group rather than the first dozen alphabetically, so the strip
 * under the search box spans the shop instead of stopping at poultry.
 */
export const STARTER_INGREDIENTS: string[] = INGREDIENT_GROUPS.flatMap((g) =>
  g.items.slice(0, 2),
)
