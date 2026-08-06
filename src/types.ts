/**
 * Core domain types.
 *
 * Nutrition is always stored *per serving as logged* — never per 100g — so a
 * diary entry is self-contained and never re-derives from a food that may have
 * been edited later. Food records store per-serving values too; scaling by
 * `servings` happens at log time.
 */

/**
 * Entries group by when they were logged, not by a meal the user has to pick.
 * The picker was the friction — the clock already knows the answer.
 */
export type MealKey = 'morning' | 'afternoon' | 'evening' | 'late'

export const MEAL_KEYS: MealKey[] = ['morning', 'afternoon', 'evening', 'late']

export const PERIOD_LABELS: Record<MealKey, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  late: 'Late',
}

/** Boundaries in local hours. `late` wraps past midnight. */
export function periodForHour(hour: number): MealKey {
  if (hour >= 4 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 16) return 'afternoon'
  if (hour >= 16 && hour < 21) return 'evening'
  return 'late'
}

export function periodForDate(d: Date | number): MealKey {
  return periodForHour(new Date(d).getHours())
}

/** Every nutrient the app tracks, matching the set a mainstream tracker shows. */
export interface Nutrients {
  calories: number
  carbs: number
  fat: number
  protein: number
  satFat: number
  polyFat: number
  monoFat: number
  transFat: number
  cholesterol: number // mg
  sodium: number // mg
  potassium: number // mg
  fiber: number
  sugar: number
  vitaminA: number // % daily value
  vitaminC: number // % daily value
  calcium: number // % daily value
  iron: number // % daily value
}

export type NutrientKey = keyof Nutrients

/** One selectable portion of a food, e.g. "1 cup (240 g)". */
export interface Serving {
  /** Human label shown in the serving picker, e.g. "1 cup". */
  label: string
  /** Weight in grams, when known. Used for gram-based conversions. */
  grams?: number
  /** Multiplier applied to the food's base `nutrients` for this serving. */
  multiplier: number
}

export type FoodSource = 'seed' | 'off' | 'custom' | 'quick' | 'recipe' | 'meal'

export interface Food {
  id: string
  name: string
  brand?: string
  /** Nutrition for exactly one of `servings[0]`. */
  nutrients: Nutrients
  servings: Serving[]
  source: FoodSource
  barcode?: string
  imageUrl?: string
  /** True once the user has starred it. */
  favorite?: boolean
  /** Set for foods generated from a saved recipe. */
  recipeId?: string
  verified?: boolean
}

export interface FoodEntry {
  id: string
  date: string // YYYY-MM-DD
  meal: MealKey
  foodId: string
  /** Denormalised so history survives edits to the underlying food. */
  name: string
  brand?: string
  servingLabel: string
  servings: number
  nutrients: Nutrients // already scaled by `servings`
  source: FoodSource
  loggedAt: number
}

export type ExerciseKind = 'cardio' | 'strength'

export interface ExerciseDef {
  id: string
  name: string
  kind: ExerciseKind
  /** Metabolic equivalent; kcal/kg/hour. Cardio only. */
  met?: number
}

export interface ExerciseEntry {
  id: string
  date: string
  kind: ExerciseKind
  name: string
  exerciseId?: string
  minutes?: number
  caloriesBurned?: number
  sets?: number
  reps?: number
  weight?: number
  loggedAt: number
}

export interface WeightEntry {
  date: string
  weight: number // stored in lb
}

export interface MeasurementEntry {
  date: string
  key: string // 'neck' | 'waist' | 'hips' | custom slug
  value: number // stored in inches
}

/** A named bundle of foods logged together. */
export interface SavedMeal {
  id: string
  name: string
  items: MealItem[]
  createdAt: number
}

export interface MealItem {
  foodId: string
  name: string
  brand?: string
  servingLabel: string
  servings: number
  nutrients: Nutrients
}

export interface Recipe {
  id: string
  name: string
  servingsMade: number
  items: MealItem[]
  createdAt: number
  /** Optional source URL when imported from the web. */
  sourceUrl?: string
}

export type Sex = 'female' | 'male'

/**
 * Self-reported build. Used to bias the lean-mass estimate, which in turn
 * shifts protein targets and the water goal — a muscular 180 lb body needs
 * more of both than a soft 180 lb body at the same height.
 */
export type BodyType = 'lean' | 'average' | 'athletic' | 'muscular' | 'heavy'

export interface BodyTypeDef {
  key: BodyType
  label: string
  description: string
  /** Rough body-fat fraction used to derive lean mass. */
  bodyFat: Record<Sex, number>
}

/** What the user is actually trying to do — drives the whole plan. */
export type GoalKind =
  | 'lose-weight'
  | 'gain-muscle'
  | 'maintain'
  | 'recomp'

export interface GoalSpec {
  kind: GoalKind
  /** Target body weight in lb. Set for lose-weight / gain-muscle. */
  targetWeight?: number
  /** Alternative to targetWeight: pounds to lose or muscle lb to gain. */
  deltaPounds?: number
  /** lb per week, signed. */
  rate: number
}

/**
 * Two ways to run the app: a plan we compute, or one the user dictates.
 * Both are always stored, so switching back and forth loses nothing.
 */
export type PlanMode = 'standard' | 'custom'

export interface CustomPlan {
  calories: number
  macroSplit: MacroSplit
  waterMl: number
}

export type ActivityLevel =
  | 'not-very-active'
  | 'lightly-active'
  | 'active'
  | 'very-active'

/** lb per week. Negative loses weight, positive gains. */
export type WeeklyGoal = -2 | -1.5 | -1 | -0.5 | 0 | 0.5 | 1

export interface MacroSplit {
  carbs: number // percent
  protein: number
  fat: number
}

export interface Profile {
  name: string
  sex: Sex
  birthDate: string // YYYY-MM-DD
  heightIn: number
  startWeight: number // lb
  currentWeight: number // lb
  goalWeight: number // lb
  bodyType: BodyType
  goal: GoalSpec
  activityLevel: ActivityLevel
  weeklyGoal: WeeklyGoal
  planMode: PlanMode
  /** Only consulted when planMode is 'custom'. */
  customPlan: CustomPlan
  macroSplit: MacroSplit
  /** Per-nutrient goals for the extras shown on the Nutrients tab. */
  nutrientGoals: Partial<Record<NutrientKey, number>>
  workoutsPerWeek: number
  minutesPerWorkout: number
  /** Manual override of the computed hydration target. */
  waterGoalOverrideMl?: number
  onboarded: boolean
}

export interface Settings {
  weightUnit: 'lb' | 'kg'
  heightUnit: 'in' | 'cm'
  energyUnit: 'kcal' | 'kJ'
  waterUnit: 'cup' | 'ml' | 'floz'
  theme: 'light' | 'dark' | 'system'
  /** Add exercise calories back to the daily budget. */
  exerciseAddsCalories: boolean
  /** Search live Open Food Facts alongside the built-in database. */
  useOpenFoodFacts: boolean
}

/* ---------------------------------------------------- intermittent fasting -- */

export type FastProtocol = '12:12' | '14:10' | '16:8' | '18:6' | '20:4' | 'omad' | 'custom'

export interface FastProtocolDef {
  key: FastProtocol
  label: string
  fastHours: number
  description: string
}

/**
 * A single fast. `endedAt` absent means it's still running — there is at most
 * one of those at a time, enforced when starting.
 */
export interface FastSession {
  id: string
  startedAt: number
  endedAt?: number
  /** Target length in hours at the time it was started. */
  targetHours: number
  protocol: FastProtocol
  note?: string
}

export interface FastingSettings {
  enabled: boolean
  protocol: FastProtocol
  /** Only consulted when protocol is 'custom'. */
  customFastHours: number
  /** Local hour the eating window usually opens, for the schedule preview. */
  eatingWindowStartHour: number
}

export interface DayLog {
  water: number // ml
  completed: boolean
}

export interface AppData {
  profile: Profile
  settings: Settings
  foodEntries: FoodEntry[]
  exerciseEntries: ExerciseEntry[]
  weights: WeightEntry[]
  measurements: MeasurementEntry[]
  customFoods: Food[]
  savedMeals: SavedMeal[]
  recipes: Recipe[]
  days: Record<string, DayLog>
  recentFoodIds: string[]
  favoriteFoodIds: string[]
  /** Foods pulled from the network, cached so history keeps resolving offline. */
  foodCache: Record<string, Food>
  /** barcode -> food id, for instant repeat scans. */
  scannedBarcodes: Record<string, string>
  fasting: FastingSettings
  fasts: FastSession[]
}
