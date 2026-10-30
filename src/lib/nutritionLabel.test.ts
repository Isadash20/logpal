import { describe, expect, it } from 'vitest'
import { parseNutritionLabel } from './nutritionLabel'

const US = `Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
% Daily Value*
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat Og
Cholesterol Omg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g
Vitamin D 2mcg 10%
Calcium 260mg 20%
Iron 8mg 45%
Potassium 240mg 6%
* The % Daily Value (DV) tells you how much a nutrient in a serving of food
contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.`

const EU = `NUTRITION INFORMATION
Typical values per 100g
Energy 1046kJ / 250kcal
Fat 12,5g
of which saturates 3.1g
Carbohydrate 30g
of which sugars 5.2g
Fibre 2g
Protein 8g
Salt 1.2g`

/* What the bundled engine actually printed for a blurred, slightly tilted
   capture of the FDA sample label: g read as 9 and ¢, I as l, the footnote
   with its 2,000 calories, a stray "So". */
const OCR = `=    =
Nutrition Facts
8 servings per container
Serving size     2/3 cup (55g)
Amount per serving
Calories              230
% Daily Value*
Total Fat 89                          10%
Saturated Fat 19                       5%
Trans Fat 0g
Cholesterol 0mg                      0%
Sodium160mg—st—t=~S
Total Carbohydrate 37¢           13%
Dietary Fiber 4g                          14%
_TotalSugars129.2=~*~<CS
Includes 10g Added Sugars      20%
| Protein 39                             |
So
Vitamin D 2mcg                           10%
Calcium 200mg                               15%
lron 8mg                                       45%
Potassium 235mg                           6%
a serving of food contributes to a daily diet. 2,000 calories
a day is used for general nutrition advice.`

describe('parseNutritionLabel', () => {
  it('reads real OCR output, with its 9s for gs', () => {
    const r = parseNutritionLabel(OCR)
    expect(r.values).toMatchObject({
      calories: 230,
      fat: 8,
      satFat: 1,
      transFat: 0,
      cholesterol: 0,
      sodium: 160,
      carbs: 37,
      fiber: 4,
      sugar: 12,
      protein: 3,
      calcium: 15,
      iron: 45,
      potassium: 235,
    })
    expect(r.servingGrams).toBe(55)
    expect(r.servingLabel).toBe('2/3 cup')
  })

  it('reads a serving weight whose g came out as 9', () => {
    const r = parseNutritionLabel('Serving Size 2/3 cup (559)\nCalories 230')
    expect(r.servingGrams).toBe(55)
    expect(r.servingLabel).toBe('2/3 cup')
  })

  it('reads a US panel, including OCR zeros written as O', () => {
    const r = parseNutritionLabel(US)
    expect(r.values).toMatchObject({
      calories: 230,
      fat: 8,
      satFat: 1,
      transFat: 0,
      cholesterol: 0,
      sodium: 160,
      carbs: 37,
      fiber: 4,
      sugar: 12,
      protein: 3,
      calcium: 20,
      iron: 45,
      potassium: 240,
    })
    expect(r.servingLabel).toBe('2/3 cup')
    expect(r.servingGrams).toBe(55)
    expect(r.per100g).toBe(false)
  })

  it('does not mistake the 2,000-calorie footnote for the calories', () => {
    const r = parseNutritionLabel(US.replace('Calories 230\n', ''))
    expect(r.values.calories).toBeUndefined()
  })

  it('takes total sugars over added sugars', () => {
    expect(parseNutritionLabel(US).values.sugar).toBe(12)
  })

  it('reads a European per-100g table with kcal, saturates and salt', () => {
    const r = parseNutritionLabel(EU)
    expect(r.values).toMatchObject({
      calories: 250,
      fat: 12.5,
      satFat: 3.1,
      carbs: 30,
      sugar: 5.2,
      fiber: 2,
      protein: 8,
      sodium: 480,
    })
    expect(r.per100g).toBe(true)
    expect(r.servingLabel).toBe('100 g')
    expect(r.servingGrams).toBe(100)
  })

  it('drops figures that are impossible for their unit', () => {
    const r = parseNutritionLabel('Protein 9999g\nSodium 12g')
    expect(r.values.protein).toBeUndefined()
    expect(r.values.sodium).toBe(12)
  })

  it('counts what it found so the screen can tell a failed photo', () => {
    expect(parseNutritionLabel('lorem ipsum').found).toBe(0)
    expect(parseNutritionLabel(US).found).toBeGreaterThan(8)
  })

  it('survives a serving size with no weight', () => {
    const r = parseNutritionLabel('Serving size 1 cup (240mL)\nCalories 120')
    expect(r.servingLabel).toBe('1 cup')
    expect(r.servingGrams).toBeUndefined()
  })
})
