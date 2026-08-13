/**
 * Which part of a shop an ingredient lives in.
 *
 * A shopping list sorted alphabetically sends you back and forth across the
 * store; sorted by aisle you walk it once. Samsung Food groups its list exactly
 * this way ("Bread and bakery", "Dairy and eggs", "Fruits and vegetables") and
 * it is the single thing that makes a generated list usable in practice.
 *
 * Keyword matching rather than a lookup table of every food: the list is built
 * from free text an ingredient parser produced, so it has to cope with
 * "boneless skinless chicken breasts" as readily as "chicken".
 */

export const AISLES = [
  'Fruits and vegetables',
  'Meat and seafood',
  'Dairy and eggs',
  'Bread and bakery',
  'Pantry',
  'Frozen',
  'Drinks',
  'Other',
] as const

export type Aisle = (typeof AISLES)[number]

/** Checked in order, so a more specific aisle can claim a word first. */
const RULES: [Aisle, string[]][] = [
  ['Meat and seafood', [
    'chicken', 'beef', 'steak', 'pork', 'bacon', 'sausage', 'turkey', 'lamb',
    'mince', 'ham', 'salmon', 'tuna', 'shrimp', 'prawn', 'cod', 'fish',
    'tilapia', 'anchovy', 'scallop', 'crab', 'lobster', 'chorizo', 'prosciutto',
  ]],
  ['Dairy and eggs', [
    'milk', 'cream', 'butter', 'cheese', 'yogurt', 'yoghurt', 'egg', 'ghee',
    'mozzarella', 'parmesan', 'cheddar', 'feta', 'ricotta', 'mascarpone',
    'buttermilk', 'creme fraiche',
  ]],
  ['Bread and bakery', [
    'bread', 'tortilla', 'bun', 'roll', 'bagel', 'pita', 'naan', 'baguette',
    'croissant', 'muffin', 'brioche', 'wrap', 'crumpet', 'sourdough',
  ]],
  ['Frozen', ['frozen', 'ice cream', 'ice cubes', 'peas frozen']],
  ['Drinks', ['juice', 'soda', 'coffee', 'tea', 'wine', 'beer', 'stock', 'broth', 'water']],
  ['Fruits and vegetables', [
    'apple', 'banana', 'orange', 'lemon', 'lime', 'berry', 'berries',
    'strawberr', 'blueberr', 'raspberr', 'grape', 'melon', 'peach', 'pear',
    'mango', 'pineapple', 'avocado', 'tomato', 'potato', 'onion', 'garlic',
    'carrot', 'celery', 'pepper', 'broccoli', 'spinach', 'kale', 'lettuce',
    'cucumber', 'courgette', 'zucchini', 'aubergine', 'eggplant', 'mushroom',
    'cabbage', 'cauliflower', 'bean sprout', 'ginger', 'chilli', 'chili pepper',
    'cilantro', 'coriander', 'parsley', 'basil', 'mint', 'thyme', 'rosemary',
    'scallion', 'spring onion', 'leek', 'squash', 'sweet potato', 'corn',
    'asparagus', 'green bean', 'pea', 'salad',
  ]],
  ['Pantry', [
    'flour', 'sugar', 'salt', 'oil', 'vinegar', 'rice', 'pasta', 'noodle',
    'oat', 'lentil', 'chickpea', 'bean', 'quinoa', 'couscous', 'sauce',
    'ketchup', 'mustard', 'mayonnaise', 'honey', 'syrup', 'spice', 'cumin',
    'paprika', 'cinnamon', 'curry', 'stock cube', 'tin', 'canned', 'peanut',
    'almond', 'walnut', 'cashew', 'seed', 'baking powder', 'baking soda',
    'yeast', 'vanilla', 'cocoa', 'chocolate', 'protein powder', 'soy',
    'sesame', 'tahini', 'coconut', 'breadcrumb', 'stuffing', 'gravy',
  ]],
]

export function aisleFor(name: string): Aisle {
  const n = name.toLowerCase()
  for (const [aisle, words] of RULES) {
    for (const w of words) {
      if (n.includes(w)) return aisle
    }
  }
  return 'Other'
}

/** Aisle order for rendering, so the list always reads in the same sequence. */
export function sortAisles(a: string, b: string): number {
  return AISLES.indexOf(a as Aisle) - AISLES.indexOf(b as Aisle)
}
