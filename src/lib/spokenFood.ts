/**
 * Turning a typed sentence into quantity and food pairs.
 *
 * Written for the voice logger, which has been removed. It stays because the
 * meal-scan screen leans on it: the description someone types under a
 * photograph is the same shape of sentence, and it is parsed the same way.
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25,
}

export interface ParsedItem {
  qty: number
  query: string
}

/**
 * Split a spoken sentence into quantity + food pairs.
 *
 * "two eggs and a cup of oatmeal with coffee" →
 *   [{qty:2, query:"eggs"}, {qty:1, query:"oatmeal"}, {qty:1, query:"coffee"}]
 *
 * Deliberately shallow: it splits on conjunctions, pulls a leading number, and
 * drops filler words. Anything it gets wrong is visible and editable before
 * anything is logged.
 */
/** Words that describe a portion rather than a food. */
const MEASURE_WORDS = new Set([
  'of', 'a', 'an', 'the', 'some', 'my', 'serving', 'servings', 'portion',
  'cup', 'cups', 'glass', 'glasses', 'bowl', 'bowls', 'plate', 'plates',
  'slice', 'slices', 'piece', 'pieces', 'scoop', 'scoops', 'handful',
  'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons',
  'oz', 'ounce', 'ounces', 'gram', 'grams', 'g', 'ml', 'can', 'bottle',
])

/** Size adjectives, stripped here so they never reach the search query. */
const SIZE_WORDS = new Set([
  'huge', 'massive', 'extra', 'xl', 'large', 'big', 'generous',
  'medium', 'regular', 'normal', 'small', 'little', 'light', 'tiny',
])

export function parseSpokenFood(text: string): ParsedItem[] {
  // Commas are separators, so they must survive until after the split.
  const cleaned = text
    .toLowerCase()
    .replace(/[.!?]/g, '')
    .replace(/\bi (had|ate|drank|have)\b/g, '')
    .replace(/\bfor (breakfast|lunch|dinner|a snack)\b/g, '')

  return cleaned
    .split(/\band\b|\bwith\b|\bplus\b|,/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const words = chunk.split(/\s+/).filter(Boolean)
      let qty = 1
      if (words.length && (NUMBER_WORDS[words[0]] !== undefined || parseFloat(words[0]))) {
        qty = NUMBER_WORDS[words[0]] ?? parseFloat(words[0])
        words.shift()
      }
      // Strip measure and size words wherever they sit, not just in front,
      // "small bowl of oatmeal" has to reduce to "oatmeal".
      const kept = words.filter((w) => !MEASURE_WORDS.has(w) && !SIZE_WORDS.has(w))
      return { qty: qty || 1, query: kept.join(' ').trim() }
    })
    .filter((x) => x.query.length > 1)
}

