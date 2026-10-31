/**
 * A filled-in diary for screenshots and demos. Development only: `main.tsx`
 * loads this when the page is opened with `?seed=demo`, and Vite strips the
 * import from production builds.
 *
 * It writes straight to localStorage and reloads, so the app starts as if a
 * person had been using it for a fortnight: a week of weigh-ins, today's
 * meals, water, steps, sleep, a workout and a fast in progress. Every food
 * comes from the bundled database through the same search the app uses, so
 * the nutrition figures are the real ones.
 */
import { searchLocal } from '../services/foodSearch'
import { scaleNutrients } from '../lib/nutrition'
import { defaultData } from '../lib/storage'
import type { AppData, FoodEntry, MealKey } from '../types'

const KEY = 'logpal.v1'

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

let seq = 0
function entry(date: string, meal: MealKey, query: string, servings: number, hour: number): FoodEntry | null {
  const food = searchLocal(query, [], 1)[0]
  if (!food) return null
  const serving = food.servings[0]
  const at = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime()
  return {
    id: `demo-${++seq}`,
    date,
    meal,
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    servingLabel: serving.label,
    servings,
    nutrients: scaleNutrients(food.nutrients, serving.multiplier * servings),
    source: food.source,
    loggedAt: at,
  }
}

export function seedDemo(): void {
  const d: AppData = defaultData()
  const today = isoDaysAgo(0)

  d.profile.onboarded = true
  d.profile.name = 'Sam'
  d.profile.firstName = 'Sam'
  d.profile.startWeight = 172
  d.profile.currentWeight = 165.4
  d.profile.goalWeight = 160

  const menu: [MealKey, string, number, number][] = [
    ['morning', 'oatmeal', 1, 8],
    ['morning', 'banana', 1, 8],
    ['morning', 'greek yogurt', 1, 8],
    ['afternoon', 'chicken breast', 1.5, 13],
    ['afternoon', 'brown rice', 1, 13],
    ['afternoon', 'broccoli', 1, 13],
    ['evening', 'salmon', 1, 19],
    ['evening', 'sweet potato', 1, 19],
    ['late', 'almonds', 1, 16],
  ]
  for (let back = 0; back < 10; back++) {
    const date = isoDaysAgo(back)
    /* Today stops after lunch and a snack, so the ring has room left. */
    const rows = back === 0 ? menu.filter(([m]) => m !== 'evening') : menu
    for (const [meal, q, n, hour] of rows) {
      const e = entry(date, meal, q, n, hour)
      if (e) d.foodEntries.push(e)
    }
    d.days[date] = {
      water: back === 0 ? 1500 : 2000 + (back % 3) * 250,
      completed: back !== 0,
      steps: back === 0 ? 6840 : 7000 + ((back * 1237) % 4000),
      sleepMin: 400 + ((back * 37) % 90),
    }
    if (back % 2 === 0) {
      d.exerciseEntries.push({
        id: `demo-ex-${back}`,
        date,
        kind: 'cardio',
        name: back % 4 === 0 ? 'Running' : 'Cycling',
        minutes: 30 + (back % 3) * 10,
        caloriesBurned: 280 + (back % 3) * 60,
        loggedAt: new Date(`${date}T07:00:00`).getTime(),
      })
    }
  }

  for (let back = 13; back >= 0; back--) {
    d.weights.push({ date: isoDaysAgo(back), weight: Math.round((172 - (13 - back) * 0.5 + ((back * 7) % 3) * 0.2) * 10) / 10 })
  }

  d.fasting = { ...d.fasting, enabled: true, protocol: '16:8' }
  d.fasts.push({
    id: 'demo-fast',
    startedAt: Date.now() - 11 * 60 * 60 * 1000,
    targetHours: 16,
    protocol: '16:8',
  })

  d.recentFoodIds = d.foodEntries.slice(0, 8).map((e) => e.foodId)

  localStorage.setItem(KEY, JSON.stringify(d))
  localStorage.setItem('logpal.localOnly', '1')
}
