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
  Profile,
  Recipe,
  SavedMeal,
  Settings,
  FastingSettings,
  WeightEntry,
} from '../types'
import { MEAL_KEYS, periodForDate } from '../types'
import type { Session } from '@supabase/supabase-js'
import { defaultData, localAdapter } from '../lib/storage'
import { cloudEnabled, consumeAuthFragment, supabase } from '../lib/supabase'
import { deleteAll, fetchAll, fetchUsername, pushChanges } from '../services/cloud'
import { today } from '../lib/dates'

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
          setData(remote)
          syncedRef.current = remote
          localAdapter.save(remote)
        } else {
          const local = localAdapter.load() ?? defaultData()
          await pushChanges(null, local)
          if (!live) return
          syncedRef.current = local
        }
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
