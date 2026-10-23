import { describe, expect, it } from 'vitest'
import { foodKind } from './foodIcon'

describe('foodKind', () => {
  it('reads the obvious groups off the name', () => {
    expect(foodKind('Banana')).toBe('fruit')
    expect(foodKind('Strawberries')).toBe('fruit')
    expect(foodKind('Blueberries, frozen')).toBe('fruit')
    expect(foodKind('Broccoli, steamed')).toBe('veg')
    expect(foodKind('Whole wheat bread')).toBe('grain')
    expect(foodKind('Chicken breast, grilled')).toBe('meat')
    expect(foodKind('Atlantic salmon')).toBe('seafood')
    expect(foodKind('Greek yogurt, plain')).toBe('dairy')
    expect(foodKind('Egg, large')).toBe('egg')
    expect(foodKind('Almonds, raw')).toBe('nut')
    expect(foodKind('Oreo cookies')).toBe('sweet')
    expect(foodKind('Latte, oat milk')).toBe('drink')
  })

  it('lets a dish win over its ingredients', () => {
    expect(foodKind('Chicken caesar salad')).toBe('meal')
    expect(foodKind('Beef burrito bowl')).toBe('meal')
    expect(foodKind('Cheeseburger')).toBe('fast')
  })

  it('uses the brand when the name is bare', () => {
    expect(foodKind('Big Mac', "McDonald's")).toBe('fast')
    expect(foodKind('Original', 'Coca-Cola cola')).toBe('drink')
  })

  it('takes the ingredient named first', () => {
    expect(foodKind('Oatmeal with blueberries')).toBe('grain')
    expect(foodKind('Chicken and rice')).toBe('meat')
    expect(foodKind('Rice with chicken')).toBe('grain')
  })

  it('falls back rather than guessing', () => {
    expect(foodKind('Xylitol')).toBe('other')
  })
})
