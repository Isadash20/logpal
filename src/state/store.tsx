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
  ShareLevel,
  ExerciseEntry,
  Food,
  FoodEntry,
  MealItem,
  MealKey,
  MeasurementEntry,
  LiftEntry,
  Nutrients,
  PlanEntry,
  Profile,
  Recipe,
  SavedMeal,
  Settings,
  FastingSettings,
  MealSlot,
  WeightEntry,
  NutrientKey,
} from '../types'
import { MEAL_KEYS, periodForDate } from '../types'
import { aisleFor } from '../data/aisles'
import { findRecipe, resolveRecipe } from '../services/recipes'
import { formatAmountFor, parseIngredient, unitPrefsFrom } from '../lib/ingredients'
import type { Session } from '@supabase/supabase-js'
import { defaultData, localAdapter, syncedStore } from '../lib/storage'
import { mergeEdits } from '../services/merge'
import { cloudEnabled, consumeAuthFragment, installNativeAuthListener, supabase } from '../lib/supabase'
import {
  deleteAccount as deleteAccountRemote,
  deleteAll,
  fetchAll,
  fetchUsername,
  pushChanges,
} from '../services/cloud'
import { NOTHING_PUBLISHED, publishProfile, type PublishedProfile } from '../services/social'
import { announce, joinCrew } from '../services/crews'
import { publishDays } from '../services/challenges'
import { parseInvite } from '../lib/crews'
import { weekCounts } from '../lib/weekly'
import { addDays, today, lastNDays } from '../lib/dates'
import { applyRegion, resolveTimeZone } from '../i18n'
import { App as CapApp } from '@capacitor/app'
import { LB_PER_KG } from '../lib/units'
import {
  healthSupported,
  loadHealthLast,
  mergeHealth,
  readHealth,
  requestHealthAccess,
  saveHealthLast,
  writeHealthDay,
  type DayWrite,
  type HealthMerge,
  type HealthSyncResult,
  type WriteStatus,
} from '../services/health'

/** How far back a Health sync looks. Enough to fill a fresh connection. */
const HEALTH_WINDOW_DAYS = 30

/* Set the moment a push to the cloud starts, cleared only once the server
   confirms it, so a push that fails, or that is cut off by the app being
   killed mid-request, leaves the flag behind. Read at the next sign-in
   reconcile, where it means "this device has edits the server never saw", so
   the device wins instead of being overwritten. */
const PUSH_FAILED_KEY = 'logpal.pushFailed'
let pushesInFlight = 0
function pushFailed(): boolean {
  try {
    return localStorage.getItem(PUSH_FAILED_KEY) === '1'
  } catch {
    return false
  }
}
function markPushFailed(failed: boolean) {
  try {
    if (failed) localStorage.setItem(PUSH_FAILED_KEY, '1')
    else localStorage.removeItem(PUSH_FAILED_KEY)
  } catch {
    /* private mode; the next launch simply trusts the cloud */
  }
}

/** Set when someone declines an account; keeps them out of the auth screen. */
const LOCAL_ONLY_KEY = 'logpal.localOnly'
const INVITE_KEY = 'logpal.invite'
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
import type { LabelPrefill } from '../lib/nutritionLabel'

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
 * the Food List is skipped. That is the whole point of keeping one.
 *
 * Returns how many lines were newly added, so the caller can say so.
 */
function mergeIntoList(
  d: AppData,
  recipe: Recipe,
  scale: number,
  /* Which lines to take, verbatim. Absent means all of them, which is what
     adding a whole recipe still does. */
  only?: string[],
): number {
  const all = recipe.ingredients ?? []
  const lines = only ? all.filter((l) => only.includes(l)) : all
  // The list is written in the reader's own units, like the recipe it came
  // from. A shopping list in cups for someone who buys in grams is a list
  // they have to convert in the aisle.
  const prefs = unitPrefsFrom(d.settings)
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
        existing.amount = formatAmountFor(prev.qty + qty, parsed.unit, prefs)
      }
      if (!existing.fromRecipeIds?.includes(recipe.id)) {
        existing.fromRecipeIds = [...(existing.fromRecipeIds ?? []), recipe.id]
      }
      continue
    }

    d.shopping.push({
      id: uid('s'),
      name,
      amount: qty != null ? formatAmountFor(qty, parsed.unit, prefs) : undefined,
      aisle: aisleFor(name),
      checked: false,
      fromRecipeIds: [recipe.id],
    })
    added++
  }

  return added
}

/* ------------------------------------------------------------ navigation -- */

export type TabKey = 'today' | 'nutriscan' | 'plan' | 'friends' | 'progress' | 'more'

export type Route =
  | { name: 'tab'; tab: TabKey }
  | { name: 'meal'; date: string; meal: MealKey }
  | { name: 'nutrition'; date: string }
  | { name: 'calories'; date: string }
  | { name: 'macros'; date: string }
  | { name: 'nutrient'; date: string; key: NutrientKey }
  | { name: 'foodSearch'; date: string; meal?: MealKey }
  | {
      name: 'foodDetail'
      food: Food
      date: string
      /* Which meal it lands in. Carried from wherever logging started, so
         tapping Log on the Dinner row opens with Dinner already chosen. */
      meal?: MealKey
      entryId?: string
      servings?: number
      servingLabel?: string
    }
  | { name: 'createFood'; barcode?: string; returnTo?: { date: string }; prefill?: LabelPrefill }
  | { name: 'nutriScan'; date: string; mode?: 'log' | 'worth' }
  | { name: 'quickAdd'; date: string; meal?: MealKey }
  /* `mode` decides where a scan lands: the diary, or the worth-it screen. The
     camera and the lookup are identical either way, so they are not duplicated. */
  | { name: 'scan'; date: string; mode?: 'log' | 'worth' }
  | { name: 'worthIt'; date: string; food?: Food }
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
  | { name: 'sleep'; date: string }
  | { name: 'steps'; date: string }
  | { name: 'meals' }
  | { name: 'mealEditor'; mealId?: string }
  | { name: 'recipes' }
  | { name: 'recipeEditor'; recipeId?: string }
  | { name: 'myFoods' }
  | { name: 'goals' }
  | { name: 'weightEntry' }
  | { name: 'measurement'; key: string }
  | { name: 'lift'; exercise: string }
  | { name: 'weekReview'; start: string }
  | { name: 'progressPhotos' }
  | { name: 'fasting' }
  | { name: 'foodsHub' }
  | { name: 'planHub' }
  | { name: 'prefsProfile' }
  | { name: 'prefsUnits' }
  | { name: 'prefsAppearance' }
  | { name: 'prefsRegion' }
  | { name: 'prefsHealth' }
  | { name: 'friends' }
  | { name: 'friendProfile'; userId: string; username: string }
  | { name: 'friendsSharing' }
  | { name: 'crews' }
  | { name: 'crew'; id: string }
  | { name: 'challenges' }
  | { name: 'challenge'; id: string }
  | { name: 'mealPlanner' }
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
    /** Omitted for new entries, derived from the clock. */
    meal?: MealKey
  }): void
  deleteEntry(id: string): void
  moveEntry(id: string, meal: MealKey): void
  copyDay(from: string, to: string): void
  logExercise(e: Omit<ExerciseEntry, 'id' | 'loggedAt'> & { id?: string }): void
  deleteExercise(id: string): void
  setWater(date: string, ml: number): void
  setSleep(date: string, minutes: number | null): void
  setSteps(date: string, steps: number | null): void
  setCompleted(date: string, done: boolean): void
  addWeight(date: string, lb: number): void
  deleteWeight(date: string): void
  addMeasurement(m: MeasurementEntry): void
  /** Returns whether this beat every earlier weight for the lift. */
  addLift(e: Omit<LiftEntry, 'id' | 'loggedAt'>): { pr: boolean; prevBest: number }
  deleteLift(id: string): void
  saveProfile(p: Partial<Profile>): void
  saveSettings(s: Partial<Settings>): void
  /* Apple Health. `healthSupported` is false outside the iOS app. */
  healthSupported: boolean
  healthBusy: boolean
  healthLast: HealthSyncResult | null
  healthWrites: WriteStatus | null
  /** Shows the system permission sheet, turns the setting on, syncs once. */
  connectHealth(): Promise<void>
  syncHealth(): Promise<void>
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
  /** Moves a planned meal to another day or slot, what drag-and-drop commits. */
  movePlanEntry(id: string, date: string, slot: MealSlot): void
  /** Writes a planned meal into the diary as real food entries. */
  logPlanEntry(id: string): void
  planFor(date: string): PlanEntry[]
  /** Planned calories for a day, whether or not they have been eaten. */
  plannedCalories(date: string): number

  // shopping
  /** Adds one recipe's ingredients, merging with what is already listed. */
  addRecipeToShoppingList(recipeId: string, servings?: number, only?: string[]): number
  /** Adds everything planned between two dates. */
  addPlanToShoppingList(from: string, to: string): number
  toggleShoppingItem(id: string): void
  addShoppingItem(name: string): void
  removeShoppingItem(id: string): void
  clearCheckedShopping(): void
  togglePantry(name: string): void

  // recipe library
  /** Bookmarks a catalogue recipe, or removes the bookmark. */
  /**
   * Bookmarks a recipe, or removes the bookmark.
   *
   * One action behind two controls. The star on a card and the bookmark on the
   * recipe itself, because they were separate states and a recipe could end up
   * starred but not saved, or saved three times over. Writes both the id (which
   * the Plan shelf reads) and a saved meal (which the food search reads), so
   * the two places it shows up can never disagree.
   */
  toggleRecipeBookmark(recipe: Recipe, items: MealItem[]): void
  isRecipeSaved(id: string): boolean
  /** Remembers a search so the box can offer it back. */
  rememberSearch(q: string): void
  forgetSearch(q: string): void

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
  /** Deletes the account and everything in it, then drops to a fresh device-local app. */
  deleteAccount(): Promise<void>
  /** True when the user chose to carry on without an account on this device. */
  localOnly: boolean
  /** An invite code from a /join link, held until the account exists to join with. */
  pendingInvite: string | null
  dismissInvite(): void
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
  const [data, setData] = useState<AppData>(() => {
    const loaded = localAdapter.load() ?? defaultData()
    /* Before the first render, so `today()` and every `t()` below already
       speak the saved language and zone. */
    applyRegion(loaded.settings)
    return loaded
  })
  const [date, setDate] = useState(today())

  /* Settings can change from any screen, and from a sync merge. */
  useEffect(() => {
    applyRegion(data.settings)
  }, [data.settings.language, data.settings.timeZone])
  const [activeTab, setActiveTab] = useState<TabKey>('today')
  const [stack, setStack] = useState<Route[]>(() =>
    /* `?crewdemo` on a dev server opens the sample crew for screenshots. */
    import.meta.env.DEV && new URLSearchParams(window.location.search).has('crewdemo')
      ? [{ name: 'tab', tab: 'friends' }, { name: 'crew', id: 'demo' }]
      : [{ name: 'tab', tab: 'today' }],
  )

  /* Remembered per device, so someone who declined an account is not asked
     again on every load. Cleared from Settings when they want to sign in. */
  const [localOnly, setLocalOnlyState] = useState(
    () => localStorage.getItem(LOCAL_ONLY_KEY) === '1',
  )

  /* A crew invite, from `/join/CODE` on the web or `logpal://join/CODE` in
     the app. Kept on the device until there is an account to join with, so
     the person can sign up (and confirm an email) and still land in the crew.
     The join itself is the effect further down. */
  const [pendingInvite, setPendingInvite] = useState<string | null>(() => {
    const fromUrl = parseInvite(window.location.pathname)
    if (fromUrl) {
      localStorage.setItem(INVITE_KEY, fromUrl)
      window.history.replaceState({}, '', '/')
      return fromUrl
    }
    return localStorage.getItem(INVITE_KEY)
  })
  const dismissInvite = useCallback(() => {
    localStorage.removeItem(INVITE_KEY)
    setPendingInvite(null)
  }, [])
  useEffect(() => {
    const sub = CapApp.addListener('appUrlOpen', ({ url }) => {
      const code = parseInvite(url)
      if (!code) return
      localStorage.setItem(INVITE_KEY, code)
      setPendingInvite(code)
    })
    return () => void sub.then((s) => s.remove())
  }, [])
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
     it, so it must only advance when a push actually succeeds, otherwise a
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
    installNativeAuthListener()
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
     device is lifted up rather than being wiped by an empty server. That is
     the upgrade path from the localStorage-only version. Otherwise the cloud
     copy wins, because it is the one that has seen every device. */
  const userId = session?.user.id ?? null
  const userIdRef = useRef(userId)
  userIdRef.current = userId
  const dataRef = useRef(data)
  dataRef.current = data

  /* The synced snapshot is kept on disk too, so the next launch can still
     tell this device's edits from the server's. */
  const setSynced = useCallback((d: AppData | null) => {
    syncedRef.current = d
    if (d) syncedStore.save(d)
    else syncedStore.clear()
  }, [])

  /* Pull the cloud copy and land it over what this device holds.

     With a synced snapshot the two are merged three ways: whatever this
     device changed since it last matched the server stays, everything else
     is the server's, so water logged on the iPad and water logged on the
     phone both survive. Without one (first sign-in on this device, or an
     old build) the push flag decides which side wins outright. */
  const pullingRef = useRef(false)
  const pullCloud = useCallback(
    async (uid: string, firstSignIn: boolean) => {
      if (pullingRef.current) return
      pullingRef.current = true
      try {
        const remote = await fetchAll()
        if (userIdRef.current !== uid) return
        const local = dataRef.current
        if (!remote) {
          /* An empty cloud means this account has never synced, so lift the
             device up rather than wiping it. On a later pull an empty server
             means it was emptied on purpose; leave it. */
          if (!firstSignIn) return
          await pushChanges(null, local)
          if (userIdRef.current !== uid) return
          setSynced(local)
          return
        }
        const synced = syncedRef.current ?? syncedStore.load()
        const merged: AppData = synced
          ? mergeEdits(synced, local, remote)
          : pushFailed()
            ? local
            : {
                ...remote,
                planEntries: local.planEntries,
                shopping: local.shopping,
                pantry: local.pantry,
                savedRecipeIds: local.savedRecipeIds,
                recentSearches: local.recentSearches,
                lifts: local.lifts,
              }
        hydratingRef.current = true
        setData(merged)
        localAdapter.save(merged)
        /* The server is at `remote` until this push lands; recording that is
           what lets a failed push be retried as a diff at the next launch. */
        setSynced(remote)
        await pushChanges(remote, merged)
        if (userIdRef.current !== uid) return
        setSynced(merged)
        markPushFailed(false)
      } finally {
        pullingRef.current = false
      }
    },
    [setSynced],
  )

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
    pullCloud(userId, true)
      .then(() => live && setReconciledFor(userId))
      .catch((err) => live && setSyncError((err as Error).message))
      .finally(() => live && setSyncing(false))
    return () => {
      live = false
    }
  }, [userId, pullCloud])

  /* Coming back to the foreground pulls again, so a cup logged on the other
     device shows up here without a relaunch. */
  useEffect(() => {
    if (!userId || reconciledFor !== userId || !cloudEnabled()) return
    const pull = () => {
      pullCloud(userId, false).catch((err) => setSyncError((err as Error).message))
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull()
    }
    document.addEventListener('visibilitychange', onVisible)
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) pull()
    })
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void sub.then((h) => h.remove())
    }
  }, [userId, reconciledFor, pullCloud])

  // Persist on every change. Debounced so rapid edits (sliders, steppers)
  // don't thrash localStorage or fire a request per keystroke.
  const saveTimer = useRef<number | undefined>(undefined)
  const flushRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    window.clearTimeout(saveTimer.current)
    const flush = () => {
      flushRef.current = null
      localAdapter.save(data)

      if (hydratingRef.current) {
        // This render is the cloud read landing, not a user edit.
        hydratingRef.current = false
        return
      }
      if (!userId || !cloudEnabled()) return

      const from = syncedRef.current
      /* Flagged before the request leaves, not after it fails: a user who
         logs water and swipes the app away a second later kills the request
         in flight, and nothing would ever reject. */
      pushesInFlight += 1
      markPushFailed(true)
      pushChanges(from, data)
        .then(() => {
          pushesInFlight -= 1
          setSynced(data)
          setSyncError(null)
          if (pushesInFlight === 0) markPushFailed(false)
        })
        .catch((err) => {
          pushesInFlight -= 1
          markPushFailed(true)
          setSyncError((err as Error).message)
        })
    }
    flushRef.current = flush
    saveTimer.current = window.setTimeout(flush, 250)
    return () => window.clearTimeout(saveTimer.current)
  }, [data, userId, setSynced])

  /* Leaving the app (home swipe, app switcher, lock) freezes the web view's
     timers, so a debounced save that has not fired yet would never fire. Run
     it now, while there is still a tick to run it in. */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      window.clearTimeout(saveTimer.current)
      flushRef.current?.()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  const update = useCallback((fn: (d: AppData) => void) => {
    setData((prev) => {
      const next: AppData = structuredClone(prev)
      fn(next)
      return next
    })
  }, [])

  /* --------------------------------------------------------- Apple Health -- */

  const healthOn = healthSupported() && data.settings.healthSync
  const [healthBusy, setHealthBusy] = useState(false)
  const [healthLast, setHealthLast] = useState<HealthSyncResult | null>(loadHealthLast)
  const [healthWrites, setHealthWrites] = useState<WriteStatus | null>(null)
  /* Set by an import so the write effect below does not echo weigh-ins that
     came *from* Health straight back into it as LogPal's own. */
  const importedWeightsRef = useRef(false)

  const syncHealth = useCallback(async () => {
    if (!healthSupported()) return
    setHealthBusy(true)
    try {
      const end = today()
      const zone = resolveTimeZone(dataRef.current.settings.timeZone)
      const reading = await readHealth(addDays(end, -HEALTH_WINDOW_DAYS), end, zone)
      /* Merged inside the updater so an edit made while Health was being
         read is not lost under a stale snapshot. */
      const merged = await new Promise<HealthMerge>((resolve) => {
        setData((prev) => {
          const next: AppData = structuredClone(prev)
          const m = mergeHealth(next, reading, end)
          if (m.weights) importedWeightsRef.current = true
          resolve(m)
          return next
        })
      })
      const result: HealthSyncResult = { at: Date.now(), ...merged }
      setHealthLast(result)
      saveHealthLast(result)
    } catch (err) {
      setHealthLast({ at: Date.now(), steps: 0, weights: 0, workouts: 0, error: (err as Error).message })
    } finally {
      setHealthBusy(false)
    }
  }, [])

  const connectHealth = useCallback(async () => {
    const writes = await requestHealthAccess()
    setHealthWrites(writes)
    update((d) => {
      d.settings.healthSync = true
    })
    await syncHealth()
  }, [syncHealth, update])

  /* Pull on launch and whenever the app comes back to the front. On launch
     only once the cloud copy has landed, or the import would be replaced by
     it a moment later. */
  const healthReady = healthOn && (!userId || reconciledFor === userId)
  useEffect(() => {
    if (!healthReady) return
    void syncHealth()
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void syncHealth()
    })
    return () => {
      void sub.then((h) => h.remove())
    }
  }, [healthReady, syncHealth])

  /* Push: diff each change against the last one, collect the days whose
     water, food or weight moved, and write those days' totals a moment
     later. The cloud landing is skipped (hydratingRef), since that is not
     an edit, just this device catching up. */
  const prevDataRef = useRef<AppData | null>(null)
  const pendingTotals = useRef(new Set<string>())
  const pendingWeights = useRef(new Set<string>())
  const writeTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    const prev = prevDataRef.current
    prevDataRef.current = data
    const skipWeights = importedWeightsRef.current
    importedWeightsRef.current = false
    if (!healthOn || !prev || hydratingRef.current) return

    for (const d of new Set([...Object.keys(prev.days), ...Object.keys(data.days)])) {
      if ((prev.days[d]?.water ?? 0) !== (data.days[d]?.water ?? 0)) pendingTotals.current.add(d)
    }
    if (prev.foodEntries !== data.foodEntries) {
      const byDate = (list: FoodEntry[]) => {
        const m = new Map<string, string>()
        for (const e of list) {
          const n = e.nutrients
          m.set(e.date, `${m.get(e.date) ?? ''}${e.id}:${n.calories}:${n.protein}:${n.carbs}:${n.fat}|`)
        }
        return m
      }
      const a = byDate(prev.foodEntries)
      const b = byDate(data.foodEntries)
      for (const d of new Set([...a.keys(), ...b.keys()])) if (a.get(d) !== b.get(d)) pendingTotals.current.add(d)
    }
    if (!skipWeights && prev.weights !== data.weights) {
      const a = new Map(prev.weights.map((w) => [w.date, w.weight]))
      const b = new Map(data.weights.map((w) => [w.date, w.weight]))
      for (const d of new Set([...a.keys(), ...b.keys()])) if (a.get(d) !== b.get(d)) pendingWeights.current.add(d)
    }
    if (!pendingTotals.current.size && !pendingWeights.current.size) return

    window.clearTimeout(writeTimer.current)
    writeTimer.current = window.setTimeout(() => {
      const cur = dataRef.current
      const zone = resolveTimeZone(cur.settings.timeZone)
      const limit = today()
      const totals = new Set(pendingTotals.current)
      const weights = new Set(pendingWeights.current)
      pendingTotals.current.clear()
      pendingWeights.current.clear()
      for (const date of new Set([...totals, ...weights])) {
        if (date > limit) continue
        const w: DayWrite = { date, timeZone: zone }
        if (totals.has(date)) {
          w.waterMl = cur.days[date]?.water ?? 0
          let calories = 0
          let proteinG = 0
          let carbsG = 0
          let fatG = 0
          for (const e of cur.foodEntries) {
            if (e.date !== date) continue
            calories += e.nutrients.calories
            proteinG += e.nutrients.protein
            carbsG += e.nutrients.carbs
            fatG += e.nutrients.fat
          }
          Object.assign(w, { calories, proteinG, carbsG, fatG })
        }
        if (weights.has(date)) {
          const rec = cur.weights.find((x) => x.date === date)
          w.weightKg = rec ? rec.weight / LB_PER_KG : 0
        }
        writeHealthDay(w).catch(() => {
          /* Health refused or is unavailable; the diary is still right, and
             the next change to this day tries again. */
        })
      }
    }, 800)
  }, [data, healthOn])

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
    const shares = (l: string) => l !== 'off'
    const sharesSomething =
      s.shareName ||
      s.shareStreak ||
      shares(s.shareCalories) ||
      shares(s.shareWater) ||
      shares(s.shareSteps) ||
      shares(s.shareMacros) ||
      shares(s.shareWorkouts)
    if (!sharesSomething) return NOTHING_PUBLISHED

    const d = today()
    const totals = totalsFor(d)
    const day = data.days[d]
    const n = totals.nutrients

    /* A level is a ceiling, and each rung writes only its own fields. An
       account on `percent` publishes no absolute figure at all. There is
       nothing on the server to be exposed later by a policy that slips. */
    const pct = (value: number, goal: number, level: ShareLevel) =>
      level === 'off' || goal <= 0 ? null : Math.max(0, Math.round((value / goal) * 100))
    const exact = (value: number, level: ShareLevel) =>
      level === 'exact' ? Math.round(value) : null

    const workouts = data.exerciseEntries.filter((e) => e.date === d)
    const burned = workouts.reduce((sum, e) => sum + (e.caloriesBurned ?? 0), 0)
    const named = workouts.map((e) => (e.minutes ? `${e.name}, ${e.minutes} min` : e.name))

    /* Seven days ending today, as counts. Each count rides on the same
       switch as the figure it summarises. */
    const week = weekCounts(
      lastNDays(7).map((k) => {
        const t = totalsFor(k)
        const dl = data.days[k]
        return {
          calories: t.nutrients.calories,
          calorieGoal: t.goal,
          waterMl: dl?.water ?? 0,
          waterGoalMl: waterTarget,
          steps: dl?.steps ?? null,
          stepGoal: data.profile.stepGoal,
        }
      }),
    )

    return {
      display_name: s.shareName ? data.profile.name || null : null,
      streak: s.shareStreak ? logStreak : null,
      last_logged: s.shareStreak ? lastLogged : null,

      calorie_pct: pct(n.calories, totals.goal, s.shareCalories),
      calories: exact(n.calories, s.shareCalories),
      calorie_goal: exact(totals.goal, s.shareCalories),

      water_pct: pct(day?.water ?? 0, waterTarget, s.shareWater),
      water_ml: exact(day?.water ?? 0, s.shareWater),
      water_goal_ml: exact(waterTarget, s.shareWater),

      step_pct: pct(day?.steps ?? 0, data.profile.stepGoal, s.shareSteps),
      steps: exact(day?.steps ?? 0, s.shareSteps),
      step_goal: exact(data.profile.stepGoal, s.shareSteps),

      protein_pct: pct(n.protein, macroTargets.protein, s.shareMacros),
      carbs_pct: pct(n.carbs, macroTargets.carbs, s.shareMacros),
      fat_pct: pct(n.fat, macroTargets.fat, s.shareMacros),
      protein_g: exact(n.protein, s.shareMacros),
      carbs_g: exact(n.carbs, s.shareMacros),
      fat_g: exact(n.fat, s.shareMacros),

      exercise:
        s.shareWorkouts !== 'off' && named.length ? named.join(' · ').slice(0, 120) : null,
      exercise_calories: s.shareWorkouts === 'exact' && burned > 0 ? Math.round(burned) : null,

      week_step_days: shares(s.shareSteps) ? week.stepDays : null,
      week_water_days: shares(s.shareWater) ? week.waterDays : null,
      week_calorie_days: shares(s.shareCalories) ? week.calorieDays : null,
      week_logged_days: s.shareStreak ? week.loggedDays : null,
      week_steps: exact(week.steps, s.shareSteps),
    }
  }, [
    data.settings,
    data.profile.name,
    data.profile.stepGoal,
    data.days,
    data.exerciseEntries,
    logStreak,
    lastLogged,
    totalsFor,
    waterTarget,
    macroTargets,
  ])

  /* Held so an unchanged summary does not become a write on every keystroke,
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
       accounts is the *previous* user's name, and publishing it, even for a
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

  /* The last fourteen days of steps and water, for challenges. Same gate as
     the profile, same "only when it changed" hold. A metric that is not
     shared at all goes up as null, which the scorer reads as "not sharing". */
  const publishedDays = useMemo(() => {
    const s = data.settings
    return lastNDays(14).map((day) => {
      const dl = data.days[day]
      return {
        day,
        steps: s.shareSteps !== 'off' && dl?.steps !== undefined ? dl.steps : null,
        water_ml: s.shareWater !== 'off' && dl ? Math.round(dl.water) : null,
      }
    })
  }, [data.settings, data.days])
  const publishedDaysRef = useRef<string | null>(null)
  useEffect(() => {
    if (!userId || !cloudEnabled() || reconciledFor !== userId) {
      publishedDaysRef.current = null
      return
    }
    const json = JSON.stringify(publishedDays)
    if (publishedDaysRef.current === json) return
    publishedDaysRef.current = json
    publishDays(publishedDays).catch(() => {
      publishedDaysRef.current = null
    })
  }, [userId, reconciledFor, publishedDays])

  /* The invite, redeemed: once there is a session, a handle and an onboarded
     profile, join and open the crew. A failed join (a stale code) is dropped
     rather than retried on every load. */
  useEffect(() => {
    if (!pendingInvite || !userId || !username || !data.profile.onboarded || !cloudEnabled()) return
    const code = pendingInvite
    dismissInvite()
    joinCrew(code)
      .then((id) => {
        setStack([{ name: 'tab', tab: 'friends' }, { name: 'crew', id }])
        setActiveTab('friends')
      })
      .catch((err) => setSyncError((err as Error).message))
  }, [pendingInvite, userId, username, data.profile.onboarded, dismissInvite])

  /* Streak milestones go to every crew you are in, once each. */
  useEffect(() => {
    if (!userId || !cloudEnabled() || reconciledFor !== userId) return
    const marks = [7, 14, 30, 60, 100, 365]
    const hit = marks.filter((m) => logStreak >= m).pop()
    if (!hit) return
    const key = `logpal.streakTold.${userId}`
    if (Number(localStorage.getItem(key) ?? 0) >= hit) return
    localStorage.setItem(key, String(hit))
    void announce(userId, `${hit}-day logging streak 🔥`)
  }, [userId, reconciledFor, logStreak])

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
    healthSupported: healthSupported(),
    healthBusy,
    healthLast,
    healthWrites,
    connectHealth,
    syncHealth,
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

    /* Null clears the day rather than writing a zero. Nothing measures either
       of these for you, so "not recorded" and "none" are genuinely different
       answers, and only the first one should leave the average alone. */
    setSleep: (d0, minutes) =>
      update((d) => {
        const day = { ...(d.days[d0] ?? { water: 0, completed: false }) }
        if (minutes == null) delete day.sleepMin
        else day.sleepMin = Math.max(0, Math.round(minutes))
        d.days[d0] = day
      }),

    setSteps: (d0, steps) =>
      update((d) => {
        const day = { ...(d.days[d0] ?? { water: 0, completed: false }) }
        if (steps == null) delete day.steps
        else day.steps = Math.max(0, Math.round(steps))
        d.days[d0] = day
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

    addLift: (e) => {
      const exercise = e.exercise.trim()
      const prevBest = data.lifts
        .filter((l) => l.exercise.toLowerCase() === exercise.toLowerCase())
        .reduce((m, l) => Math.max(m, l.weightLb), 0)
      update((d) => {
        const i = d.lifts.findIndex((l) => l.exercise.toLowerCase() === exercise.toLowerCase() && l.date === e.date)
        const rec: LiftEntry = {
          id: i >= 0 ? d.lifts[i].id : uid('lift_'),
          exercise: i >= 0 ? d.lifts[i].exercise : exercise,
          date: e.date,
          weightLb: i >= 0 ? Math.max(d.lifts[i].weightLb, e.weightLb) : e.weightLb,
          reps: e.reps,
          loggedAt: Date.now(),
        }
        if (i >= 0) d.lifts[i] = rec
        else d.lifts.push(rec)
        d.lifts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.loggedAt - b.loggedAt))
      })
      const pr = e.weightLb > prevBest
      if (pr && prevBest > 0 && userId && cloudEnabled())
        void announce(userId, `New ${exercise} PR: ${e.weightLb} lb${e.reps ? ` × ${e.reps}` : ''} 🏋️`)
      return { pr, prevBest }
    },

    deleteLift: (id) =>
      update((d) => {
        d.lifts = d.lifts.filter((l) => l.id !== id)
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
        // Only keep entries carrying real nutrition. A barcode that resolved
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

    addRecipeToShoppingList: (recipeId, servings = 1, only) => {
      let added = 0
      update((d) => {
        const recipe = findRecipe(d.recipes, recipeId)
        if (!recipe) return
        added = mergeIntoList(d, recipe, servings, only)
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

    toggleRecipeBookmark: (recipe, items) =>
      update((d) => {
        const on = d.savedRecipeIds.includes(recipe.id)
        if (on) {
          d.savedRecipeIds = d.savedRecipeIds.filter((x) => x !== recipe.id)
          d.savedMeals = d.savedMeals.filter((m) => m.recipeId !== recipe.id)
          return
        }
        d.savedRecipeIds = [recipe.id, ...d.savedRecipeIds]
        // Guard the meal separately: a recipe saved before this was a toggle
        // may already have one, and a second would be the bug being fixed.
        if (items.length && !d.savedMeals.some((m) => m.recipeId === recipe.id)) {
          d.savedMeals.unshift({
            id: uid('m'),
            name: recipe.name,
            items,
            createdAt: Date.now(),
            recipeId: recipe.id,
          })
        }
      }),

    isRecipeSaved: (id) => data.savedRecipeIds.includes(id),

    rememberSearch: (q) =>
      update((d) => {
        const clean = q.trim()
        if (clean.length < 2) return
        /* Most recent first, case-insensitively deduplicated, and capped,
           a search box offering forty past searches is a wall, not a help. */
        d.recentSearches = [
          clean,
          ...d.recentSearches.filter((x) => x.toLowerCase() !== clean.toLowerCase()),
        ].slice(0, 8)
      }),

    forgetSearch: (q) =>
      update((d) => {
        d.recentSearches = d.recentSearches.filter((x) => x !== q)
      }),

    resetAll: () => {
      const fresh = defaultData()
      localAdapter.clear()
      setData(fresh)
      setStack([{ name: 'tab', tab: 'today' }])
      setActiveTab('today')

      /* Clearing only this device would be a lie when there is an account,
         the next sync would pull everything straight back down. Marking the
         cloud as empty afterwards stops the save effect from re-uploading the
         blank slate as a diff against stale state. */
      if (userId && cloudEnabled()) {
        deleteAll()
          .then(() => {
            setSynced(null)
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
    pendingInvite,
    dismissInvite,
    signOut: async () => {
      if (!supabase) return
      await supabase.auth.signOut()
      // Drop back to whatever this device holds, rather than showing another
      // account's data until the next load.
      setSynced(null)
      setLocalOnly(false)
      setData(localAdapter.load() ?? defaultData())
      setStack([{ name: 'tab', tab: 'today' }])
      setActiveTab('today')
    },
    deleteAccount: async () => {
      if (!supabase) return
      await deleteAccountRemote()
      /* The server side is gone; the local copy would otherwise linger as a
         ghost of an account that no longer exists, and the save effect would
         try to push it against a dead session. */
      setSynced(null)
      localAdapter.clear()
      await supabase.auth.signOut().catch(() => undefined)
      setLocalOnly(false)
      setData(defaultData())
      setStack([{ name: 'tab', tab: 'today' }])
      setActiveTab('today')
    },
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** Convenience for building an empty nutrients object in components. */
export { emptyNutrients }
