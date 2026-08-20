import type { AppData, Profile, Settings, ShareLevel } from '../types'
import { DEFAULT_MACRO_SPLIT } from './nutrition'
import { defaultFastingSettings } from './fasting'

const KEY = 'logpal.v1'

/** The app was called FitLog before; carry that data over on first load. */
const LEGACY_KEYS = ['fitlog.v1']

/**
 * Persistence adapter. Everything the app writes funnels through `save`/`load`,
 * so swapping localStorage for a remote backend is contained to this file:
 * make the two functions async, add a `userId`, and have the store await them.
 */
export interface PersistenceAdapter {
  load(): AppData | null
  save(data: AppData): void
  clear(): void
}

export const localAdapter: PersistenceAdapter = {
  load() {
    try {
      let raw = localStorage.getItem(KEY)

      // First run after the rename: adopt the old key's data and leave the
      // original in place, so an accidental downgrade doesn't lose anything.
      if (!raw) {
        for (const legacy of LEGACY_KEYS) {
          const old = localStorage.getItem(legacy)
          if (old) {
            localStorage.setItem(KEY, old)
            raw = old
            break
          }
        }
      }

      if (!raw) return null
      return migrate(JSON.parse(raw))
    } catch {
      return null
    }
  },
  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      // Quota exceeded — drop the network food cache first, it is rebuildable.
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...data, foodCache: {} }))
      } catch {
        /* give up silently rather than breaking the UI */
      }
    }
  },
  clear() {
    localStorage.removeItem(KEY)
  },
}

/** Old meal keys, from before entries grouped by clock time. */
const LEGACY_PERIOD: Record<string, string> = {
  breakfast: 'morning',
  lunch: 'afternoon',
  dinner: 'evening',
  snacks: 'late',
}

/**
 * Sharing settings, carried across the change from figures to percentages.
 *
 * A saved account had one calorie switch and it was off by default. Spreading
 * the new defaults over it would turn on water, steps and macros for people
 * who never agreed to any of them, so an existing save keeps its answer —
 * calories, and only calories, if that is what it had — and is asked about the
 * rest the next time it adds someone.
 */
function migrateSettings(base: Settings, saved?: Partial<Settings>): Settings {
  const merged = { ...base, ...saved }
  if (!saved) return merged

  /* Two migrations, in order.
   *
   * The first sharing model was one boolean, `shareCalories`. The second was
   * five booleans, one per figure. This is the third: a level per figure. A
   * save can be at any of them, and a `true` from either earlier model means
   * "share this", which is now `percent` — never `exact`, because nobody who
   * ticked a box was agreeing to publish the number itself. */
  const legacy = saved as Record<string, unknown>
  const fromBool = (v: unknown): ShareLevel | null =>
    typeof v === 'boolean' ? (v ? 'percent' : 'off') : null

  const level = (current: unknown, ...older: unknown[]): ShareLevel => {
    if (current === 'off' || current === 'percent' || current === 'exact') return current
    for (const o of older) {
      const converted = fromBool(o)
      if (converted) return converted
    }
    return 'off'
  }

  return {
    ...merged,
    shareCalories: level(legacy.shareCalories, legacy.shareCaloriePct, legacy.shareCalories),
    shareWater: level(legacy.shareWater, legacy.shareWaterPct),
    shareSteps: level(legacy.shareSteps, legacy.shareStepPct),
    shareMacros: level(legacy.shareMacros, legacy.shareMacroPct),
    shareWorkouts: level(legacy.shareWorkouts, legacy.shareExercise),
  }
}

/** Fills in fields added after a user's data was first written. */
function migrate(data: Partial<AppData>): AppData {
  const base = defaultData()

  const foodEntries = (data.foodEntries ?? []).map((e) => {
    const mapped = LEGACY_PERIOD[e.meal as string]
    return mapped ? { ...e, meal: mapped as typeof e.meal } : e
  })

  const profile = { ...base.profile, ...data.profile }
  // Profiles written before goals were structured only had weeklyGoal.
  if (!data.profile?.goal) {
    profile.goal = {
      kind: profile.weeklyGoal < 0 ? 'lose-weight' : profile.weeklyGoal > 0 ? 'gain-muscle' : 'maintain',
      targetWeight: profile.goalWeight,
      rate: profile.weeklyGoal,
    }
  }

  return {
    ...base,
    ...data,
    profile,
    settings: migrateSettings(base.settings, data.settings),
    foodEntries,
    exerciseEntries: data.exerciseEntries ?? [],
    weights: data.weights ?? [],
    measurements: data.measurements ?? [],
    customFoods: data.customFoods ?? [],
    savedMeals: data.savedMeals ?? [],
    recipes: data.recipes ?? [],
    days: data.days ?? {},
    recentFoodIds: data.recentFoodIds ?? [],
    favoriteFoodIds: data.favoriteFoodIds ?? [],
    foodCache: data.foodCache ?? {},
    scannedBarcodes: data.scannedBarcodes ?? {},
    fasting: { ...defaultFastingSettings(), ...data.fasting },
    fasts: data.fasts ?? [],
    planEntries: data.planEntries ?? [],
    shopping: data.shopping ?? [],
    pantry: data.pantry ?? [],
    savedRecipeIds: data.savedRecipeIds ?? [],
    recentSearches: data.recentSearches ?? [],
  }
}

/**
 * A display name from its parts. Last name is optional, so someone who gave
 * only a first name is shown that alone rather than a trailing space.
 */
export function displayNameFrom(first?: string, last?: string): string {
  return [first?.trim(), last?.trim()].filter(Boolean).join(' ')
}

export function defaultProfile(): Profile {
  return {
    name: '',
    sex: 'female',
    birthDate: '1995-01-01',
    heightIn: 66,
    startWeight: 150,
    currentWeight: 150,
    goalWeight: 140,
    bodyType: 'average',
    goal: { kind: 'lose-weight', targetWeight: 140, rate: -1 },
    activityLevel: 'lightly-active',
    weeklyGoal: -1,
    planMode: 'standard',
    customPlan: {
      calories: 2000,
      macroSplit: { ...DEFAULT_MACRO_SPLIT },
      waterMl: 2500,
    },
    macroSplit: { ...DEFAULT_MACRO_SPLIT },
    nutrientGoals: {},
    workoutsPerWeek: 3,
    minutesPerWorkout: 30,
    /* Eight hours and ten thousand steps: the figures people already have in
       their heads, which matters more here than precision — neither is a
       clinical target and both are meant to be changed. */
    sleepGoalMin: 480,
    stepGoal: 10000,
    onboarded: false,
  }
}

export function defaultSettings(): Settings {
  return {
    weightUnit: 'lb',
    heightUnit: 'in',
    energyUnit: 'kcal',
    waterUnit: 'cup',
    theme: 'system',
    exerciseAddsCalories: true,
    useOpenFoodFacts: true,
    /* Name and streak are what make a followers list worth opening at all, and
       neither is health data. Today's calories against a target is, so it is
       off until someone asks for it. `migrate` spreads defaults over saved
       settings, so accounts written before this get the same. */
    shareName: true,
    shareStreak: true,
    /* Percentages are the whole point of the friends screen, so they are the
       starting position for a new account. Workouts are not: they carry what
       you did and when, which is a different kind of detail, and it is asked
       for by name. */
    shareCalories: 'percent',
    shareWater: 'percent',
    shareSteps: 'percent',
    shareMacros: 'percent',
    shareWorkouts: 'off',
    sharingAsked: false,
  }
}

export function defaultData(): AppData {
  return {
    profile: defaultProfile(),
    settings: defaultSettings(),
    foodEntries: [],
    exerciseEntries: [],
    weights: [],
    measurements: [],
    customFoods: [],
    savedMeals: [],
    recipes: [],
    days: {},
    recentFoodIds: [],
    favoriteFoodIds: [],
    foodCache: {},
    scannedBarcodes: {},
    fasting: defaultFastingSettings(),
    fasts: [],
    planEntries: [],
    shopping: [],
    pantry: [],
    savedRecipeIds: [],
    recentSearches: [],
  }
}
