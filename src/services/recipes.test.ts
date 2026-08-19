import { describe, expect, it } from 'vitest'
import { searchRecipes } from './recipes'
import type { Recipe } from '../types'

/* Search is AND across the board: every word typed and every ingredient chip
   has to be satisfied. It was OR for ingredients once, and a second chip
   widening the results is what this locks out. */

const recipe = (name: string, ingredients: string[], description = ''): Recipe =>
  ({ id: name, name, description, ingredients, steps: [], servings: 2, tags: [] }) as unknown as Recipe

const RECIPES = [
  recipe('Baked Cod', ['1 lb cod fillets', '1 lemon, sliced', 'olive oil']),
  recipe('Lemon Chicken', ['2 chicken breasts', '1 lemon']),
  recipe('Cod Chowder', ['1 lb cod fillets', 'potatoes', 'milk']),
  recipe('Skillet Catfish', ['catfish fillets', 'cornmeal', 'lemon wedges'], 'Try substituting cod.'),
]

const names = (rs: Recipe[]) => rs.map((r) => r.name).sort()

describe('searchRecipes', () => {
  it('requires every word in the query, not the phrase', () => {
    expect(names(searchRecipes(RECIPES, 'cod lemon'))).toEqual(['Baked Cod', 'Skillet Catfish'])
  })

  it('still matches a single word', () => {
    expect(names(searchRecipes(RECIPES, 'cod'))).toEqual(['Baked Cod', 'Cod Chowder', 'Skillet Catfish'])
  })

  it('drops a recipe that answers only one of the words', () => {
    expect(names(searchRecipes(RECIPES, 'cod chicken'))).toEqual([])
  })

  it('narrows as ingredients are added, never widens', () => {
    const one = searchRecipes(RECIPES, '', { ingredients: ['cod'] })
    const two = searchRecipes(RECIPES, '', { ingredients: ['cod', 'lemon'] })
    expect(names(one)).toEqual(['Baked Cod', 'Cod Chowder'])
    expect(names(two)).toEqual(['Baked Cod'])
    expect(two.length).toBeLessThanOrEqual(one.length)
  })

  it('excludes on a single hit, even when the wanted ingredients match', () => {
    const out = searchRecipes(RECIPES, '', { ingredients: ['cod'], exclude: ['lemon'] })
    expect(names(out)).toEqual(['Cod Chowder'])
  })
})
