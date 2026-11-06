import type { AppData, Profile } from '../types'
import type { IdeaContext } from './mealIdeas'
import { age } from './nutrition'
import { addDays, today } from './dates'

/** The slice of the store the recipe rankers need; Home and Plan both build it. */
export interface IdeaSource {
  data: AppData
  profile: Profile
  latestWeight: number
  macroTargets: { carbs: number; protein: number; fat: number }
  totalsFor(date: string): {
    goal: number
    exerciseCalories: number
    nutrients: { calories: number; protein: number; carbs: number; fat: number }
  }
}

export function ideaContextFor(app: IdeaSource, date = today(), hour = new Date().getHours()): IdeaContext {
  const { data, profile, macroTargets } = app
  const totals = app.totalsFor(date)
  const credit = data.settings.exerciseAddsCalories ? totals.exerciseCalories : 0
  const goal = totals.goal + credit
  const since = addDays(date, -14)
  const recentNames = [...data.foodEntries]
    .filter((e) => e.date >= since && e.date < date)
    .sort((a, b) => b.loggedAt - a.loggedAt)
    .map((e) => e.name)
  return {
    caloriesLeft: goal - totals.nutrients.calories,
    calorieGoal: goal,
    proteinLeft: macroTargets.protein - totals.nutrients.protein,
    proteinTarget: macroTargets.protein,
    carbsLeft: macroTargets.carbs - totals.nutrients.carbs,
    fatLeft: macroTargets.fat - totals.nutrients.fat,
    goalKind: profile.goal.kind,
    sex: profile.sex,
    age: age(profile.birthDate),
    weightLb: app.latestWeight,
    userSeed: Number(profile.birthDate.replace(/-/g, '')) + profile.heightIn,
    recentNames,
    todayNames: data.foodEntries.filter((e) => e.date === date).map((e) => e.name),
    hour,
    seed: Number(date.replace(/-/g, '')),
  }
}
