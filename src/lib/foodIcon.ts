import type { IconName } from '../components/Icon'

/**
 * Which picture a food gets.
 *
 * The food database has no images and never will, so a row is a name and a
 * number, and a list of forty of them reads as a spreadsheet. Every tracker
 * that feels alive puts a small picture beside each food: MacroFactor draws a
 * pictogram per food, Cal AI and Lifesum use photos. A pictogram per food
 * *group* is what is possible here, and it is enough: the eye finds "the
 * yogurt" by the dairy mark before it reads the words.
 *
 * Decided from the name alone, in priority order, because a name can match
 * several lists ("chicken caesar salad" is a meal before it is a vegetable)
 * and the earlier rule is the one that wins.
 */
export type FoodKind =
  | 'drink'
  | 'sweet'
  | 'fast'
  | 'meal'
  | 'seafood'
  | 'meat'
  | 'egg'
  | 'dairy'
  | 'fruit'
  | 'veg'
  | 'grain'
  | 'nut'
  | 'sauce'
  | 'other'

export const FOOD_KIND_ICON: Record<FoodKind, IconName> = {
  drink: 'cup',
  sweet: 'cookie',
  fast: 'burger',
  meal: 'bowl',
  seafood: 'fish',
  meat: 'drumstick',
  egg: 'egg',
  dairy: 'cheese',
  fruit: 'apple',
  veg: 'leaf',
  grain: 'bread',
  nut: 'bean',
  sauce: 'bottle',
  other: 'bowl',
}

/** Each group's own colour, used as a tint behind the mark. */
export const FOOD_KIND_COLOR: Record<FoodKind, string> = {
  drink: '#0ea5e9',
  sweet: '#ec4899',
  fast: '#ef4444',
  meal: '#5b5bd6',
  seafood: '#0891b2',
  meat: '#c2410c',
  egg: '#f59e0b',
  dairy: '#eab308',
  fruit: '#e5533d',
  veg: '#16a34a',
  grain: '#d97706',
  nut: '#a16207',
  sauce: '#64748b',
  other: '#6b6b7b',
}

const RULES: [FoodKind, RegExp][] = [
  [
    'drink',
    /\b(coffee|latte|cappuccino|espresso|americano|mocha|tea|juice|soda|cola|pepsi|sprite|lemonade|smoothie|shake|water|beer|wine|cider|kombucha|energy drink|gatorade|powerade|sparkling)\b/,
  ],
  [
    'sweet',
    /\b(chocolate|cookie|cookies|cake|candy|candies|ice cream|gelato|donut|doughnut|brownie|pie|muffin|cupcake|pastry|croissant|pudding|custard|fudge|caramel|toffee|dessert|sorbet|popsicle|marshmallow|gummy|gummies|licorice|sweets|wafer|oreo|twix|snickers|kitkat|m&m)\b/,
  ],
  [
    'fast',
    /\b(burger|cheeseburger|hamburger|fries|pizza|hot dog|hotdog|nuggets|chicken sandwich|whopper|big mac|mcnugget|taco bell|chipotle|wendy|mcdonald|burger king|subway|domino|kfc)\b/,
  ],
  [
    'meal',
    /\b(salad|soup|stew|chili|curry|stir.?fry|casserole|lasagna|lasagne|burrito|bowl|wrap|sandwich|taco|tacos|quesadilla|sushi|ramen|pho|pad thai|risotto|paella|enchilada|fajita|kebab|gyro|pasta bake|mac and cheese|macaroni|dumpling|omelette|omelet|frittata|chowder|goulash|jambalaya|bibimbap|poke)\b/,
  ],
  [
    'seafood',
    /\b(salmon|tuna|shrimp|prawn|prawns|cod|haddock|tilapia|trout|sardine|sardines|mackerel|anchovy|anchovies|crab|lobster|scallop|scallops|clam|clams|mussel|mussels|oyster|oysters|halibut|fish|seafood|calamari|squid|octopus)\b/,
  ],
  [
    'meat',
    /\b(chicken|turkey|beef|steak|pork|lamb|bacon|sausage|sausages|ham|salami|pepperoni|prosciutto|jerky|mince|ground|brisket|ribs|meatball|meatballs|burger patty|veal|duck|venison|chorizo|hot dog|tofu|tempeh|seitan|protein bar|protein powder|whey|casein)\b/,
  ],
  ['egg', /\b(egg|eggs|egg white|egg whites|scrambled|boiled egg|fried egg)\b/],
  [
    'dairy',
    /\b(milk|cheese|cheddar|mozzarella|parmesan|feta|brie|gouda|swiss|yogurt|yoghurt|butter|cream|kefir|cottage|ricotta|sour cream|whipped|ghee|paneer|halloumi)\b/,
  ],
  [
    'fruit',
    /\b(apple|apples|banana|bananas|berry|berries|strawberry|strawberries|blueberry|blueberries|raspberry|raspberries|blackberry|blackberries|orange|oranges|grape|grapes|melon|watermelon|cantaloupe|mango|peach|pear|pears|cherry|cherries|pineapple|kiwi|plum|plums|apricot|nectarine|fig|figs|date|dates|pomegranate|papaya|guava|lime|lemon|clementine|tangerine|mandarin|grapefruit|fruit|avocado|coconut|raisin|raisins|cranberry|cranberries)\b/,
  ],
  [
    'veg',
    /\b(lettuce|spinach|kale|broccoli|cauliflower|carrot|carrots|tomato|tomatoes|onion|onions|pepper|peppers|cucumber|celery|zucchini|courgette|squash|pumpkin|eggplant|aubergine|cabbage|sprouts|asparagus|mushroom|mushrooms|potato|potatoes|sweet potato|corn|peas|green bean|beans|beet|beets|radish|leek|garlic|greens|vegetable|vegetables|veggie|arugula|rocket|chard|okra|artichoke|edamame|olive|olives|pickle|pickles|salsa)\b/,
  ],
  [
    'grain',
    /\b(bread|toast|bagel|roll|rolls|bun|buns|rice|pasta|spaghetti|penne|noodle|noodles|oat|oats|oatmeal|porridge|cereal|granola|muesli|tortilla|cracker|crackers|pancake|pancakes|waffle|waffles|quinoa|couscous|barley|bulgur|farro|pita|naan|flatbread|biscuit|wheat|flour|grits|polenta|pretzel|pretzels|chips|crisps|popcorn|rice cake)\b/,
  ],
  [
    'nut',
    /\b(almond|almonds|peanut|peanuts|cashew|cashews|walnut|walnuts|pistachio|pistachios|pecan|pecans|hazelnut|hazelnuts|macadamia|nut|nuts|seed|seeds|chia|flax|lentil|lentils|chickpea|chickpeas|hummus|bean|beans|tahini|trail mix)\b/,
  ],
  [
    'sauce',
    /\b(sauce|ketchup|mustard|mayo|mayonnaise|dressing|vinaigrette|oil|vinegar|syrup|honey|jam|jelly|spread|dip|gravy|relish|pesto|soy sauce|sriracha|hot sauce|seasoning|salt|sugar|spice)\b/,
  ],
]

/** The dish groups: a name that is one of these is that, whatever is in it. */
const DISHES: FoodKind[] = ['drink', 'sweet', 'fast', 'meal']

export function foodKind(name: string, brand?: string): FoodKind {
  const t = `${name} ${brand ?? ''}`.toLowerCase()
  for (const [kind, re] of RULES) {
    if (DISHES.includes(kind) && re.test(t)) return kind
  }
  /* Among the ingredient groups, the one named first wins: "oatmeal with
     blueberries" is oatmeal, "blueberry oatmeal" is still oatmeal to most
     people but at least the rule is predictable. Ties go to list order. */
  let best: FoodKind = 'other'
  let bestAt = Infinity
  for (const [kind, re] of RULES) {
    if (DISHES.includes(kind)) continue
    const at = t.search(re)
    if (at >= 0 && at < bestAt) {
      best = kind
      bestAt = at
    }
  }
  return best
}
