import { describe, expect, it } from 'vitest'
import { formatAmount, formatQuantity, parseIngredient } from './ingredients'

/**
 * Every line below is copied verbatim from a real recipe — the Samsung Food and
 * MyFitnessPal screens this feature was modelled on. Made-up test data would
 * have been kinder to the parser and would have proved nothing: the awkward
 * cases here (`1 ¼ cups`, a bare `Cooking spray`, `1 lb boneless, skinless,
 * chicken breast, cut in half lengthwise`) are exactly the ones that decide
 * whether a recipe's calorie total is right.
 */

describe('parseIngredient', () => {
  const cases: {
    line: string
    qty: number | null
    unit: string | null
    name: string
    note?: string | null
  }[] = [
    // Samsung Food — Chick-fil-A Chicken Nuggets
    { line: '1 egg', qty: 1, unit: null, name: 'egg' },
    { line: '1 cup milk', qty: 1, unit: 'cup', name: 'milk' },
    {
      line: '1 pound boneless skinless chicken breasts',
      qty: 1, unit: 'lb', name: 'boneless skinless chicken breasts',
    },
    { line: '1 ¼ cups all-purpose flour', qty: 1.25, unit: 'cup', name: 'all-purpose flour' },
    { line: '2 tablespoons powdered sugar', qty: 2, unit: 'tbsp', name: 'powdered sugar' },
    { line: '2 teaspoons salt', qty: 2, unit: 'tsp', name: 'salt' },
    { line: '1 teaspoon ground black pepper', qty: 1, unit: 'tsp', name: 'ground black pepper' },
    { line: '½ teaspoon chili powder', qty: 0.5, unit: 'tsp', name: 'chili powder' },
    { line: '½ cup mayonnaise', qty: 0.5, unit: 'cup', name: 'mayonnaise' },
    { line: '1 tablespoon barbecue sauce', qty: 1, unit: 'tbsp', name: 'barbecue sauce' },

    // Samsung Food — Ranch Chicken Wrap
    { line: '2 cups chicken breasts', qty: 2, unit: 'cup', name: 'chicken breasts' },
    { line: '¼ cup ranch dressing', qty: 0.25, unit: 'cup', name: 'ranch dressing' },
    { line: '4 tortillas', qty: 4, unit: null, name: 'tortillas' },
    { line: '1 avocado', qty: 1, unit: null, name: 'avocado' },
    { line: '2 Tbsp lemon juice', qty: 2, unit: 'tbsp', name: 'lemon juice' },

    // MyFitnessPal — Sheet Pan Chicken Teriyaki
    {
      line: '1 lb boneless, skinless, chicken breast, cut in half lengthwise',
      qty: 1, unit: 'lb', name: 'boneless',
      note: 'skinless, chicken breast, cut in half lengthwise',
    },
    { line: '3 cups broccoli floret', qty: 3, unit: 'cup', name: 'broccoli floret' },
    { line: '1 red bell pepper, sliced', qty: 1, unit: null, name: 'red bell pepper', note: 'sliced' },
    { line: '1/4 cup teriyaki sauce', qty: 0.25, unit: 'cup', name: 'teriyaki sauce' },
    {
      line: '4 cups cooked brown rice, for serving',
      qty: 4, unit: 'cup', name: 'cooked brown rice', note: 'for serving',
    },

    // MyFitnessPal — Berry Peanut Butter Smoothie
    { line: '1 cup reduced-fat milk', qty: 1, unit: 'cup', name: 'reduced-fat milk' },
    { line: '2 tbsp smooth natural peanut butter', qty: 2, unit: 'tbsp', name: 'smooth natural peanut butter' },
    {
      line: '1 1/2 cup raspberries, fresh or frozen',
      qty: 1.5, unit: 'cup', name: 'raspberries', note: 'fresh or frozen',
    },
    { line: '2 scoops vanilla protein powder', qty: 2, unit: 'scoop', name: 'vanilla protein powder' },
  ]

  for (const c of cases) {
    it(`parses "${c.line}"`, () => {
      const p = parseIngredient(c.line)
      expect(p.qty).toBeCloseTo(c.qty as number, 5)
      expect(p.unit).toBe(c.unit)
      expect(p.name).toBe(c.name)
      if (c.note !== undefined) expect(p.note).toBe(c.note)
      // The line as written is never lost, whatever the parser made of it.
      expect(p.raw).toBe(c.line)
    })
  }

  it('handles a line with no quantity at all', () => {
    // Common, and must not become "0 of something" — that would silently add a
    // zero-calorie row where the honest answer is "no amount given".
    const p = parseIngredient('Cooking spray')
    expect(p.qty).toBeNull()
    expect(p.unit).toBeNull()
    expect(p.name).toBe('Cooking spray')
  })

  it('keeps "to taste" out of the food name', () => {
    const p = parseIngredient('Salt, to taste')
    expect(p.name).toBe('Salt')
    expect(p.note).toBe('to taste')
  })

  it('treats a parenthesised aside as a note', () => {
    const p = parseIngredient('1 can (14 oz) diced tomatoes')
    expect(p.qty).toBe(1)
    expect(p.unit).toBe('can')
    expect(p.name).toBe('diced tomatoes')
    expect(p.note).toContain('14 oz')
  })

  it('takes the low end of a range', () => {
    // Over-reporting is the worse direction for a calorie tracker.
    expect(parseIngredient('1-2 tablespoons olive oil').qty).toBe(1)
    expect(parseIngredient('2 to 3 cups spinach').qty).toBe(2)
  })

  it('does not mistake a size word for a unit', () => {
    const p = parseIngredient('1 large egg')
    expect(p.unit).toBeNull()
    expect(p.name).toBe('large egg')
  })

  it('strips a trailing preparation word with no comma', () => {
    const p = parseIngredient('2 cups chicken breasts cooked')
    expect(p.name).toBe('chicken breasts')
    expect(p.note).toBe('cooked')
  })
})

describe('formatQuantity', () => {
  it('writes fractions the way a recipe does', () => {
    expect(formatQuantity(0.5)).toBe('½')
    expect(formatQuantity(1.25)).toBe('1 ¼')
    expect(formatQuantity(2)).toBe('2')
    expect(formatQuantity(1 / 3)).toBe('⅓')
  })

  it('survives scaling to an awkward number of servings', () => {
    // 4 servings scaled to 3 is where thirds turn up, and "0.6666666" on a
    // recipe card is the giveaway that nobody tried it.
    expect(formatQuantity(2 / 3)).toBe('⅔')
    expect(formatQuantity(1 + 2 / 3)).toBe('1 ⅔')
  })

  it('falls back to a decimal rather than a wrong fraction', () => {
    expect(formatQuantity(1.1)).toBe('1.1')
  })

  it('renders nothing for a missing amount', () => {
    expect(formatQuantity(0)).toBe('')
  })
})

describe('formatAmount', () => {
  it('pluralises words but not abbreviations', () => {
    expect(formatAmount(2, 'cup')).toBe('2 cups')
    expect(formatAmount(1, 'cup')).toBe('1 cup')
    expect(formatAmount(2, 'tbsp')).toBe('2 tbsp')
    expect(formatAmount(3, 'g')).toBe('3 g')
  })

  it('renders a bare count with no unit', () => {
    expect(formatAmount(2, null)).toBe('2')
  })
})
