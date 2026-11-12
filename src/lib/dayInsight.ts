import type { MealKey } from '../types'

/**
 * One sentence about today, from today's own numbers.
 *
 * The trackers people stay with all talk to them: Lifesum opens with "Good
 * morning, two weeks in and you're doing great", MyFitnessPal added a coach.
 * Those are models and copywriters. This is arithmetic with a voice: every
 * sentence here is a rule over figures the app already holds, so it is never
 * wrong about the numbers and never says more than it knows.
 *
 * One rule fires. They are ordered so the most useful thing to hear wins:
 * an empty day over a protein gap, a protein gap over a water reminder, and
 * encouragement last. Short declarative sentences, no exclamation marks, no
 * emoji, nothing that tells anyone what to eat.
 */

export type InsightTone = 'neutral' | 'good' | 'warn'

export interface InsightAction {
  label: string
  kind: 'log' | 'water' | 'recipes' | 'diary'
  meal?: MealKey
}

export interface DayInsight {
  text: string
  tone: InsightTone
  action?: InsightAction
}

export interface DayFacts {
  /** Local hour, 0-23. */
  hour: number
  /** Only today gets a sentence; another day is a record, not a situation. */
  isToday: boolean
  consumed: number
  goal: number
  protein: number
  proteinTarget: number
  /** In ml, both. */
  water: number
  waterTarget: number
  /** Formatted for the sentence, e.g. "6 of 11 cups". */
  waterReadout: string
  streak: number
  entries: number
  mealsLogged: MealKey[]
  allMacrosMet: boolean
}

const fmt = (n: number) => Math.round(n).toLocaleString()

const MEAL_WORD: Record<MealKey, string> = {
  morning: 'breakfast',
  afternoon: 'lunch',
  evening: 'dinner',
  late: 'a snack',
}

/** The meal the clock says is next, among those not yet logged. */
function nextMeal(hour: number, logged: MealKey[]): MealKey {
  const order: MealKey[] = hour < 11 ? ['morning', 'afternoon', 'evening'] : hour < 16 ? ['afternoon', 'evening'] : ['evening']
  return order.find((m) => !logged.includes(m)) ?? 'late'
}

export function dayInsight(f: DayFacts): DayInsight | null {
  if (!f.isToday) return null
  const left = f.goal - f.consumed

  if (f.entries === 0) {
    if (f.hour < 11) {
      return {
        text: 'Nothing logged yet. Breakfast is the easiest meal to get right, so write it down while it is fresh.',
        tone: 'neutral',
        action: { label: 'Log breakfast', kind: 'log', meal: 'morning' },
      }
    }
    if (f.hour < 16) {
      return {
        text: 'Nothing logged yet today. Start with lunch and the rest of the day tends to follow.',
        tone: 'neutral',
        action: { label: 'Log lunch', kind: 'log', meal: 'afternoon' },
      }
    }
    return {
      text:
        f.streak > 0
          ? `Nothing logged today. Dinner alone keeps the ${f.streak}-day streak alive.`
          : 'Nothing logged today. Dinner alone is worth writing down.',
      tone: 'neutral',
      action: { label: 'Log dinner', kind: 'log', meal: 'evening' },
    }
  }

  if (f.allMacrosMet) {
    return {
      text: 'Every macro target met today. That is the whole job done.',
      tone: 'good',
    }
  }

  if (left < 0) {
    return {
      text: `${fmt(-left)} calories over today. One day does not undo a week; tomorrow starts at zero.`,
      tone: 'warn',
      action: { label: 'See the diary', kind: 'diary' },
    }
  }

  const proteinShort = f.proteinTarget - f.protein
  if (f.hour >= 14 && f.proteinTarget > 0 && f.protein < f.proteinTarget * 0.55 && left > 300) {
    return {
      text: `Protein is at ${fmt(f.protein)} of ${fmt(f.proteinTarget)} g with ${fmt(left)} calories left. Something lean at ${MEAL_WORD[nextMeal(f.hour, f.mealsLogged)]} closes most of that ${fmt(proteinShort)} g gap.`,
      tone: 'neutral',
      action: { label: 'High-protein ideas', kind: 'recipes' },
    }
  }

  if (left <= 150 && f.hour < 20) {
    return {
      text: `${fmt(left)} calories left. A light ${MEAL_WORD[nextMeal(f.hour, f.mealsLogged)].replace(/^a /, '')} keeps the day on plan.`,
      tone: 'neutral',
    }
  }

  if (f.hour >= 14 && f.waterTarget > 0 && f.water < f.waterTarget * 0.4) {
    return {
      text: `Past the middle of the day and water is at ${f.waterReadout}. A glass now is the easy win.`,
      tone: 'neutral',
      action: { label: 'Log water', kind: 'water' },
    }
  }

  if (f.streak >= 2 && f.mealsLogged.length < 3 && f.hour >= 11) {
    const next = nextMeal(f.hour, f.mealsLogged)
    return {
      text: `${f.streak} days in a row. Logging ${MEAL_WORD[next]} today makes it ${f.streak + 1}.`,
      tone: 'good',
      action: { label: `Log ${MEAL_WORD[next]}`, kind: 'log', meal: next },
    }
  }

  return {
    text: `${fmt(left)} calories left and ${f.mealsLogged.length} ${f.mealsLogged.length === 1 ? 'meal' : 'meals'} logged. On pace.`,
    tone: 'good',
  }
}
