import { useEffect, useState } from 'react'
import { AppProvider, useApp, type TabKey } from './state/store'
import { Icon, type IconName } from './components/Icon'
import { Sheet } from './components/ui'
import { Today } from './screens/Today'
import { Plan } from './screens/Plan'
import { MealScan } from './screens/MealScan'
import { NutriScan } from './screens/NutriScan'
import { Progress, MeasurementDetail, WeightEntry, LiftDetail } from './screens/Progress'
import {
  About,
  FoodsHub,
  More,
  PlanHub,
  PrefsAppearance,
  PrefsProfile,
  PrefsRegion,
  PrefsHealth,
  PrefsUnits,
} from './screens/Settings'
import { NutritionScreen } from './screens/NutritionScreen'
import { CaloriesScreen, MacrosScreen, MealScreen, NutrientScreen } from './screens/Breakdown'
import { CelebrationHost } from './components/Confetti'
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
import { SleepScreen, StepsScreen } from './screens/wellness'
import { BarcodeScanner } from './screens/Scanner'
import { WorthIt } from './screens/WorthIt'
import { applyLook } from './lib/theme'
import { Fasting } from './screens/Fasting'
import { Auth } from './screens/Auth'
import { AccountSetup } from './screens/AccountSetup'
import { FriendProfile, Friends, FriendsSharing } from './screens/Friends'
import { MealPlanner, RecipeBrowse, RecipeView, ShoppingList } from './screens/Planner'
import { cloudEnabled } from './lib/supabase'
import { useT, type StringKey } from './i18n'

type TabDef = { key: TabKey; label: string; icon: IconName }

/* Split either side of the add button, which now sits in the middle of the bar
   rather than riding beside it. Three and three: adding a seventh tab means
   deciding which half it joins, and the halves have to stay even or the plus
   stops being centred. Labels are looked up at render so they follow the
   language setting. */
const TABS_LEFT: { key: TabKey; label: StringKey; icon: IconName }[] = [
  { key: 'today', label: 'tabs.home', icon: 'home' },
  /* Beside Home, because it is used before eating rather than after: the rest
     of the app records what happened, this one is consulted first. */
  { key: 'nutriscan', label: 'tabs.nutriscan', icon: 'nutriscan' },
  { key: 'plan', label: 'tabs.plan', icon: 'plan' },
]

const TABS_RIGHT: typeof TABS_LEFT = [
  { key: 'progress', label: 'tabs.progress', icon: 'progress' },
  { key: 'friends', label: 'tabs.friends', icon: 'user' },
  { key: 'more', label: 'tabs.settings', icon: 'settings' },
]

function Shell() {
  const app = useApp()
  const t = useT()
  const { route, activeTab, setTab, profile, settings, date } = app
  const { session, authReady, localOnly, setLocalOnly, username } = app
  const [addOpen, setAddOpen] = useState(false)
  const tabDefs = (defs: typeof TABS_LEFT): TabDef[] => defs.map((d) => ({ ...d, label: t(d.label) }))

  /* Theme is applied to <html> so the tokens cascade everywhere, including
     portalled sheets. `system` follows the OS and updates live. */
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => applyLook(settings.theme, settings.palette)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
    /* `route` is a dependency on purpose: the Appearance screen previews an
       unsaved pick on <html>, and re-applying the saved look on every route
       change is what puts it back when that screen is left without saving.
       Doing it here rather than in that screen's cleanup means the order
       React runs effects in cannot leave the preview behind. */
  }, [settings.theme, settings.palette, route])

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
    /* Signed in but no handle yet. The rest of signing up. Reached both by
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
      <CelebrationHost />

      <div className="navdock">
        <nav className="tabbar">
          {tabDefs(TABS_LEFT).map((tab) => (
            <TabButton key={tab.key} tab={tab} active={activeTab} onSelect={setTab} />
          ))}
          {/* In the flow, not positioned over it: the middle grid column is the
              button's own, so the tabs either side can never slide under it. */}
          <button className="fab" onClick={() => setAddOpen(true)} aria-label={t('tabs.add')}>
            <Icon name="plus" size={25} strokeWidth={2.6} />
          </button>
          {tabDefs(TABS_RIGHT).map((tab) => (
            <TabButton key={tab.key} tab={tab} active={activeTab} onSelect={setTab} />
          ))}
        </nav>
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
        ) : route.tab === 'nutriscan' ? (
          <WorthIt date={date} asTab />
        ) : route.tab === 'plan' ? (
          <Plan />
        ) : route.tab === 'friends' ? (
          <Friends asTab />
        ) : route.tab === 'progress' ? (
          <Progress />
        ) : (
          <More />
        )

      case 'meal':
        return <MealScreen date={route.date} meal={route.meal} />

      case 'nutrition':
        return <NutritionScreen date={route.date} />

      case 'calories':
        return <CaloriesScreen date={route.date} />

      case 'macros':
        return <MacrosScreen date={route.date} />

      case 'nutrient':
        return <NutrientScreen date={route.date} nutrient={route.key} />

      case 'foodSearch':
        return <FoodSearch date={route.date} meal={route.meal} />

      case 'foodDetail':
        return (
          <FoodDetail
            food={route.food}
            date={route.date}
            meal={route.meal}
            entryId={route.entryId}
            servings={route.servings}
            servingLabel={route.servingLabel}
          />
        )

      case 'createFood':
        return <CreateFood barcode={route.barcode} returnTo={route.returnTo} prefill={route.prefill} />

      case 'quickAdd':
        return <QuickAdd date={route.date} meal={route.meal} />

      case 'scan':
        return <BarcodeScanner date={route.date} mode={route.mode} />

      case 'worthIt':
        return <WorthIt date={route.date} food={route.food} />

      case 'mealScan':
        return <MealScan date={route.date} />

      case 'nutriScan':
        return <NutriScan date={route.date} mode={route.mode} />

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

      case 'sleep':
        return <SleepScreen date={route.date} />

      case 'steps':
        return <StepsScreen date={route.date} />

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

      case 'lift':
        return <LiftDetail exercise={route.exercise} />

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

      case 'prefsRegion':
        return <PrefsRegion />
      case 'prefsHealth':
        return <PrefsHealth />

      case 'friends':
        return <Friends />

      case 'friendProfile':
        return <FriendProfile userId={route.userId} username={route.username} />

      case 'friendsSharing':
        return <FriendsSharing />

      case 'mealPlanner':
        return <MealPlanner />

      case 'recipeBrowse':
        return <RecipeBrowse date={route.date} slot={route.slot} />

      case 'recipeView':
        return (
          <RecipeView recipeId={route.recipeId} date={route.date} slot={route.slot} />
        )

      case 'shoppingList':
        return <ShoppingList />

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
