import { useEffect, useState } from 'react'
import { AppProvider, useApp, type TabKey } from './state/store'
import { Icon, type IconName } from './components/Icon'
import { Sheet } from './components/ui'
import { Today } from './screens/Today'
import { Diary } from './screens/Diary'
import { Plan } from './screens/Plan'
import { VoiceLog } from './screens/VoiceLog'
import { MealScan } from './screens/MealScan'
import { Progress, MeasurementDetail, WeightEntry } from './screens/Progress'
import {
  About,
  FoodsHub,
  More,
  PlanHub,
  PrefsAppearance,
  PrefsProfile,
  PrefsUnits,
} from './screens/Settings'
import { NutritionScreen } from './screens/NutritionScreen'
import { FoodSearch } from './screens/FoodSearch'
import { FoodDetail } from './screens/FoodDetail'
import { CreateFood } from './screens/CreateFood'
import { ExerciseDetail, ExerciseSearch } from './screens/Exercise'
import { Goals } from './screens/Goals'
import { Onboarding } from './screens/Onboarding'
import {
  MealEditor,
  MealsList,
  MyFoods,
  RecipeEditor,
  RecipesList,
} from './screens/MealsRecipes'
import { AddSheetContent, QuickAdd, WaterScreen } from './screens/misc'
import { BarcodeScanner } from './screens/Scanner'
import { Fasting } from './screens/Fasting'
import { Auth } from './screens/Auth'
import { AccountSetup } from './screens/AccountSetup'
import { FriendProfile, Friends, FriendsSharing } from './screens/Friends'
import { cloudEnabled } from './lib/supabase'

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'today', label: 'Home', icon: 'home' },
  { key: 'plan', label: 'Plan', icon: 'plan' },
  { key: 'progress', label: 'Progress', icon: 'progress' },
  { key: 'more', label: 'Settings', icon: 'settings' },
]

function Shell() {
  const app = useApp()
  const { route, activeTab, setTab, profile, settings, date } = app
  const { session, authReady, localOnly, setLocalOnly, username } = app
  const [addOpen, setAddOpen] = useState(false)

  /* Theme is applied to <html> so the tokens cascade everywhere, including
     portalled sheets. `system` follows the OS and updates live. */
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches)
      root.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings.theme])

  /* Auth gates the app only when the build actually has Supabase credentials.
     Without them LogPal is the local-only app it has always been, and showing
     a sign-in screen nobody could get past would be worse than useless. */
  if (cloudEnabled()) {
    // Blank rather than a spinner: the session check reads localStorage and
    // resolves in a few milliseconds, and a flashed spinner reads as jank.
    if (!authReady) return <div className="app" />
    if (!session && !localOnly) {
      return (
        <div className="app">
          <Auth onSkip={() => setLocalOnly(true)} />
        </div>
      )
    }
    /* Signed in but no handle yet — the rest of signing up. Reached both by
       Google, which hands back only an address, and by an email sign-up that
       had to wait for confirmation. Undefined means the lookup is still in
       flight, and gating on that would flash this screen at everyone. */
    if (session && username === null) {
      return (
        <div className="app">
          <AccountSetup />
        </div>
      )
    }
  }

  if (!profile.onboarded) return <Onboarding />

  return (
    <div className="app">
      {renderRoute()}

      <div className="navdock">
        <nav className="tabbar">
          {TABS.map((t) => (
            <TabButton key={t.key} tab={t} active={activeTab} onSelect={setTab} />
          ))}
        </nav>
        <button className="fab" onClick={() => setAddOpen(true)} aria-label="Add entry">
          <Icon name="plus" size={27} strokeWidth={2.6} />
        </button>
      </div>

      {addOpen && (
        <Sheet onClose={() => setAddOpen(false)}>
          <AddSheetContent date={date} onClose={() => setAddOpen(false)} />
        </Sheet>
      )}
    </div>
  )

  function renderRoute() {
    switch (route.name) {
      case 'tab':
        return route.tab === 'today' ? (
          <Today />
        ) : route.tab === 'plan' ? (
          <Plan />
        ) : route.tab === 'progress' ? (
          <Progress />
        ) : (
          <More />
        )

      case 'diary':
        return <Diary />

      case 'nutrition':
        return <NutritionScreen date={route.date} />

      case 'foodSearch':
        return <FoodSearch date={route.date} />

      case 'foodDetail':
        return (
          <FoodDetail
            food={route.food}
            date={route.date}
            entryId={route.entryId}
            servings={route.servings}
            servingLabel={route.servingLabel}
          />
        )

      case 'createFood':
        return <CreateFood barcode={route.barcode} returnTo={route.returnTo} />

      case 'quickAdd':
        return <QuickAdd date={route.date} />

      case 'scan':
        return <BarcodeScanner date={route.date} />

      case 'voiceLog':
        return <VoiceLog date={route.date} />

      case 'mealScan':
        return <MealScan date={route.date} />

      case 'exerciseSearch':
        return <ExerciseSearch date={route.date} kind={route.kind} />

      case 'exerciseDetail':
        return (
          <ExerciseDetail
            date={route.date}
            kind={route.kind}
            exerciseId={route.exerciseId}
            name={route.name_}
            entryId={route.entryId}
          />
        )

      case 'water':
        return <WaterScreen date={route.date} />

      case 'meals':
        return <MealsList />

      case 'mealEditor':
        return <MealEditor mealId={route.mealId} />

      case 'recipes':
        return <RecipesList />

      case 'recipeEditor':
        return <RecipeEditor recipeId={route.recipeId} />

      case 'myFoods':
        return <MyFoods />

      case 'goals':
        return <Goals />

      case 'weightEntry':
        return <WeightEntry />

      case 'measurement':
        return <MeasurementDetail measureKey={route.key} />

      case 'fasting':
        return <Fasting />

      case 'foodsHub':
        return <FoodsHub />

      case 'planHub':
        return <PlanHub />

      case 'prefsProfile':
        return <PrefsProfile />

      case 'prefsUnits':
        return <PrefsUnits />

      case 'friends':
        return <Friends />

      case 'friendProfile':
        return <FriendProfile userId={route.userId} username={route.username} />

      case 'friendsSharing':
        return <FriendsSharing />

      case 'prefsAppearance':
        return <PrefsAppearance />

      case 'about':
        return <About />

      case 'progressPhotos':
        return <More />
    }
  }
}

function TabButton({
  tab,
  active,
  onSelect,
}: {
  tab: { key: TabKey; label: string; icon: IconName }
  active: TabKey
  onSelect(k: TabKey): void
}) {
  return (
    <button
      className={`tabbar__item ${active === tab.key ? 'tabbar__item--active' : ''}`}
      onClick={() => onSelect(tab.key)}
    >
      <Icon name={tab.icon} size={22} strokeWidth={active === tab.key ? 2.2 : 1.8} />
      {tab.label}
    </button>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
