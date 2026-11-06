import { describe, expect, it } from 'vitest'
import type { Nutrients, Recipe } from '../types'
import { foodTokens, rankIdeas, type IdeaCandidate, type IdeaContext } from './mealIdeas'

function n(p: Partial<Nutrients>): Nutrients {
  const z = {
    calories: 0, carbs: 0, fat: 0, protein: 0, satFat: 0, polyFat: 0, monoFat: 0, transFat: 0,
    cholesterol: 0, sodium: 0, potassium: 0, fiber: 0, sugar: 0,
  } as unknown as Nutrients
  return { ...z, ...p }
}
function recipe(id: string, name: string, tags: string[] = ['Main dish'], ingredients: string[] = []): Recipe {
  return { id, name, servingsMade: 1, items: [], createdAt: 0, tags, ingredients } as Recipe
}
function cand(id: string, name: string, p: Partial<Nutrients>, health = 6, tags?: string[], ingredients?: string[]): IdeaCandidate {
  return { recipe: recipe(id, name, tags, ingredients), n: n(p), health }
}
const base: IdeaContext = {
  caloriesLeft: 1200, calorieGoal: 2000, proteinLeft: 80, proteinTarget: 150, carbsLeft: 100, fatLeft: 40,
  goalKind: 'maintain', sex: 'male', age: 30, recentNames: [], todayNames: [], hour: 18, seed: 20261105,
}

describe('rankIdeas', () => {
  it('drops dishes over the room and tiny ones', () => {
    const out = rankIdeas([cand('a', 'Big', { calories: 1500, protein: 60 }), cand('b', 'Snack', { calories: 120, protein: 5 }), cand('c', 'Fine', { calories: 500, protein: 30 })], base)
    expect(out.map((i) => i.recipe.id)).toEqual(['c'])
  })

  it('ranks protein-dense dishes higher when protein is behind', () => {
    const lean = cand('lean', 'Chicken bowl', { calories: 500, protein: 50 })
    const carby = cand('carby', 'Pasta', { calories: 500, protein: 12, carbs: 90 })
    const out = rankIdeas([carby, lean], { ...base, proteinLeft: 120 })
    expect(out[0].recipe.id).toBe('lean')
  })

  it('losing weight prefers the lighter, fibre-rich plate', () => {
    const light = cand('light', 'Veg soup', { calories: 320, protein: 20, fiber: 10 })
    const heavy = cand('heavy', 'Creamy pasta', { calories: 700, protein: 22, sugar: 20 })
    const out = rankIdeas([heavy, light], { ...base, goalKind: 'lose-weight', proteinLeft: 20 })
    expect(out[0].recipe.id).toBe('light')
  })

  it('gaining muscle is happy to use the room', () => {
    const light = cand('light', 'Veg soup', { calories: 320, protein: 25 })
    const full = cand('full', 'Steak and rice', { calories: 700, protein: 55 })
    const out = rankIdeas([light, full], { ...base, goalKind: 'gain-muscle' })
    expect(out[0].recipe.id).toBe('full')
  })

  it('marks down what was eaten today and lifts what is familiar', () => {
    const salmon = cand('s', 'Salmon with rice', { calories: 500, protein: 35 })
    const tacos = cand('t', 'Chicken tacos', { calories: 500, protein: 35 })
    const out = rankIdeas([salmon, tacos], { ...base, todayNames: ['Salmon fillet'], recentNames: ['Chicken breast', 'Tortillas'] })
    expect(out[0].recipe.id).toBe('t')
  })

  it('counts breakfasts in the morning only', () => {
    const eggs = cand('e', 'Eggs on toast', { calories: 400, protein: 25 }, 6, ['Breakfast'])
    const curry = cand('c', 'Curry', { calories: 450, protein: 25 }, 6, ['Main dish'])
    expect(rankIdeas([eggs, curry], { ...base, hour: 8 })[0].recipe.id).toBe('e')
    expect(rankIdeas([eggs, curry], { ...base, hour: 19 }).map((i) => i.recipe.id)).toEqual(['c'])
  })

  it('tokenises names down to the words that matter', () => {
    expect(foodTokens('2 cups chopped tomatoes with salt')).toEqual(['tomato'])
  })
})
