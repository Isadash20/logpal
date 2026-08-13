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

export type FoodSource =
  | 'seed'
  | 'usda'
  | 'off'
  | 'custom'
  | 'quick'
  | 'recipe'
  | 'meal'

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
  /**
   * A reference food ("Shrimp", "Chicken breast, grilled") rather than a
   * packaged product. Search ranks these above branded rows, because someone
   * typing "shrimp" wants shrimp, not Maruchan Shrimp Flavour Ramen.
   */
  generic?: boolean
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
  /**
   * Nutrition, one entry per ingredient that could be priced against the food
   * database. This stays the source of truth for calories — `ingredients` below
   * is what the recipe *says*, and this is what it *costs*. Resolved once, when
   * the recipe is written or imported, so a later change to a food record never
   * silently rewrites a recipe someone has already planned around.
   */
  items: MealItem[]
  createdAt: number
  /** Optional source URL when imported from the web. */
  sourceUrl?: string

  /* ---- written form, added with the meal planner ---- */

  /**
   * Ingredients exactly as written — "1 ¼ cups all-purpose flour". Shown in
   * preference to `items`, because a recipe has to read like a recipe; the
   * parsed version is for arithmetic, not for people. Absent on recipes created
   * before the planner, which are rendered from `items` instead.
   */
  ingredients?: string[]
  /** Numbered method. */
  steps?: string[]
  description?: string
  imageUrl?: string
  prepMin?: number
  cookMin?: number
  /** Free-form: cuisine, meal type and diet, as the filters use them. */
  tags?: string[]
}

/* ------------------------------------------------------------ meal plans -- */

/**
 * Slots are fixed and named, unlike the diary's clock-derived periods.
 * Planning is deliberate — you choose that something is dinner — whereas
 * logging infers it from the time, and forcing one to be the other would mean
 * a meal planned for dinner landing in the afternoon because you cooked early.
 */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

/** One recipe placed in one slot on one day. */
export interface PlanEntry {
  id: string
  date: string // YYYY-MM-DD
  slot: MealSlot
  recipeId: string
  /** Portions of the recipe planned, which may differ from what it makes. */
  servings: number
  /**
   * When this was logged to the diary, if it has been. A plan is an intention
   * and the diary is a record; keeping them separate is what lets the planner
   * show "planned but not eaten" rather than pretending they are the same.
   */
  loggedAt?: number
}

/* --------------------------------------------------------- shopping list -- */

export interface ShoppingItem {
  id: string
  name: string
  /** Combined amount for display, e.g. "3 cups". Never used for arithmetic. */
  amount?: string
  /** Supermarket section, so the list is walkable rather than alphabetical. */
  aisle: string
  checked: boolean
  /** Recipe ids that put it here; absent for something typed in by hand. */
  fromRecipeIds?: string[]
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
  /**
   * Display name — what the app shows. Derived from `firstName`/`lastName` at
   * sign-up, but kept as its own field because it predates them and everything
   * that renders a name already reads it.
   */
  name: string
  firstName?: string
  /** Optional. A display name is the first name alone when this is absent. */
  lastName?: string
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

  /**
   * What followers are shown.
   *
   * These live in settings rather than beside the published row so they sync
   * like every other preference, and so the choice itself stays private. They
   * are filters on what the client *writes*: switching one off removes the
   * column's value from the server on the next publish, rather than hiding a
   * value that is still sitting there. Turning all three off deletes the row.
   *
   * Whether the account is private is not here — the server has to read that
   * one to decide whether a follow needs approving, so it lives on the
   * published row.
   */
  shareName: boolean
  shareStreak: boolean
  /** Today's calories against the day's target. Off by default. */
  shareCalories: boolean
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

  /**
   * Meal planning. Device-local for now — these three are deliberately not in
   * any cloud collection yet, and the sign-in reconcile carries them across a
   * cloud read rather than letting an empty server wipe them. Syncing them
   * needs three more tables; until those exist, pretending they sync would be
   * the kind of quiet data loss this codebase has been careful to avoid.
   */
  planEntries: PlanEntry[]
  shopping: ShoppingItem[]
  /** The Food List: what you already have, so it stays off the shopping list. */
  pantry: string[]
}
