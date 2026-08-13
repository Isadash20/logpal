import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppData,
  DayLog,
  ExerciseEntry,
  Food,
  FoodEntry,
  MealItem,
  MealKey,
  MeasurementEntry,
  Nutrients,
  PlanEntry,
  Profile,
  Recipe,
  SavedMeal,
  Settings,
  FastingSettings,
  MealSlot,
  WeightEntry,
} from '../types'
import { MEAL_KEYS, periodForDate } from '../types'
import { aisleFor } from '../data/aisles'
import { findRecipe, resolveRecipe } from '../services/recipes'
import { formatAmount, parseIngredient } from '../lib/ingredients'
import type { Session } from '@supabase/supabase-js'
import { defaultData, localAdapter } from '../lib/storage'
import { cloudEnabled, consumeAuthFragment, supabase } from '../lib/supabase'
import { deleteAll, fetchAll, fetchUsername, pushChanges } from '../services/cloud'
import { NOTHING_PUBLISHED, publishProfile, type PublishedProfile } from '../services/social'
import { addDays, today } from '../lib/dates'

/** Set when someone declines an account; keeps them out of the auth screen. */
const LOCAL_ONLY_KEY = 'logpal.localOnly'
import { uid } from '../lib/id'
import {
  age as ageOf,
  emptyNutrients,
  resolvePlan,
  sumNutrients,
  type ResolvedPlan,
} from '../lib/nutrition'
import { SEED_BY_ID } from '../data/seedFoods'
import { targetHoursFor } from '../lib/fasting'

/* ------------------------------------------------------- planning helpers -- */

/**
 * Where a planned slot lands in the diary.
 *
 * The diary groups by the clock and the planner by intent, so the two vocabularies
 * have to meet somewhere. Logging a planned dinner puts it in the evening even if
 * you cooked it at four, because that is what you decided it was.
 */
const SLOT_TO_PERIOD: Record<MealSlot, MealKey> = {
  breakfast: 'morning',
  lunch: 'afternoon',
  dinner: 'evening',
  snack: 'late',
}

/** Local copy so the store need not import the whole nutrition module twice. */
function scaleNutrientsLocal(n: Nutrients, by: number): Nutrients {
  const out = {} as Nutrients
  for (const k of Object.keys(n) as (keyof Nutrients)[]) out[k] = (n[k] ?? 0) * by
  return out
}

/**
 * Folds a recipe's ingredients into the shopping list.
 *
 * Merging by name matters more than it looks: planning three recipes that each
 * want an onion should put "3 onions" on the list once, not three separate
 * lines you discover at three different points in the shop. Anything already in
 * the Food List is skipped — that is the whole point of keeping one.
 *
 * Returns how many lines were newly added, so the caller can say so.
 */
function mergeIntoList(d: AppData, recipe: Recipe, scale: number): number {
  const lines = recipe.ingredients ?? []
  let added = 0

  for (const line of lines) {
    const parsed = parseIngredient(line)
    const name = parsed.name.trim()
    if (!name) continue

    // Already in the cupboard.
    if (d.pantry.some((p) => name.toLowerCase().includes(p))) continue

    const existing = d.shopping.find(
      (s) => s.name.toLowerCase() === name.toLowerCase() && !s.checked,
    )
    const qty = parsed.qty != null ? parsed.qty * scale : null

    if (existing) {
      /* Amounts only combine when both lines used the same unit. Two cups plus
         one clove is not three of anything, and inventing a total would be
         worse than showing the recipe count. */
      const prev = existing.amount ? parseIngredient(existing.amount) : null
      if (prev && qty != null && prev.qty != null && prev.unit === parsed.unit) {
        existing.amount = formatAmount(prev.qty + qty, parsed.unit)
      }
      if (!existing.fromRecipeIds?.includes(recipe.id)) {
        existing.fromRecipeIds = [...(existing.fromRecipeIds ?? []), recipe.id]
      }
      continue
    }

    d.shopping.push({
      id: uid('s'),
      name,
      amount: qty != null ? formatAmount(qty, parsed.unit) : undefined,
      aisle: aisleFor(name),
      checked: false,
      fromRecipeIds: [recipe.id],
    })
    added++
  }

  return added
}

/* ------------------------------------------------------------ navigation -- */

export type TabKey = 'today' | 'plan' | 'progress' | 'more'

export type Route =
  | { name: 'tab'; tab: TabKey }
  | { name: 'diary' }
  | { name: 'nutrition'; date: string }
  | { name: 'foodSearch'; date: string }
  | {
      name: 'foodDetail'
      food: Food
      date: string
      entryId?: string
      servings?: number
      servingLabel?: string
    }
  | { name: 'createFood'; barcode?: string; returnTo?: { date: string } }
  | { name: 'quickAdd'; date: string }
  | { name: 'scan'; date: string }
  | { name: 'voiceLog'; date: string }
  | { name: 'mealScan'; date: string }
  | { name: 'exerciseSearch'; date: string; kind: 'cardio' | 'strength' }
  | {
      name: 'exerciseDetail'
      date: string
      kind: 'cardio' | 'strength'
      exerciseId?: string
      name_: string
      entryId?: string
    }
  | { name: 'water'; date: string }
  | { name: 'meals' }
  | { name: 'mealEditor'; mealId?: string }
  | { name: 'recipes' }
  | { name: 'recipeEditor'; recipeId?: string }
  | { name: 'myFoods' }
  | { name: 'goals' }
  | { name: 'weightEntry' }
  | { name: 'measurement'; key: string }
  | { name: 'progressPhotos' }
  | { name: 'fasting' }
  | { name: 'foodsHub' }
  | { name: 'planHub' }
  | { name: 'prefsProfile' }
  | { name: 'prefsUnits' }
  | { name: 'prefsAppearance' }
  | { name: 'friends' }
  | { name: 'friendProfile'; userId: string; username: string }
  | { name: 'friendsSharing' }
  | { name: 'recipeBrowse'; slot?: MealSlot; date?: string }
  | { name: 'recipeView'; recipeId: string; slot?: MealSlot; date?: string }
  | { name: 'shoppingList' }
  | { name: 'about' }

/* ------------------------------------------------------------- selectors -- */

export interface DayTotals {
  nutrients: Nutrients
  byMeal: Record<MealKey, Nutrients>
  exerciseCalories: number
  exerciseMinutes: number
  goal: number
  remaining: number
  maintenance: number
}

interface Ctx {
  data: AppData
  profile: Profile
  settings: Settings

  /** Currently selected diary date. */
  date: string
  setDate(d: string): void

  route: Route
  stack: Route[]
  push(r: Route): void
  pop(): void
  popTo(depth: number): void
  setTab(t: TabKey): void
  activeTab: TabKey

  // derived
  age: number
  plan: ResolvedPlan
  calorieTarget: number
  macroTargets: { carbs: number; protein: number; fat: number }
  waterTarget: number
  totalsFor(date: string): DayTotals
  entriesFor(date: string, meal?: MealKey): FoodEntry[]
  exercisesFor(date: string): ExerciseEntry[]
  dayLog(date: string): DayLog
  resolveFood(id: string): Food | undefined
  latestWeight: number
  /** Consecutive days logged. Shown on Home, and published to followers. */
  logStreak: number
  /** The most recent day with anything on it, or null. */
  lastLogged: string | null

  // mutations
  update(fn: (d: AppData) => void): void
  logFood(opts: {
    food: Food
    date: string
    servings: number
    servingLabel: string
    nutrients: Nutrients
    entryId?: string
    /** Omitted for new entries — derived from the clock. */
    meal?: MealKey
  }): void
  deleteEntry(id: string): void
  moveEntry(id: string, meal: MealKey): void
  copyDay(from: string, to: string): void
  logExercise(e: Omit<ExerciseEntry, 'id' | 'loggedAt'> & { id?: string }): void
  deleteExercise(id: string): void
  setWater(date: string, ml: number): void
  setCompleted(date: string, done: boolean): void
  addWeight(date: string, lb: number): void
  deleteWeight(date: string): void
  addMeasurement(m: MeasurementEntry): void
  saveProfile(p: Partial<Profile>): void
  saveSettings(s: Partial<Settings>): void
  saveCustomFood(f: Food): void
  deleteCustomFood(id: string): void
  /** Persist a barcode-scanned product so it becomes searchable offline. */
  saveScannedFood(f: Food): void
  startFast(): void
  endFast(id: string): void
  deleteFast(id: string): void
  saveFasting(s: Partial<FastingSettings>): void
  toggleFavorite(id: string): void
  saveMeal(m: SavedMeal): void
  deleteMeal(id: string): void
  saveRecipe(r: Recipe): void
  deleteRecipe(id: string): void
  logItems(items: MealItem[], date: string, source: Food['source']): void
  resetAll(): void

  // meal planning
  /** Puts a recipe in a slot on a day. */
  planMeal(opts: { recipeId: string; date: string; slot: MealSlot; servings?: number }): void
  unplanMeal(id: string): void
  setPlanServings(id: string, servings: number): void
  /** Moves a planned meal to another day or slot — what drag-and-drop commits. */
  movePlanEntry(id: string, date: string, slot: MealSlot): void
  /** Writes a planned meal into the diary as real food entries. */
  logPlanEntry(id: string): void
  planFor(date: string): PlanEntry[]
  /** Planned calories for a day, whether or not they have been eaten. */
  plannedCalories(date: string): number

  // shopping
  /** Adds one recipe's ingredients, merging with what is already listed. */
  addRecipeToShoppingList(recipeId: string, servings?: number): number
  /** Adds everything planned between two dates. */
  addPlanToShoppingList(from: string, to: string): number
  toggleShoppingItem(id: string): void
  addShoppingItem(name: string): void
  removeShoppingItem(id: string): void
  clearCheckedShopping(): void
  togglePantry(name: string): void

  // account + sync
  /** Null when signed out, or when the app has no Supabase credentials. */
  session: Session | null
  /** False until the initial session check completes; gates the auth screen. */
  authReady: boolean
  /** True while the first cloud read of a session is in flight. */
  syncing: boolean
  /** Last sync failure, or null. Changes are kept locally and retried. */
  syncError: string | null
  /** The signed-in account's handle, or null if it has not been claimed yet.
   *  Undefined while it is still being looked up. */
  username: string | null | undefined
  /** Called after claiming a handle, so the sign-up gate lets go. */
  setUsername(u: string): void
  signOut(): Promise<void>
  /** True when the user chose to carry on without an account on this device. */
  localOnly: boolean
  setLocalOnly(v: boolean): void
}

const AppContext = createContext<Ctx | null>(null)

export function useApp(): Ctx {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

/* -------------------------------------------------------------- provider -- */

export function AppProvider({ children }: { children: ReactNode }) {
  /* Local storage is still the source of truth at startup, even with an
     account. It is synchronous, so the app paints real data immediately
     instead of a spinner, and it keeps working with no connection. The cloud
     copy is reconciled in behind it. */
  const [data, setData] = useState<AppData>(() => localAdapter.load() ?? defaultData())
  const [date, setDate] = useState(today())
  const [activeTab, setActiveTab] = useState<TabKey>('today')
  const [stack, setStack] = useState<Route[]>([{ name: 'tab', tab: 'today' }])

  /* Remembered per device, so someone who declined an account is not asked
     again on every load. Cleared from Settings when they want to sign in. */
  const [localOnly, setLocalOnlyState] = useState(
    () => localStorage.getItem(LOCAL_ONLY_KEY) === '1',
  )
  const setLocalOnly = useCallback((v: boolean) => {
    if (v) localStorage.setItem(LOCAL_ONLY_KEY, '1')
    else localStorage.removeItem(LOCAL_ONLY_KEY)
    setLocalOnlyState(v)
  }, [])

  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!cloudEnabled())
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  /* undefined = not looked up yet, null = signed in with no handle. The
     distinction matters: the gate must not flash on a slow lookup. */
  const [username, setUsernameState] = useState<string | null | undefined>(undefined)
  /* The account whose cloud copy has finished landing. Publishing waits on it;
     see the publish effect for why `syncing` cannot do that job. */
  const [reconciledFor, setReconciledFor] = useState<string | null>(null)

  /* The last snapshot known to match the server. `pushChanges` diffs against
     it, so it must only advance when a push actually succeeds — otherwise a
     failed write is silently forgotten and that change never reaches the
     cloud. */
  const syncedRef = useRef<AppData | null>(null)
  /* Set while the initial cloud read is replacing local state, to stop the
     save effect from immediately pushing that same data back up. */
  const hydratingRef = useRef(false)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    /* The fragment has to be consumed before the first getSession, or an OAuth
       return resolves as "signed out" and paints the sign-in screen over a
       session that actually exists. */
    void consumeAuthFragment().then(() =>
      client.auth.getSession().then(({ data: d }) => {
        setSession(d.session)
        setAuthReady(true)
      }),
    )
    const { data: sub } = client.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  /* On sign-in, reconcile with the cloud.

     An empty cloud means this account has never synced, so whatever is on this
     device is lifted up rather than being wiped by an empty server — that is
     the upgrade path from the localStorage-only version. Otherwise the cloud
     copy wins, because it is the one that has seen every device. */
  const userId = session?.user.id ?? null
  useEffect(() => {
    if (!userId) {
      syncedRef.current = null
      setUsernameState(undefined)
      setReconciledFor(null)
      return
    }
    let live = true
    setUsernameState(undefined)
    void fetchUsername()
      .then((u) => live && setUsernameState(u))
      .catch(() => live && setUsernameState(null))
    setSyncing(true)
    setSyncError(null)
    ;(async () => {
      try {
        const remote = await fetchAll()
        if (!live) return
        if (remote) {
          hydratingRef.current = true
          /* The planner is not in any cloud collection yet, so the server has
             nothing to say about it and `remote` carries empty arrays. Taking
             them at face value would delete a week of planning the moment you
             signed in on the device that made it. Carried across until the
             three tables exist; see AppData for the rest of the note. */
          const local = localAdapter.load()
          const merged: AppData = {
            ...remote,
            planEntries: local?.planEntries ?? [],
            shopping: local?.shopping ?? [],
            pantry: local?.pantry ?? [],
          }
          setData(merged)
          syncedRef.current = merged
          localAdapter.save(merged)
        } else {
          const local = localAdapter.load() ?? defaultData()
          await pushChanges(null, local)
          if (!live) return
          syncedRef.current = local
        }
        setReconciledFor(userId)
      } catch (err) {
        if (live) setSyncError((err as Error).message)
      } finally {
        if (live) setSyncing(false)
      }
    })()
    return () => {
      live = false
    }
  }, [userId])

  // Persist on every change. Debounced so rapid edits (sliders, steppers)
  // don't thrash localStorage or fire a request per keystroke.
  const saveTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      localAdapter.save(data)

      if (hydratingRef.current) {
        // This render is the cloud read landing, not a user edit.
        hydratingRef.current = false
        return
      }
      if (!userId || !cloudEnabled()) return

      const from = syncedRef.current
      pushChanges(from, data)
        .then(() => {
          syncedRef.current = data
          setSyncError(null)
        })
        .catch((err) => setSyncError((err as Error).message))
    }, 250)
    return () => window.clearTimeout(saveTimer.current)
  }, [data, userId])

  const update = useCallback((fn: (d: AppData) => void) => {
    setData((prev) => {
      const next: AppData = structuredClone(prev)
      fn(next)
      return next
    })
  }, [])

  /* ---------------------------------------------------------- navigation -- */

  const push = useCallback((r: Route) => {
    setStack((s) => [...s, r])
    window.history.pushState({ depth: Date.now() }, '')
  }, [])

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  }, [])

  const popTo = useCallback((depth: number) => {
    setStack((s) => (depth < s.length ? s.slice(0, Math.max(1, depth)) : s))
  }, [])

  const setTab = useCallback((t: TabKey) => {
    setActiveTab(t)
    setStack([{ name: 'tab', tab: t }])
  }, [])

  // Wire the browser/system back gesture to popping the screen stack.
  useEffect(() => {
    const onPop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const route = stack[stack.length - 1]

  /* ------------------------------------------------------------- derived -- */

  const profile = data.profile
  const settings = data.settings

  const age = useMemo(() => ageOf(profile.birthDate), [profile.birthDate])

  const latestWeight = useMemo(() => {
    if (!data.weights.length) return profile.currentWeight
    return [...data.weights].sort((a, b) => (a.date < b.date ? 1 : -1))[0].weight
  }, [data.weights, profile.currentWeight])

  /** Exercise on the selected day feeds back into the hydration target. */
  const exerciseMinutesToday = useMemo(
    () =>
      data.exerciseEntries
        .filter((e) => e.date === date)
        .reduce((s, e) => s + (e.minutes ?? 0), 0),
    [data.exerciseEntries, date]
  )

  const plan = useMemo(
    () => resolvePlan(profile, age, latestWeight, exerciseMinutesToday),
    [profile, age, latestWeight, exerciseMinutesToday]
  )

  const calorieTarget = plan.calories
  const macroTargets = plan.macros
  const waterTarget = plan.waterMl
  const maintenance = plan.maintenance

  const entriesFor = useCallback(
    (d: string, meal?: MealKey) =>
      data.foodEntries.filter((e) => e.date === d && (!meal || e.meal === meal)),
    [data.foodEntries]
  )

  const exercisesFor = useCallback(
    (d: string) => data.exerciseEntries.filter((e) => e.date === d),
    [data.exerciseEntries]
  )

  const dayLog = useCallback(
    (d: string): DayLog => data.days[d] ?? { water: 0, completed: false },
    [data.days]
  )

  const totalsFor = useCallback(
    (d: string): DayTotals => {
      const entries = data.foodEntries.filter((e) => e.date === d)
      const byMeal = {} as Record<MealKey, Nutrients>
      for (const m of MEAL_KEYS) {
        byMeal[m] = sumNutrients(entries.filter((e) => e.meal === m).map((e) => e.nutrients))
      }
      const nutrients = sumNutrients(entries.map((e) => e.nutrients))

      const ex = data.exerciseEntries.filter((e) => e.date === d)
      const exerciseCalories = ex.reduce((s, e) => s + (e.caloriesBurned ?? 0), 0)
      const exerciseMinutes = ex.reduce((s, e) => s + (e.minutes ?? 0), 0)

      const credit = settings.exerciseAddsCalories ? exerciseCalories : 0
      return {
        nutrients,
        byMeal,
        exerciseCalories,
        exerciseMinutes,
        goal: calorieTarget,
        remaining: calorieTarget - nutrients.calories + credit,
        maintenance,
      }
    },
    [
      data.foodEntries,
      data.exerciseEntries,
      calorieTarget,
      maintenance,
      settings.exerciseAddsCalories,
    ]
  )

  const resolveFood = useCallback(
    (id: string): Food | undefined =>
      SEED_BY_ID.get(id) ??
      data.customFoods.find((f) => f.id === id) ??
      data.foodCache[id],
    [data.customFoods, data.foodCache]
  )

  /* ------------------------------------------------------------- streaks -- */

  /**
   * Days with calories on them. One rule, in one place: Home's week strip fills
   * a circle by it, the streak counts by it, and followers are shown it, so the
   * three cannot drift apart. It used to live inside Home, which was fine until
   * something outside Home needed it.
   */
  const loggedDates = useMemo(() => {
    const s = new Set<string>()
    for (const e of data.foodEntries) if (e.nutrients.calories > 0) s.add(e.date)
    return s
  }, [data.foodEntries])

  /* Counting starts at yesterday when today is still empty. Anchoring on today
     would reset a long streak every midnight and hand it back after breakfast,
     which reads as losing the streak for having not eaten yet. */
  const logStreak = useMemo(() => {
    const realToday = today()
    let cursor = loggedDates.has(realToday) ? realToday : addDays(realToday, -1)
    let count = 0
    // Bounded so a corrupt date can never spin here forever.
    while (count < 3650 && loggedDates.has(cursor)) {
      count++
      cursor = addDays(cursor, -1)
    }
    return count
  }, [loggedDates])

  const lastLogged = useMemo(() => {
    let best: string | null = null
    for (const d of loggedDates) if (!best || d > best) best = d
    return best
  }, [loggedDates])

  /* ---------------------------------------------------------- publishing -- */

  /**
   * What this account shows its followers.
   *
   * Filtered here, on the way out, rather than at read time. A value the user
   * has not agreed to share is never written, so it is not sitting in a
   * world-adjacent table waiting on a policy to keep being correct. Turning a
   * toggle off therefore *removes* the value on the next publish rather than
   * hiding it.
   */
  const published = useMemo<PublishedProfile>(() => {
    const s = data.settings
    if (!s.shareName && !s.shareStreak && !s.shareCalories) return NOTHING_PUBLISHED

    const totals = totalsFor(today())
    return {
      display_name: s.shareName ? data.profile.name || null : null,
      streak: s.shareStreak ? logStreak : null,
      last_logged: s.shareStreak ? lastLogged : null,
      calories: s.shareCalories ? Math.round(totals.nutrients.calories) : null,
      calorie_goal: s.shareCalories ? Math.round(totals.goal) : null,
    }
  }, [data.settings, data.profile.name, logStreak, lastLogged, totalsFor])

  /* Held so an unchanged summary does not become a write on every keystroke —
     this sits downstream of the whole diary, which changes constantly, while
     what it publishes changes a few times a day. Cleared on failure so the
     next change retries rather than assuming the server agrees. */
  const publishedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!userId || !cloudEnabled()) {
      publishedRef.current = null
      return
    }
    /* Not until this account's cloud copy has landed. Before that `data` is
       still whatever the device happened to hold, which after switching
       accounts is the *previous* user's name — and publishing it, even for a
       moment, puts it in front of the new account's followers.
       `syncing` cannot gate this. It is set inside the reconcile effect, which
       runs in the same commit as this one, so the value read here is still the
       `false` from before sign-in and the stale publish goes out anyway. This
       flag is written when the read finishes, so by the time it matches there
       is nothing stale left to send. */
    if (reconciledFor !== userId) return

    const json = JSON.stringify(published)
    if (publishedRef.current === json) return
    publishedRef.current = json
    publishProfile(published).catch(() => {
      publishedRef.current = null
    })
  }, [userId, reconciledFor, published])

  /* ----------------------------------------------------------- mutations -- */

  const logFood = useCallback<Ctx['logFood']>(
    (opts) => {
      update((d) => {
        const prior = opts.entryId
          ? d.foodEntries.find((e) => e.id === opts.entryId)
          : undefined
        // Editing keeps the entry where it already sits; new entries land in
        // whichever period the clock says it is.
        const meal =
          opts.meal ?? prior?.meal ?? periodForDate(Date.now())

        const entry: FoodEntry = {
          id: opts.entryId ?? uid('e'),
          date: opts.date,
          meal,
          foodId: opts.food.id,
          name: opts.food.name,
          brand: opts.food.brand,
          servingLabel: opts.servingLabel,
          servings: opts.servings,
          nutrients: opts.nutrients,
          source: opts.food.source,
          loggedAt: Date.now(),
        }
        const i = d.foodEntries.findIndex((e) => e.id === entry.id)
        if (i >= 0) d.foodEntries[i] = entry
        else d.foodEntries.push(entry)

        // Network foods are cached so past entries stay openable offline.
        if (opts.food.source === 'off') d.foodCache[opts.food.id] = opts.food

        d.recentFoodIds = [
          opts.food.id,
          ...d.recentFoodIds.filter((x) => x !== opts.food.id),
        ].slice(0, 80)
      })
    },
    [update]
  )

  const logItems = useCallback<Ctx['logItems']>(
    (items, d, source) => {
      const meal = periodForDate(Date.now())
      update((draft) => {
        for (const it of items) {
          draft.foodEntries.push({
            id: uid('e'),
            date: d,
            meal,
            foodId: it.foodId,
            name: it.name,
            brand: it.brand,
            servingLabel: it.servingLabel,
            servings: it.servings,
            nutrients: it.nutrients,
            source,
            loggedAt: Date.now(),
          })
        }
      })
    },
    [update]
  )

  const value: Ctx = {
    data,
    profile,
    settings,
    date,
    setDate,
    route,
    stack,
    push,
    pop,
    popTo,
    setTab,
    activeTab,
    age,
    plan,
    calorieTarget,
    macroTargets,
    waterTarget,
    totalsFor,
    entriesFor,
    exercisesFor,
    dayLog,
    resolveFood,
    latestWeight,
    logStreak,
    lastLogged,
    update,
    logFood,
    logItems,

    deleteEntry: (id) =>
      update((d) => {
        d.foodEntries = d.foodEntries.filter((e) => e.id !== id)
      }),

    moveEntry: (id, meal) =>
      update((d) => {
        const e = d.foodEntries.find((x) => x.id === id)
        if (e) e.meal = meal
      }),

    copyDay: (from, to) =>
      update((d) => {
        const src = d.foodEntries.filter((e) => e.date === from)
        for (const e of src) {
          d.foodEntries.push({ ...e, id: uid('e'), date: to, loggedAt: Date.now() })
        }
      }),

    logExercise: (e) =>
      update((d) => {
        const entry: ExerciseEntry = { ...e, id: e.id ?? uid('x'), loggedAt: Date.now() }
        const i = d.exerciseEntries.findIndex((x) => x.id === entry.id)
        if (i >= 0) d.exerciseEntries[i] = entry
        else d.exerciseEntries.push(entry)
      }),

    deleteExercise: (id) =>
      update((d) => {
        d.exerciseEntries = d.exerciseEntries.filter((e) => e.id !== id)
      }),

    setWater: (d0, ml) =>
      update((d) => {
        d.days[d0] = { ...(d.days[d0] ?? { water: 0, completed: false }), water: Math.max(0, ml) }
      }),

    setCompleted: (d0, done) =>
      update((d) => {
        d.days[d0] = {
          ...(d.days[d0] ?? { water: 0, completed: false }),
          completed: done,
        }
      }),

    addWeight: (d0, lb) =>
      update((d) => {
        const existing = d.weights.findIndex((w) => w.date === d0)
        const rec: WeightEntry = { date: d0, weight: lb }
        if (existing >= 0) d.weights[existing] = rec
        else d.weights.push(rec)
        d.weights.sort((a, b) => (a.date < b.date ? -1 : 1))
        d.profile.currentWeight = lb
      }),

    deleteWeight: (d0) =>
      update((d) => {
        d.weights = d.weights.filter((w) => w.date !== d0)
      }),

    addMeasurement: (m) =>
      update((d) => {
        const i = d.measurements.findIndex((x) => x.date === m.date && x.key === m.key)
        if (i >= 0) d.measurements[i] = m
        else d.measurements.push(m)
        d.measurements.sort((a, b) => (a.date < b.date ? -1 : 1))
      }),

    saveProfile: (p) =>
      update((d) => {
        d.profile = { ...d.profile, ...p }
      }),

    saveSettings: (s) =>
      update((d) => {
        d.settings = { ...d.settings, ...s }
      }),

    saveCustomFood: (f) =>
      update((d) => {
        const i = d.customFoods.findIndex((x) => x.id === f.id)
        if (i >= 0) d.customFoods[i] = f
        else d.customFoods.unshift(f)
      }),

    deleteCustomFood: (id) =>
      update((d) => {
        d.customFoods = d.customFoods.filter((f) => f.id !== id)
      }),

    startFast: () =>
      update((d) => {
        // At most one fast can run at a time; starting closes any stray one.
        for (const f of d.fasts) if (!f.endedAt) f.endedAt = Date.now()
        d.fasts.unshift({
          id: uid('f'),
          startedAt: Date.now(),
          targetHours: targetHoursFor(d.fasting),
          protocol: d.fasting.protocol,
        })
        d.fasting.enabled = true
      }),

    endFast: (id) =>
      update((d) => {
        const f = d.fasts.find((x) => x.id === id)
        if (f && !f.endedAt) f.endedAt = Date.now()
      }),

    deleteFast: (id) =>
      update((d) => {
        d.fasts = d.fasts.filter((f) => f.id !== id)
      }),

    saveFasting: (s) =>
      update((d) => {
        d.fasting = { ...d.fasting, ...s }
      }),

    saveScannedFood: (f) =>
      update((d) => {
        // Only keep entries carrying real nutrition — a barcode that resolved
        // to an empty record is worse than no result at all.
        if (f.nutrients.calories <= 0 && f.nutrients.protein <= 0 && f.nutrients.carbs <= 0) {
          return
        }
        d.foodCache[f.id] = f
        if (f.barcode) d.scannedBarcodes[f.barcode] = f.id
      }),

    toggleFavorite: (id) =>
      update((d) => {
        d.favoriteFoodIds = d.favoriteFoodIds.includes(id)
          ? d.favoriteFoodIds.filter((x) => x !== id)
          : [id, ...d.favoriteFoodIds]
      }),

    saveMeal: (m) =>
      update((d) => {
        const i = d.savedMeals.findIndex((x) => x.id === m.id)
        if (i >= 0) d.savedMeals[i] = m
        else d.savedMeals.unshift(m)
      }),

    deleteMeal: (id) =>
      update((d) => {
        d.savedMeals = d.savedMeals.filter((m) => m.id !== id)
      }),

    saveRecipe: (r) =>
      update((d) => {
        const i = d.recipes.findIndex((x) => x.id === r.id)
        if (i >= 0) d.recipes[i] = r
        else d.recipes.unshift(r)
      }),

    deleteRecipe: (id) =>
      update((d) => {
        d.recipes = d.recipes.filter((r) => r.id !== id)
      }),

    /* ------------------------------------------------------ meal planning -- */

    planMeal: ({ recipeId, date: d, slot, servings }) =>
      update((draft) => {
        const recipe = findRecipe(draft.recipes, recipeId)
        draft.planEntries.push({
          id: uid('p'),
          date: d,
          slot,
          recipeId,
          /* One portion by default, not the whole recipe. A tray of chili makes
             six and planning it as six for Tuesday would put six dinners'
             calories on one day. */
          servings: servings ?? 1,
        })
        void recipe
      }),

    unplanMeal: (id) =>
      update((d) => {
        d.planEntries = d.planEntries.filter((p) => p.id !== id)
      }),

    setPlanServings: (id, servings) =>
      update((d) => {
        const p = d.planEntries.find((x) => x.id === id)
        if (p) p.servings = Math.max(0.25, servings)
      }),

    movePlanEntry: (id, date: string, slot) =>
      update((d) => {
        const p = d.planEntries.find((x) => x.id === id)
        if (!p) return
        p.date = date
        p.slot = slot
        /* Moving a meal that was already eaten would leave the diary and the
           plan disagreeing about which day it happened on. The diary is the
           record, so the plan gives up its claim rather than rewriting it. */
        p.loggedAt = undefined
      }),

    logPlanEntry: (id) =>
      update((d) => {
        const p = d.planEntries.find((x) => x.id === id)
        if (!p || p.loggedAt) return
        const recipe = findRecipe(d.recipes, p.recipeId)
        if (!recipe) return

        const resolved = resolveRecipe(recipe, [
          ...d.customFoods,
          ...Object.values(d.foodCache),
        ])
        const made = Math.max(1, recipe.servingsMade)

        /* The whole recipe scaled to the planned portions. Logged as one entry
           per ingredient rather than a single lumped row, so the diary keeps
           showing what the food actually was and the nutrient breakdown stays
           real. */
        const meal = SLOT_TO_PERIOD[p.slot]
        for (const item of resolved.items) {
          d.foodEntries.push({
            id: uid('e'),
            date: p.date,
            meal,
            foodId: item.foodId,
            name: item.name,
            brand: item.brand,
            servingLabel: item.servingLabel,
            servings: (item.servings * p.servings) / made,
            nutrients: scaleNutrientsLocal(item.nutrients, p.servings / made),
            source: 'recipe',
            loggedAt: Date.now(),
          })
        }
        p.loggedAt = Date.now()
      }),

    planFor: (d0) => data.planEntries.filter((p) => p.date === d0),

    plannedCalories: (d0) => {
      let total = 0
      for (const p of data.planEntries) {
        if (p.date !== d0) continue
        const recipe = findRecipe(data.recipes, p.recipeId)
        if (!recipe) continue
        const resolved = resolveRecipe(recipe, [
          ...data.customFoods,
          ...Object.values(data.foodCache),
        ])
        total += resolved.perServing.calories * p.servings
      }
      return Math.round(total)
    },

    /* ----------------------------------------------------------- shopping -- */

    addRecipeToShoppingList: (recipeId, servings = 1) => {
      let added = 0
      update((d) => {
        const recipe = findRecipe(d.recipes, recipeId)
        if (!recipe) return
        added = mergeIntoList(d, recipe, servings)
      })
      return added
    },

    addPlanToShoppingList: (from, to) => {
      let added = 0
      update((d) => {
        for (const p of d.planEntries) {
          if (p.date < from || p.date > to) continue
          const recipe = findRecipe(d.recipes, p.recipeId)
          if (!recipe) continue
          added += mergeIntoList(d, recipe, p.servings / Math.max(1, recipe.servingsMade))
        }
      })
      return added
    },

    toggleShoppingItem: (id) =>
      update((d) => {
        const it = d.shopping.find((x) => x.id === id)
        if (it) it.checked = !it.checked
      }),

    addShoppingItem: (name) =>
      update((d) => {
        const clean = name.trim()
        if (!clean) return
        d.shopping.push({
          id: uid('s'),
          name: clean,
          aisle: aisleFor(clean),
          checked: false,
        })
      }),

    removeShoppingItem: (id) =>
      update((d) => {
        d.shopping = d.shopping.filter((x) => x.id !== id)
      }),

    clearCheckedShopping: () =>
      update((d) => {
        d.shopping = d.shopping.filter((x) => !x.checked)
      }),

    togglePantry: (name) =>
      update((d) => {
        const clean = name.trim().toLowerCase()
        if (!clean) return
        d.pantry = d.pantry.includes(clean)
          ? d.pantry.filter((x) => x !== clean)
          : [...d.pantry, clean]
      }),

    resetAll: () => {
      const fresh = defaultData()
      localAdapter.clear()
      setData(fresh)
      setStack([{ name: 'tab', tab: 'today' }])
      setActiveTab('today')

      /* Clearing only this device would be a lie when there is an account —
         the next sync would pull everything straight back down. Marking the
         cloud as empty afterwards stops the save effect from re-uploading the
         blank slate as a diff against stale state. */
      if (userId && cloudEnabled()) {
        deleteAll()
          .then(() => {
            syncedRef.current = null
            setSyncError(null)
          })
          .catch((err) => setSyncError((err as Error).message))
      }
    },

    session,
    authReady,
    username,
    setUsername: setUsernameState,
    syncing,
    syncError,
    localOnly,
    setLocalOnly,
    signOut: async () => {
      if (!supabase) return
      await supabase.auth.signOut()
      // Drop back to whatever this device holds, rather than showing another
      // account's data until the next load.
      syncedRef.current = null
      setLocalOnly(false)
      setData(localAdapter.load() ?? defaultData())
      setStack([{ name: 'tab', tab: 'today' }])
      setActiveTab('today')
    },
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** Convenience for building an empty nutrients object in components. */
export { emptyNutrients }
