import type {
  ActivityLevel,
  BodyType,
  BodyTypeDef,
  GoalKind,
  MacroSplit,
  Nutrients,
  Profile,
  Sex,
  WeeklyGoal,
} from '../types'

/** Atwater factors, kcal per gram. */
export const KCAL_PER_G = { carbs: 4, protein: 4, fat: 9, alcohol: 7 } as const

/** One pound of body fat ≈ 3500 kcal. Drives the weekly-goal deficit. */
export const KCAL_PER_LB = 3500

export const ZERO_NUTRIENTS: Nutrients = {
  calories: 0,
  carbs: 0,
  fat: 0,
  protein: 0,
  satFat: 0,
  polyFat: 0,
  monoFat: 0,
  transFat: 0,
  cholesterol: 0,
  sodium: 0,
  potassium: 0,
  fiber: 0,
  sugar: 0,
  vitaminA: 0,
  vitaminC: 0,
  calcium: 0,
  iron: 0,
}

export function emptyNutrients(): Nutrients {
  return { ...ZERO_NUTRIENTS }
}

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out = {} as Nutrients
  for (const k of Object.keys(ZERO_NUTRIENTS) as (keyof Nutrients)[]) {
    out[k] = (n[k] ?? 0) * factor
  }
  return out
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  const out = emptyNutrients()
  for (const n of list) {
    for (const k of Object.keys(ZERO_NUTRIENTS) as (keyof Nutrients)[]) {
      out[k] += n[k] ?? 0
    }
  }
  return out
}

/* ------------------------------------------------------------------ BMR -- */

/**
 * Mifflin-St Jeor basal metabolic rate, the equation mainstream trackers use.
 *
 *   men:   10·kg + 6.25·cm − 5·age + 5
 *   women: 10·kg + 6.25·cm − 5·age − 161
 *
 * Note this is *not* Harris-Benedict, which is frequently misquoted in its
 * place (it uses a 655/66 constant and pound/inch coefficients).
 */
export function bmr(opts: {
  sex: Profile['sex']
  weightLb: number
  heightIn: number
  age: number
}): number {
  const kg = opts.weightLb * 0.45359237
  const cm = opts.heightIn * 2.54
  const base = 10 * kg + 6.25 * cm - 5 * opts.age
  return opts.sex === 'male' ? base + 5 : base - 161
}

/**
 * Activity multipliers describe *non-exercise* daily movement only. Intentional
 * workouts are logged separately and added back to the day's budget, which is
 * why "Active" here is lower than a typical all-in TDEE multiplier.
 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  'not-very-active': 1.2,
  'lightly-active': 1.375,
  active: 1.55,
  'very-active': 1.725,
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  'not-very-active': 'Not Very Active',
  'lightly-active': 'Lightly Active',
  active: 'Active',
  'very-active': 'Very Active',
}

export const ACTIVITY_DESCRIPTIONS: Record<ActivityLevel, string> = {
  'not-very-active': 'Sitting most of the day, desk work, driving, studying',
  'lightly-active': 'On your feet a few hours, teaching, retail, light housework',
  active: 'On your feet most of the day, nursing, waiting tables, warehouse work',
  'very-active': 'Hard physical work all day, construction, farming, landscaping',
}

export function tdee(profile: Profile, age: number): number {
  const base = bmr({
    sex: profile.sex,
    weightLb: profile.currentWeight,
    heightIn: profile.heightIn,
    age,
  })
  return base * ACTIVITY_FACTORS[profile.activityLevel]
}

/**
 * Daily calorie goal = maintenance − the deficit implied by the weekly goal,
 * floored at the safety minimum (1200 for women, 1500 for men) exactly as
 * consumer trackers do.
 */
export function calorieGoal(profile: Profile, age: number): number {
  if (profile.planMode === 'custom') return profile.customPlan.calories
  const maintenance = tdee(profile, age)
  const dailyDelta = (profile.goal.rate * KCAL_PER_LB) / 7
  const floor = profile.sex === 'male' ? 1500 : 1200
  return Math.max(floor, Math.round(maintenance + dailyDelta))
}

export const WEEKLY_GOAL_OPTIONS: { value: WeeklyGoal; label: string }[] = [
  { value: -2, label: 'Lose 2 lb per week' },
  { value: -1.5, label: 'Lose 1.5 lb per week' },
  { value: -1, label: 'Lose 1 lb per week' },
  { value: -0.5, label: 'Lose 0.5 lb per week' },
  { value: 0, label: 'Maintain my current weight' },
  { value: 0.5, label: 'Gain 0.5 lb per week' },
  { value: 1, label: 'Gain 1 lb per week' },
]

/** Warn when a goal implies an aggressive deficit relative to maintenance. */
export function goalIsAggressive(profile: Profile, age: number): boolean {
  const maintenance = tdee(profile, age)
  const goal = calorieGoal(profile, age)
  return maintenance - goal > 1000 || goal <= (profile.sex === 'male' ? 1500 : 1200)
}

/* --------------------------------------------------------------- macros -- */

export const DEFAULT_MACRO_SPLIT: MacroSplit = { carbs: 50, protein: 20, fat: 30 }

/** Convert a percentage split into gram targets for a calorie goal. */
export function macroGrams(
  goalCalories: number,
  split: MacroSplit
): { carbs: number; protein: number; fat: number } {
  return {
    carbs: Math.round((goalCalories * split.carbs) / 100 / KCAL_PER_G.carbs),
    protein: Math.round((goalCalories * split.protein) / 100 / KCAL_PER_G.protein),
    fat: Math.round((goalCalories * split.fat) / 100 / KCAL_PER_G.fat),
  }
}

/** Share of consumed calories coming from each macro, as whole percents. */
export function macroPercents(n: Nutrients): MacroSplit {
  const c = n.carbs * KCAL_PER_G.carbs
  const p = n.protein * KCAL_PER_G.protein
  const f = n.fat * KCAL_PER_G.fat
  const total = c + p + f
  if (total <= 0) return { carbs: 0, protein: 0, fat: 0 }
  // Largest-remainder rounding so the three always total exactly 100.
  const raw = [
    { key: 'carbs' as const, v: (c / total) * 100 },
    { key: 'protein' as const, v: (p / total) * 100 },
    { key: 'fat' as const, v: (f / total) * 100 },
  ]
  const floored = raw.map((r) => ({ ...r, f: Math.floor(r.v) }))
  let left = 100 - floored.reduce((s, r) => s + r.f, 0)
  const order = [...floored].sort((a, b) => b.v - b.f - (a.v - a.f))
  const bump = new Set<string>()
  for (const r of order) {
    if (left <= 0) break
    bump.add(r.key)
    left--
  }
  const out = { carbs: 0, protein: 0, fat: 0 }
  for (const r of floored) out[r.key] = r.f + (bump.has(r.key) ? 1 : 0)
  return out
}

/** Calories implied by the macro grams, used to sanity-check custom foods. */
export function caloriesFromMacros(n: Pick<Nutrients, 'carbs' | 'fat' | 'protein'>) {
  return (
    n.carbs * KCAL_PER_G.carbs +
    n.protein * KCAL_PER_G.protein +
    n.fat * KCAL_PER_G.fat
  )
}

/* ------------------------------------------------------------- exercise -- */

/** kcal = MET · 3.5 · kg / 200 · minutes */
export function caloriesBurned(met: number, weightLb: number, minutes: number) {
  const kg = weightLb * 0.45359237
  return Math.round(((met * 3.5 * kg) / 200) * minutes)
}

/* ----------------------------------------------------------- projection -- */

/**
 * The "if every day were like today" projection shown when completing a diary:
 * extrapolates today's net calories against maintenance over five weeks.
 */
export function projectedWeight(opts: {
  currentWeight: number
  maintenance: number
  netCalories: number
  weeks?: number
}): number {
  const weeks = opts.weeks ?? 5
  const dailyDelta = opts.netCalories - opts.maintenance
  const lbChange = (dailyDelta * 7 * weeks) / KCAL_PER_LB
  return opts.currentWeight + lbChange
}

/* ---------------------------------------------------------- body types -- */

/**
 * Body-fat estimates by self-reported build. These are deliberately coarse,
 * the point is to separate "180 lb muscular" from "180 lb soft" so protein and
 * hydration targets differ, not to pretend we measured anyone.
 */
export const BODY_TYPES: BodyTypeDef[] = [
  {
    key: 'lean',
    label: 'Lean',
    description: 'Slim build, little body fat, not much muscle',
    bodyFat: { female: 0.2, male: 0.12 },
  },
  {
    key: 'average',
    label: 'Average',
    description: 'Neither especially lean nor especially heavy',
    bodyFat: { female: 0.28, male: 0.19 },
  },
  {
    key: 'athletic',
    label: 'Athletic',
    description: 'Trained and defined, some visible muscle',
    bodyFat: { female: 0.23, male: 0.15 },
  },
  {
    key: 'muscular',
    label: 'Muscular',
    description: 'Noticeably more muscle than average',
    bodyFat: { female: 0.21, male: 0.14 },
  },
  {
    key: 'heavy',
    label: 'Heavier',
    description: 'Carrying extra weight you want to shift',
    bodyFat: { female: 0.38, male: 0.28 },
  },
]

export const BODY_TYPE_BY_KEY = Object.fromEntries(
  BODY_TYPES.map((b) => [b.key, b])
) as Record<BodyType, BodyTypeDef>

export function bodyFatFraction(bodyType: BodyType, sex: Sex): number {
  return BODY_TYPE_BY_KEY[bodyType].bodyFat[sex]
}

/** Lean body mass in lb, estimated from build rather than measured. */
export function leanMass(profile: Profile, weightLb: number): number {
  return weightLb * (1 - bodyFatFraction(profile.bodyType, profile.sex))
}

/* ------------------------------------------------------------- hydration -- */

/** Per-kg baseline; the elderly concentrate urine less well and need less. */
function baseWaterPerKg(ageYears: number): number {
  if (ageYears < 30) return 38
  if (ageYears < 55) return 35
  if (ageYears < 65) return 32
  return 30
}

/**
 * Daily hydration target in millilitres.
 *
 * Body mass sets the baseline, activity level adds a fixed allowance, and
 * logged exercise adds roughly 12 ml per active minute. Taller bodies lose
 * marginally more through skin, so height nudges it up. Clamped to a sane
 * 1.4-5.0 L so an outlier profile can't produce a dangerous number.
 */
export function waterGoalMl(opts: {
  weightLb: number
  heightIn: number
  ageYears: number
  activityLevel: ActivityLevel
  exerciseMinutes?: number
}): number {
  const kg = opts.weightLb * 0.45359237
  let ml = kg * baseWaterPerKg(opts.ageYears)

  const activityBonus: Record<ActivityLevel, number> = {
    'not-very-active': 0,
    'lightly-active': 150,
    active: 350,
    'very-active': 600,
  }
  ml += activityBonus[opts.activityLevel]

  // Height above ~5'6" adds surface area, and with it insensible loss.
  ml += Math.max(0, opts.heightIn - 66) * 20

  ml += (opts.exerciseMinutes ?? 0) * 12

  return Math.round(Math.min(5000, Math.max(1400, ml)) / 50) * 50
}

/* ------------------------------------------------------------------ plan -- */

export const GOAL_LABELS: Record<GoalKind, string> = {
  'lose-weight': 'Lose fat',
  'gain-muscle': 'Build muscle',
  maintain: 'Stay where I am',
  recomp: 'Lose fat and build muscle at once',
}

export const GOAL_DESCRIPTIONS: Record<GoalKind, string> = {
  'lose-weight':
    'A real calorie deficit with protein pushed high, so what you lose is fat rather than muscle',
  'gain-muscle':
    'A deliberate surplus with plenty of protein and carbs to train hard and recover',
  maintain: 'Hold your weight steady and eat enough to keep the muscle you have',
  recomp:
    'Sit near maintenance with the highest protein of any plan. Slow on the scale, fast in the mirror',
}

/**
 * Protein target in grams, scaled to lean mass rather than total weight,
 * scaling to total weight over-prescribes protein for heavier bodies.
 */
export function proteinTarget(profile: Profile, weightLb: number): number {
  const lean = leanMass(profile, weightLb)

  /* Grams per pound of LEAN mass, pushed toward the ends of the evidence range
     on purpose. In a deficit protein is what decides whether the weight you
     lose is fat or muscle; in a surplus it is the raw material. A flat figure
     for everyone makes both goals worse. */
  const perLb: Record<GoalKind, number> = {
    'lose-weight': 1.3,
    'gain-muscle': 1.2,
    maintain: 0.9,
    recomp: 1.4,
  }

  /* A hard cut needs more still, muscle loss scales with how steep the
     deficit is, not merely with the fact of being in one. */
  const steepCut = profile.goal.kind === 'lose-weight' && profile.goal.rate <= -1.5
  return Math.round(lean * (perLb[profile.goal.kind] + (steepCut ? 0.15 : 0)))
}

/**
 * Fat as a share of calories, by goal.
 *
 * Cutting pushes fat toward the hormonal floor so the remaining calories can
 * go to protein and training fuel. Building leaves more room, because hitting
 * a surplus on protein and carbs alone is genuinely unpleasant to eat.
 */
function fatShareFor(kind: GoalKind): number {
  if (kind === 'lose-weight') return 0.22
  if (kind === 'gain-muscle') return 0.28
  if (kind === 'recomp') return 0.24
  return 0.3
}

export interface ResolvedPlan {
  calories: number
  macros: { carbs: number; protein: number; fat: number }
  split: MacroSplit
  waterMl: number
  maintenance: number
  bmr: number
  /** True when the goal was clamped by the safety floor. */
  flooredCalories: boolean
}

/**
 * The single source of truth for every target in the app. Standard mode
 * computes from the profile; custom mode takes the user's numbers verbatim but
 * still reports the computed maintenance so they can see what they're choosing
 * against.
 */
export function resolvePlan(
  profile: Profile,
  ageYears: number,
  weightLb: number,
  exerciseMinutes = 0
): ResolvedPlan {
  const base = bmr({
    sex: profile.sex,
    weightLb,
    heightIn: profile.heightIn,
    age: ageYears,
  })
  const maintenance = base * ACTIVITY_FACTORS[profile.activityLevel]

  if (profile.planMode === 'custom') {
    const c = profile.customPlan
    return {
      calories: c.calories,
      macros: macroGrams(c.calories, c.macroSplit),
      split: c.macroSplit,
      waterMl: c.waterMl,
      maintenance,
      bmr: base,
      flooredCalories: false,
    }
  }

  const dailyDelta = (profile.goal.rate * KCAL_PER_LB) / 7
  const floor = profile.sex === 'male' ? 1500 : 1200
  const raw = Math.round(maintenance + dailyDelta)
  const calories = Math.max(floor, raw)

  // Protein is anchored to lean mass first, then fat takes its goal-dependent
  // share, and carbs get whatever is left. Protein is capped at half of
  // calories so an extreme goal can't crowd out everything else.
  const protein = proteinTarget(profile, weightLb)
  const proteinCals = Math.min(protein * KCAL_PER_G.protein, calories * 0.5)
  const fatCals = calories * fatShareFor(profile.goal.kind)
  const carbCals = Math.max(0, calories - proteinCals - fatCals)

  const split: MacroSplit = {
    protein: Math.round((proteinCals / calories) * 100),
    fat: Math.round((fatCals / calories) * 100),
    carbs: Math.round((carbCals / calories) * 100),
  }
  // Rounding can drift the total off 100; absorb the difference into carbs.
  split.carbs = 100 - split.protein - split.fat

  return {
    calories,
    macros: {
      protein: Math.round(proteinCals / KCAL_PER_G.protein),
      fat: Math.round(fatCals / KCAL_PER_G.fat),
      carbs: Math.round(carbCals / KCAL_PER_G.carbs),
    },
    split,
    waterMl:
      profile.waterGoalOverrideMl ??
      waterGoalMl({
        weightLb,
        heightIn: profile.heightIn,
        ageYears,
        activityLevel: profile.activityLevel,
        exerciseMinutes,
      }),
    maintenance,
    bmr: base,
    flooredCalories: raw < floor,
  }
}

/** Weeks to reach the goal weight at the planned rate. */
export function weeksToGoal(currentLb: number, goalLb: number, rate: number) {
  if (!rate) return null
  const weeks = (goalLb - currentLb) / rate
  return weeks > 0 && Number.isFinite(weeks) ? Math.ceil(weeks) : null
}

export function age(birthDate: string, on = new Date()): number {
  const b = new Date(birthDate + 'T00:00:00')
  let a = on.getFullYear() - b.getFullYear()
  const m = on.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && on.getDate() < b.getDate())) a--
  return Math.max(0, a)
}

export function bmi(weightLb: number, heightIn: number): number {
  return (weightLb / (heightIn * heightIn)) * 703
}

export function bmiCategory(value: number): string {
  if (value < 18.5) return 'Underweight'
  if (value < 25) return 'Normal'
  if (value < 30) return 'Overweight'
  return 'Obese'
}
