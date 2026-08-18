import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MealSlot, Recipe } from '../types'
import { MEAL_SLOTS, SLOT_LABELS } from '../types'
import { useApp } from '../state/store'
import { stepDetail } from '../lib/stepDetail'
import { Icon } from '../components/Icon'
import { Empty, Row, Sheet, Tabs, TopBar } from '../components/ui'
import { addDays, friendlyDate, today } from '../lib/dates'
import { cal } from '../lib/format'
import { scaleNutrients } from '../lib/nutrition'
import {
  formatAmountFor,
  formatQuantity,
  parseIngredient,
  unitPrefsFrom,
} from '../lib/ingredients'
import { sortAisles } from '../data/aisles'
import {
  allRecipes,
  formatMinutes,
  summarise,
  ingredientCount,
  resolveRecipe,
  searchRecipes,
  sortRecipes,
  totalMinutes,
  type SortKey,
} from '../services/recipes'
import { INGREDIENT_GROUPS, STARTER_INGREDIENTS } from '../data/ingredients'
import { PHOTO_CREDITS } from '../data/authoredRecipes'
import {
  matchesTerm,
  COOK_TIMES,
  CUISINES,
  DIETS,
  MEAL_TYPES,
  NUTRITION_TAGS,
} from '../lib/recipeTags'
import { foodDbSize, loadFoodDb, onFoodDbGrown } from '../services/foodDb'
import { catalogSize, loadCatalog, onCatalogLoaded } from '../services/recipeDb'

/**
 * Makes sure the food database is in memory, and re-renders when it lands.
 *
 * Every calorie figure in this feature comes from resolving ingredient text
 * against that database, and until it loads there are only the 324 curated seed
 * foods to match against — so nearly every line reads "no match" and every
 * recipe under-reports. It used to be loaded exclusively by the food search,
 * voice log and meal scan screens, none of which anyone passes through on the
 * way to browsing recipes, so the planner was reliably looking at the smallest
 * possible database.
 *
 * The returned size doubles as a render key: resolution is cached against it,
 * so re-rendering when it changes is what turns "no match" into a real number
 * the moment the rows arrive.
 */
function useFoodDb(): number {
  const [size, setSize] = useState(() => foodDbSize() + catalogSize())
  useEffect(() => {
    const tick = () => setSize(foodDbSize() + catalogSize())
    /* Both, in parallel. The recipes are the smaller download and the one this
       screen is actually about, so it must not queue behind 40 MB of foods. */
    void loadFoodDb()
    void loadCatalog()
    const offFoods = onFoodDbGrown(tick)
    const offRecipes = onCatalogLoaded(tick)
    tick()
    return () => {
      offFoods()
      offRecipes()
    }
  }, [])
  return size
}

/**
 * Meal planning: browse recipes, put them on days, shop for them, eat them.
 *
 * ## Why the planner is days-as-rows
 *
 * A seven-column week grid is what a desktop calendar does and it is wrong on a
 * phone: seven columns across 390 points leaves each day about fifty, which is
 * not enough for a recipe photo to be recognisable. Recognising the photo is
 * the whole reason to look at a meal plan. So a day is a row and its meals run
 * across it, which is the shape Samsung Food settled on too.
 *
 * ## Why a plan is not a diary entry
 *
 * Planning something and eating it are different events, and the planner keeps
 * them apart until you say otherwise. `loggedAt` on a plan entry is the join:
 * until it is set the meal is an intention, and the day's calorie pill is a
 * forecast rather than a record. Collapsing the two would mean a week planned on
 * Sunday showing as a week already eaten.
 */

/* ------------------------------------------------------------ recipe card -- */

function RecipeCard({
  recipe,
  variant = 'grid',
  slot,
  logged,
  saved,
  onSave,
  onClick,
}: {
  recipe: Recipe
  variant?: 'grid' | 'rail'
  slot?: MealSlot
  logged?: boolean
  saved?: boolean
  onSave?(): void
  onClick(): void
}) {
  const mins = totalMinutes(recipe)
  const tag = recipe.tags?.[0]
  const { data } = useApp()
  const resolved = summarise(recipe, [...data.customFoods, ...Object.values(data.foodCache)])

  return (
    <div className={`rcard ${variant === 'rail' ? 'rcard--rail' : ''}`}>
      {/* Sits outside the card's own button: nesting one button in another is
          invalid and swallows the inner click. */}
      {onSave && (
        <button
          className={`rcard__save ${saved ? 'rcard__save--on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onSave()
          }}
          aria-label={saved ? `Unsave ${recipe.name}` : `Save ${recipe.name}`}
        >
          <Icon name="bookmark" size={16} />
        </button>
      )}
      <button
        onClick={onClick}
        style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', width: '100%' }}
      >
      <span className="rcard__media">
        {recipe.imageUrl ? (
          <img className="rcard__img" src={recipe.imageUrl} alt="" loading="lazy" />
        ) : (
          /* Most recipes here are typed in, not imported, so no image is the
             normal case rather than a failure — it gets a deliberate treatment
             instead of a broken-image box. */
          <span className="rcard__fallback">
            <Icon name="note" size={30} strokeWidth={1.6} />
          </span>
        )}
        {tag && <span className="rcard__tag">{tag}</span>}
        {mins && <span className="rcard__time">{formatMinutes(mins)}</span>}
      </span>
      <span className="rcard__body">
        <span className="rcard__title">{recipe.name}</span>
        <span className="rcard__meta">
          {cal(resolved.perServing.calories)} cal · {ingredientCount(recipe)} ingredients
        </span>
        {slot && (
          <span className="rcard__slot">
            {SLOT_LABELS[slot]}
            {logged && (
              <span className="rcard__logged">
                <Icon name="check" size={12} strokeWidth={3} />
              </span>
            )}
          </span>
        )}
      </span>
      </button>
    </div>
  )
}

/* ---------------------------------------------------------------- planner -- */

const DAYS_SHOWN = 7

/**
 * Prep: the calendar half.
 *
 * A pane rather than a screen — it lives inside the Plan tab beside the
 * browsing half, because choosing meals and scheduling them are two halves of
 * one sitting. Making Prep its own pushed screen meant leaving the recipes to
 * go and place them, then coming back for the next one.
 */
export function MealPlanner() {
  const app = useApp()
  useFoodDb()
  const { pop, push, data, calorieTarget, planFor, plannedCalories } = app

  const days = useMemo(
    () => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today(), i)),
    [],
  )

  const planned = data.planEntries.length
  const unbought = data.shopping.filter((s) => !s.checked).length

  return (
    <>
      <TopBar title="Meal plan" onBack={pop} solid />
      <div className="scroll">
      {!planned && (
        <div className="hint" style={{ paddingTop: 14 }}>
          Add something from Plan and it lands on a day here, with its calories
          counted against your target. Nothing reaches your diary until you say so.
        </div>
      )}

      {days.map((d) => (
        <PlannerDay
          key={d}
          date={d}
          target={calorieTarget}
          entries={planFor(d)}
          planned={plannedCalories(d)}
        />
      ))}

      <div style={{ height: 8 }} />
      <div className="card">
        <Row
          title="Grocery list"
          sub="Built from everything on the calendar above"
          value={unbought || undefined}
          chevron
          onClick={() => push({ name: 'shoppingList' })}
        />
      </div>
      <div style={{ height: 16 }} />
      </div>
    </>
  )
}

function PlannerDay({
  date,
  target,
  entries,
  planned,
}: {
  date: string
  target: number
  entries: ReturnType<ReturnType<typeof useApp>['planFor']>
  planned: number
}) {
  const { push, data } = useApp()
  const isToday = date === today()
  const recipes = allRecipes(data.recipes)

  return (
    <div className="pday">
      <div className="pday__head">
        {isToday && <span className="pday__today" />}
        <span className="pday__name">{isToday ? 'Today' : friendlyDate(date)}</span>
        {planned > 0 && (
          <span className={`pday__kcal ${planned > target * 1.1 ? 'pday__kcal--over' : ''}`}>
            {cal(planned)} cal
          </span>
        )}
        <button
          className="iconbtn pday__add"
          onClick={() => push({ name: 'recipeBrowse', date })}
          aria-label={`Add a meal on ${date}`}
        >
          <Icon name="plus" size={20} strokeWidth={2.4} />
        </button>
      </div>

      <div className="rrail">
        {entries.map((e) => {
          const recipe = recipes.find((r) => r.id === e.recipeId)
          if (!recipe) return null
          return (
            <RecipeCard
              key={e.id}
              recipe={recipe}
              variant="rail"
              slot={e.slot}
              logged={!!e.loggedAt}
              onClick={() =>
                push({ name: 'recipeView', recipeId: recipe.id, slot: e.slot, date })
              }
            />
          )
        })}

        {/* One open slot, always, so adding never needs a menu first. */}
        <button
          className="pslot"
          onClick={() => push({ name: 'recipeBrowse', date })}
        >
          <span className="pslot__plus">
            <Icon name="plus" size={22} strokeWidth={2.4} />
          </span>
          Add a meal
        </button>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- browse -- */

/**
 * The filter sheet's vocabulary, in the groups the reference app uses.
 *
 * Nutrition is ours and is computed from each recipe's own numbers, so those
 * filters cannot lie — a recipe appears under High Protein because it has the
 * protein, not because somebody typed the words. The rest are matched against
 * a recipe's declared tags and its title.
 */
const FILTER_GROUPS: { key: string; label: string; options: readonly string[] }[] = [
  { key: 'meal', label: 'Meal type', options: MEAL_TYPES },
  { key: 'diet', label: 'Diet', options: DIETS },
  { key: 'nutrition', label: 'Nutrition', options: NUTRITION_TAGS },
  { key: 'cuisine', label: 'Cuisine', options: CUISINES },
]

/** Suggested first searches, for a box nobody has typed in yet. */
const POPULAR_SEARCHES = [
  'High Protein',
  'Low Carb',
  'GLP-1 Friendly',
  'Breakfast',
  'Chicken',
  'Vegetarian',
  'Under 30 min',
  'Soup',
]

interface DraftFilters {
  terms: string[]
  maxMinutes: number | null
  ingredients: string[]
  /** Ingredients to keep out — allergies and dislikes. */
  exclude: string[]
  savedOnly: boolean
}

const NO_FILTERS: DraftFilters = {
  terms: [],
  maxMinutes: null,
  ingredients: [],
  exclude: [],
  savedOnly: false,
}

function countFor(group: string, f: DraftFilters, options: readonly string[]): number {
  if (group === 'time') return f.maxMinutes == null ? 0 : 1
  if (group === 'ingredients') return f.ingredients.length
  return f.terms.filter((t) => options.includes(t)).length
}

/**
 * Plan — browse, search and organise recipes.
 *
 * Modelled on Samsung Food's search, which is the part of that app doing the
 * most work: a query box, a row of filter chips that open a sheet, facets for
 * meal type, diet, cuisine, cook time and nutrition, ingredient chips, and the
 * searches you ran before. Everything narrows the same list, and the list is
 * the user's own recipes and the shipped catalogue together.
 */
export function PlanPane({ date, slot }: { date?: string; slot?: MealSlot }) {
  const { push, data, rememberSearch, forgetSearch, toggleRecipeBookmark } = useApp()
  const dbSize = useFoodDb()

  const [query, setQuery] = useState('')
  const [committed, setCommitted] = useState('')
  const [filters, setFilters] = useState<DraftFilters>(NO_FILTERS)
  const [sheet, setSheet] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('relevance')
  const [sortOpen, setSortOpen] = useState(false)
  const [focused, setFocused] = useState(false)

  /* dbSize is a real dependency, not decoration: `allRecipes` folds in the
     fetched catalogue, so the list changes when that lands even though
     `data.recipes` has not moved. Without it the screen keeps showing the eight
     seed recipes after five hundred more have arrived. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recipes = useMemo(() => allRecipes(data.recipes), [data.recipes, dbSize])
  const extras = useMemo(
    () => [...data.customFoods, ...Object.values(data.foodCache)],
    [data.customFoods, data.foodCache],
  )
  /* Resolution is cached inside the service, so this closure is cheap to hand
     to the filter and the sort — both need nutrition, neither should compute
     it twice. dbSize is in the deps because the answers change as the food
     database loads. */
  /* The cheap path. Published nutrition for the catalogue, a full parse only
     for the user's own recipes — five hundred cards across sixteen rails is
     eight thousand of these, and the parser was locking the main thread. */
  const resolve = useCallback(
    (r: Recipe) => summarise(r, extras),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extras, dbSize],
  )

  /* The written vocabulary rather than words counted out of the catalogue —
     that produced "oil", "powder" and "sauce", which are the commonest final
     words in an ingredient list and useless to tap. */
  const popular = STARTER_INGREDIENTS

  /* Recipes saved with the star on any card. */
  const favourites = useMemo(
    () => data.savedRecipeIds
      .map((id) => recipes.find((r) => r.id === id))
      .filter((r): r is Recipe => !!r),
    [data.savedRecipeIds, recipes],
  )

  /* Every rail in one pass.
   *
   * Sixteen rails each filtering five hundred recipes is eight thousand
   * evaluations, plus twelve more passes for the tiles — which locked the main
   * thread outright once the catalogue grew past a hundred. Walking the list
   * once and dropping each recipe into whichever buckets it belongs to is the
   * same answer for a fraction of the work, and it scales with the catalogue
   * rather than with the catalogue times the number of shelves. */
  const { rails, categories } = useMemo(() => {
    const RAILS: { title: string; term?: string; maxMinutes?: number; minCalories?: number }[] = [
      { title: 'High protein', term: 'High Protein' },
      { title: 'Build muscle', term: 'High Protein', minCalories: 350 },
      { title: 'Lighter meals', term: 'Low Calorie' },
      { title: 'GLP-1 friendly', term: 'GLP-1 Friendly' },
      { title: 'High fibre', term: 'High Fiber' },
      { title: 'Low carb', term: 'Low Carb' },
      { title: 'Vegetarian', term: 'Vegetarian' },
      { title: 'Vegan', term: 'Vegan' },
      { title: 'Pescatarian', term: 'Pescatarian' },
      { title: 'Low fat', term: 'Low Fat' },
      { title: 'Low sodium', term: 'Low Sodium' },
      { title: 'Breakfast', term: 'Breakfast' },
      { title: 'Ready in 30 minutes', maxMinutes: 30 },
      { title: 'Soups and stews', term: 'Soup' },
      { title: 'Salads', term: 'Salad' },
      { title: 'Something sweet', term: 'Dessert' },
    ]
    const TILES = [
      'High Protein', 'Vegetarian', 'Vegan', 'Low Carb', 'High Fiber',
      'GLP-1 Friendly', 'Breakfast', 'Pescatarian', 'Low Calorie',
      'Soup', 'Salad', 'Dessert',
    ]

    const buckets = new Map<string, Recipe[]>()
    RAILS.forEach((r) => buckets.set(r.title, []))
    const tileImage = new Map<string, string>()
    const termsByRecipe = new Map<string, Set<string>>()

    for (const recipe of recipes) {
      const summary = resolve(recipe)
      const subject = {
        tags: recipe.tags,
        name: recipe.name,
        nutritionTags: [...summary.nutritionTags, ...summary.dietTags],
      }
      // Which of the vocabulary this recipe answers to, worked out once.
      const answers = new Set<string>()
      for (const term of TERMS_IN_USE) {
        if (matchesTerm(term, subject)) answers.add(term)
      }
      termsByRecipe.set(recipe.id, answers)
      const mins = totalMinutes(recipe)

      for (const rail of RAILS) {
        if (rail.term && !answers.has(rail.term)) continue
        if (rail.maxMinutes != null && (mins == null || mins > rail.maxMinutes)) continue
        if (rail.minCalories != null && summary.perServing.calories < rail.minCalories) continue
        buckets.get(rail.title)!.push(recipe)
      }

    }

    /* Each tile gets a picture no other tile is using.
     *
     * Taking the first match per category handed the same photograph to High
     * Protein, Vegetarian and Vegan, because one recipe often answers to
     * several — and a row of identical pictures reads as a rendering fault. */
    const usedImages = new Set<string>()
    for (const term of TILES) {
      const pool = seededOrder(
        recipes.filter((r) => r.imageUrl && termsByRecipe.get(r.id)?.has(term)),
        `tile:${term}`,
      )
      const pick = pool.find((r) => !usedImages.has(r.imageUrl!)) ?? pool[0]
      if (pick?.imageUrl) {
        usedImages.add(pick.imageUrl)
        tileImage.set(term, pick.imageUrl)
      }
    }

    return {
      /* Shuffled per shelf, so the first ten are a spread of the catalogue
         rather than the first ten alphabetically. Expanding still shows
         everything — the order is the only thing that changes. */
      rails: RAILS.map((r) => ({
        title: r.title,
        recipes: seededOrder(buckets.get(r.title)!, r.title),
      })).filter((r) => r.recipes.length > 0),
      categories: TILES.map((term) => ({ term, imageUrl: tileImage.get(term) })),
    }
  }, [recipes, resolve])

  /* A stable sample rather than the first nine alphabetically, which would
     make Explore a page about avocados. */
  const suggested = useMemo(() => {
    // Shuffled rather than evenly stepped: a fixed stride through an
    // alphabetical list is still an alphabetical list, just a sparser one.
    return seededOrder(recipes.filter((r) => r.imageUrl), 'suggested').slice(0, 20)
  }, [recipes])

  const results = useMemo(() => {
    const found = searchRecipes(
      recipes,
      committed,
      {
        terms: filters.terms,
        maxMinutes: filters.maxMinutes ?? undefined,
        ingredients: filters.ingredients,
        exclude: filters.exclude,
        savedOnly: filters.savedOnly,
        savedIds: data.savedRecipeIds,
      },
      resolve,
    )
    return sortRecipes(found, sort, resolve)
  }, [recipes, committed, filters, sort, resolve, data.savedRecipeIds])

  const activeCount =
    filters.terms.length +
    filters.ingredients.length +
    filters.exclude.length +
    (filters.maxMinutes == null ? 0 : 1) +
    (filters.savedOnly ? 1 : 0)

  /* Before anything is typed or ticked, the screen is a set of suggestions
     rather than a hundred and twenty cards — which is what the reference app
     shows, and what makes the box feel like a way in rather than a filter. */
  const idle = !committed && activeCount === 0

  const toggleTerm = (t: string) =>
    setFilters((f) => ({
      ...f,
      terms: f.terms.includes(t) ? f.terms.filter((x) => x !== t) : [...f.terms, t],
    }))

  const toggleIngredient = (t: string) =>
    setFilters((f) => ({
      ...f,
      ingredients: f.ingredients.includes(t)
        ? f.ingredients.filter((x) => x !== t)
        : [...f.ingredients, t],
      /* An ingredient cannot be both wanted and banned. */
      exclude: f.exclude.filter((x) => x !== t),
    }))

  const toggleExclude = (t: string) =>
    setFilters((f) => ({
      ...f,
      exclude: f.exclude.includes(t)
        ? f.exclude.filter((x) => x !== t)
        : [...f.exclude, t],
      ingredients: f.ingredients.filter((x) => x !== t),
    }))

  const runSearch = (q: string) => {
    setQuery(q)
    setCommitted(q)
    rememberSearch(q)
    setFocused(false)
  }

  return (
    <>
      <div className="searchbar">
        <div className="searchbar__box">
          <Icon name="search" size={17} />
          <input
            className="searchbar__input"
            placeholder="Search recipes and ingredients"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCommitted(e.target.value)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              if (query.trim()) rememberSearch(query)
            }}
            onKeyDown={(e) => e.key === 'Enter' && runSearch(query)}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setCommitted('')
              }}
              aria-label="Clear"
            >
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Five chips, in the reference app's own order. Saved and Nutrition
          moved into the sheet: seven chips overflowed the row on a phone, and
          a row you have to scroll to discover is a row that hides things. */}
      <div className="fchips">
        <button
          className={`fchip ${filters.exclude.length ? 'fchip--on' : ''}`}
          onClick={() => setSheet('exclude')}
        >
          Exclude
          {filters.exclude.length > 0 && (
            <span className="fchip__count">{filters.exclude.length}</span>
          )}
        </button>

        <button
          className={`fchip ${filters.ingredients.length ? 'fchip--on' : ''}`}
          onClick={() => setSheet('ingredients')}
        >
          Ingredients
          {filters.ingredients.length > 0 && (
            <span className="fchip__count">{filters.ingredients.length}</span>
          )}
        </button>

        {FILTER_GROUPS.map((g) => {
          const n = countFor(g.key, filters, g.options)
          return (
            <button
              key={g.key}
              className={`fchip ${n ? 'fchip--on' : ''}`}
              onClick={() => setSheet(g.key)}
            >
              {g.label}
              {n > 0 && <span className="fchip__count">{n}</span>}
            </button>
          )
        })}

        <button
          className={`fchip ${filters.maxMinutes != null ? 'fchip--on' : ''}`}
          onClick={() => setSheet('time')}
        >
          Cook time
          {filters.maxMinutes != null && <span className="fchip__count">1</span>}
        </button>

        {activeCount > 0 && (
          <button className="fchip" onClick={() => setFilters(NO_FILTERS)}>
            Clear all
          </button>
        )}
      </div>

      {focused && !committed ? (
        <SearchFocus
          recent={data.recentSearches}
          ingredients={popular}
          onSearch={runSearch}
          onForget={forgetSearch}
          onPickIngredient={(t) => {
            toggleIngredient(t)
            setFocused(false)
          }}
        />
      ) : idle ? (
        <Explore
          categories={categories}
          rails={rails}
          favourites={favourites}
          suggested={suggested}
          mine={data.recipes}
          saved={data.savedRecipeIds}
          onPickTerm={toggleTerm}
          onOpen={(r) => push({ name: 'recipeView', recipeId: r.id, date, slot })}
          onToggleSave={(r) => toggleRecipeBookmark(r, resolveRecipe(r, extras).items)}
          onCreate={() => push({ name: 'recipeEditor' })}
        />
      ) : (
        <>
          <div className="sortbar">
            <span className="sortbar__count">
              {results.length} recipe{results.length === 1 ? '' : 's'}
            </span>
            <button className="sortbar__btn" onClick={() => setSortOpen(true)}>
              {SORT_LABELS[sort]}
              <Icon name="down" size={15} strokeWidth={2.4} />
            </button>
          </div>

          {results.length === 0 ? (
            <Empty title="Nothing matches">
              <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
                Loosen a filter, or search a different word. Your own recipes are
                searched alongside the built-in ones.
              </div>
            </Empty>
          ) : (
            <div className="rgrid">
              {results.map((r) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  saved={data.savedRecipeIds.includes(r.id)}
                  onSave={() => toggleRecipeBookmark(r, resolveRecipe(r, extras).items)}
                  onClick={() => push({ name: 'recipeView', recipeId: r.id, date, slot })}
                />
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ height: 20 }} />

      {sheet && (
        <FilterSheet
          group={sheet}
          filters={filters}
          onToggleTerm={toggleTerm}
          onToggleIngredient={toggleIngredient}
          onToggleExclude={toggleExclude}
          onSetTime={(m) => setFilters((f) => ({ ...f, maxMinutes: m }))}
          onClear={() => setFilters(NO_FILTERS)}
          onClose={() => setSheet(null)}
        />
      )}

      {sortOpen && (
        <Sheet onClose={() => setSortOpen(false)} title="Sort by">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <button
              key={k}
              className="row"
              onClick={() => {
                setSort(k)
                setSortOpen(false)
              }}
            >
              <span className="row__main row__title">{SORT_LABELS[k]}</span>
              {sort === k && (
                <span style={{ color: 'var(--accent)', display: 'flex' }}>
                  <Icon name="check" size={18} strokeWidth={2.6} />
                </span>
              )}
            </button>
          ))}
        </Sheet>
      )}
    </>
  )
}

const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Best match',
  calories: 'Fewest calories',
  time: 'Quickest',
  health: 'Healthiest',
  name: 'A to Z',
}

/** How many a rail shows before it has to be expanded. */
const RAIL_LIMIT = 10

/**
 * A shuffle that gives the same answer every time.
 *
 * The shelves were drawing in catalogue order, which is alphabetical, so
 * 3-Can Chili and 2-Step Chicken led almost every one of them and the page
 * looked like it held nine recipes rather than five hundred. Shuffling fixes
 * that, but it has to be stable: an order that changes on every render means
 * cards move under the finger, and a rail that reshuffles when you tap a
 * filter is disorienting rather than varied.
 *
 * Seeded from the shelf's own title, so each shelf gets a different order and
 * keeps it for good.
 */
function seededOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const rand = () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  // Fisher-Yates on a copy; the caller's array is someone else's.
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Every vocabulary term any shelf or tile asks about, tested once per recipe. */
const TERMS_IN_USE = [
  'High Protein', 'Low Calorie', 'GLP-1 Friendly', 'High Fiber', 'Low Carb',
  'Vegetarian', 'Vegan', 'Pescatarian', 'Low Fat', 'Low Sodium',
  'Breakfast', 'Soup', 'Salad', 'Dessert',
]

/**
 * A titled row of recipes that can open into a grid.
 *
 * Collapsed it is a rail of ten, which is a glance. Expanded it is two columns
 * of everything, which is a browse. One control, and the chevron turns rather
 * than swapping for a different glyph so it stays recognisably the same thing
 * in both states. Sections with ten or fewer never offer the control, because
 * expanding would show exactly what is already there.
 */
function RecipeRail({
  title,
  recipes,
  saved,
  onOpen,
  onToggleSave,
  action,
}: {
  title: string
  recipes: Recipe[]
  saved: string[]
  onOpen(r: Recipe): void
  onToggleSave(r: Recipe): void
  action?: { label: string; onClick(): void }
}) {
  const [open, setOpen] = useState(false)
  if (!recipes.length) return null

  const canExpand = recipes.length > RAIL_LIMIT
  const shown = open ? recipes : recipes.slice(0, RAIL_LIMIT)

  return (
    <>
      <div className="shead">
        <span className="shead__title">{title}</span>
        {action ? (
          <button className="shead__more" onClick={action.onClick}>
            {action.label}
          </button>
        ) : canExpand ? (
          <button className="shead__toggle" onClick={() => setOpen((v) => !v)}>
            {open ? 'Less' : `All ${recipes.length}`}
            <span className={`shead__chev ${open ? 'shead__chev--open' : ''}`}>
              <Icon name="down" size={16} strokeWidth={2.4} />
            </span>
          </button>
        ) : null}
      </div>

      <div className={open ? 'rgrid' : 'rrail'}>
        {shown.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            variant={open ? 'grid' : 'rail'}
            saved={saved.includes(r.id)}
            onSave={() => onToggleSave(r)}
            onClick={() => onOpen(r)}
          />
        ))}
      </div>
    </>
  )
}

/**
 * Explore: what the screen rests at.
 *
 * A stack of rails, in the order they are most likely to be wanted — what you
 * saved, what you wrote, what we would suggest, then the catalogue cut by the
 * things people actually filter on. Each is a glance rather than a page, and
 * opens into a grid if you want more than a glance.
 */
function Explore({
  categories,
  rails,
  favourites,
  mine,
  suggested,
  saved,
  onPickTerm,
  onOpen,
  onToggleSave,
  onCreate,
}: {
  categories: { term: string; imageUrl?: string }[]
  rails: { title: string; recipes: Recipe[] }[]
  favourites: Recipe[]
  mine: Recipe[]
  suggested: Recipe[]
  saved: string[]
  onPickTerm(t: string): void
  onOpen(r: Recipe): void
  onToggleSave(r: Recipe): void
  onCreate(): void
}) {
  const railProps = { saved, onOpen, onToggleSave }

  return (
    <>
      {/* Favourites lead: the whole reason to save something is to find it
          again without searching for it twice. */}
      {/* Named for what it holds: the recipes you bookmarked, which are the
          same ones sitting under My Meals in the food search. */}
      <RecipeRail title="Favourite meals" recipes={favourites} {...railProps} />

      <RecipeRail
        title="Your recipes"
        recipes={mine}
        {...railProps}
        action={mine.length <= RAIL_LIMIT ? { label: 'Add one', onClick: onCreate } : undefined}
      />

      <RecipeRail title="Recipes you may like" recipes={suggested} {...railProps} />

      <div className="shead">
        <span className="shead__title">Popular</span>
      </div>
      <div className="rrail">
        {categories.map((c) => (
          <button key={c.term} className="cattile" onClick={() => onPickTerm(c.term)}>
            {c.imageUrl ? (
              <img className="cattile__img" src={c.imageUrl} alt="" loading="lazy" />
            ) : (
              <span className="rcard__fallback">
                <Icon name="note" size={26} strokeWidth={1.6} />
              </span>
            )}
            <span className="cattile__label">{c.term}</span>
          </button>
        ))}
      </div>

      {/* The catalogue, cut the ways people actually eat. */}
      {rails.map((r) => (
        <RecipeRail key={r.title} title={r.title} recipes={r.recipes} {...railProps} />
      ))}

      {mine.length === 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <Row
            title="Create your own recipe"
            sub="Your ingredients, your method — searched and planned the same way"
            chevron
            onClick={onCreate}
          />
        </div>
      )}
    </>
  )
}

/**
 * What the search field shows while it has focus and nothing typed.
 *
 * Exactly where the reference app puts these: tapping the box replaces the
 * screen with ways to fill it, and leaving it puts the screen back. Keeping
 * them on the resting screen is what made this feel like a form.
 */
function SearchFocus({
  recent,
  ingredients,
  onSearch,
  onForget,
  onPickIngredient,
}: {
  recent: string[]
  ingredients: string[]
  onSearch(q: string): void
  onForget(q: string): void
  onPickIngredient(t: string): void
}) {
  return (
    <div className="sfocus">
      <div className="shead" style={{ paddingTop: 14 }}>
        <span className="shead__title" style={{ fontSize: 16 }}>
          Search by ingredient
        </span>
      </div>
      <div className="fpills" style={{ padding: '0 16px 6px' }}>
        {ingredients.slice(0, 12).map((t) => (
          <button key={t} className="fpill" onMouseDown={(e) => e.preventDefault()} onClick={() => onPickIngredient(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className="shead">
        <span className="shead__title" style={{ fontSize: 16 }}>
          Popular searches
        </span>
      </div>
      {POPULAR_SEARCHES.map((q) => (
        <button
          key={q}
          className="slist__row"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSearch(q)}
        >
          <span className="slist__text">{q}</span>
        </button>
      ))}

      {recent.length > 0 && (
        <>
          <div className="shead">
            <span className="shead__title" style={{ fontSize: 16 }}>
              Recent
            </span>
          </div>
          {recent.map((q) => (
            <div key={q} className="slist__row">
              <span style={{ color: 'var(--text-3)', display: 'flex' }}>
                <Icon name="clock" size={16} />
              </span>
              <button
                className="slist__text"
                style={{ textAlign: 'left' }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSearch(q)}
              >
                {q}
              </button>
              <button
                className="slist__x"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onForget(q)}
                aria-label={`Forget ${q}`}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

/**
 * The filter sheet.
 *
 * Opens on the section whose chip was tapped but shows all of them, so a wrong
 * tap costs a scroll rather than a close and a re-open. Selections apply
 * immediately — the Apply button dismisses rather than commits — because the
 * result count is visible behind the sheet and watching it move is the fastest
 * way to understand what a filter did.
 */
function FilterSheet({
  group,
  filters,
  onToggleTerm,
  onToggleIngredient,
  onToggleExclude,
  onSetTime,
  onClear,
  onClose,
}: {
  group: string
  filters: DraftFilters
  onToggleTerm(t: string): void
  onToggleIngredient(t: string): void
  onToggleExclude(t: string): void
  onSetTime(m: number | null): void
  onClear(): void
  onClose(): void
}) {
  const ordered = useMemo(() => {
    const groups = [
      { key: 'ingredients', label: 'Ingredients' },
      ...FILTER_GROUPS.map((g) => ({ key: g.key, label: g.label })),
      { key: 'time', label: 'Cook time' },
      { key: 'exclude', label: 'Exclude' },
    ]
    const i = groups.findIndex((g) => g.key === group)
    return i <= 0 ? groups : [groups[i], ...groups.filter((_, k) => k !== i)]
  }, [group])

  return (
    <Sheet onClose={onClose} className="sheet--split">
      <div className="fsheet">
        <div className="fsheet__head">
          <span className="fsheet__title">Filters</span>
        </div>

        {ordered.map((g) => (
          <div key={g.key} className="fgroup">
            <div className="fgroup__label">
              {g.label}
              {countFor(
                g.key,
                filters,
                FILTER_GROUPS.find((x) => x.key === g.key)?.options ?? [],
              ) > 0 && (
                <span className="fchip__count">
                  {countFor(
                    g.key,
                    filters,
                    FILTER_GROUPS.find((x) => x.key === g.key)?.options ?? [],
                  )}
                </span>
              )}
            </div>

            <div className="fpills">
              {g.key === 'exclude' && (
                /* The same shelves as Ingredients, answering the opposite
                   question. Someone with an allergy is not browsing for what to
                   include; they need a way to say "never this". */
                <div style={{ width: '100%' }}>
                  <div className="hint" style={{ padding: '0 0 10px' }}>
                    Anything picked here is kept out of your results.
                  </div>
                  {INGREDIENT_GROUPS.map((group) => (
                    <div key={group.label} style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: 'var(--text-2)',
                          marginBottom: 7,
                        }}
                      >
                        {group.label}
                      </div>
                      <div className="fpills">
                        {group.items.map((t) => (
                          <button
                            key={t}
                            className={`fpill ${filters.exclude.includes(t) ? 'fpill--off' : ''}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => onToggleExclude(t)}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {g.key === 'ingredients' && (
                /* Grouped, so the list reads like a shop rather than a heap.
                   Two hundred terms in one flat run is unusable; eight labelled
                   runs of twenty is a thing you can skim. */
                <div style={{ width: '100%' }}>
                  {INGREDIENT_GROUPS.map((group) => (
                    <div key={group.label} style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: 'var(--text-2)',
                          marginBottom: 7,
                        }}
                      >
                        {group.label}
                      </div>
                      <div className="fpills">
                        {group.items.map((t) => (
                          <button
                            key={t}
                            className={`fpill ${filters.ingredients.includes(t) ? 'fpill--on' : ''}`}
                            onClick={() => onToggleIngredient(t)}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {g.key === 'time' &&
                COOK_TIMES.map((t) => (
                  <button
                    key={t.label}
                    className={`fpill ${filters.maxMinutes === t.maxMinutes ? 'fpill--on' : ''}`}
                    onClick={() =>
                      onSetTime(filters.maxMinutes === t.maxMinutes ? null : t.maxMinutes)
                    }
                  >
                    {t.label}
                  </button>
                ))}

              {FILTER_GROUPS.find((x) => x.key === g.key)?.options.map((t) => (
                <button
                  key={t}
                  className={`fpill ${filters.terms.includes(t) ? 'fpill--on' : ''}`}
                  onClick={() => onToggleTerm(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="fsheet__actions">
        <button className="btn btn--ghost" onClick={onClear}>
          Clear filters
        </button>
        <button className="btn" onClick={onClose}>
          Show results
        </button>
      </div>
    </Sheet>
  )
}

/**
 * The same browsing pane as a pushed screen, for adding to one specific day.
 *
 * Reached from a day's "+" on the calendar, where the date is already decided —
 * so the recipe it opens carries that date through and planning takes one tap
 * instead of asking again.
 */
export function RecipeBrowse({ date, slot }: { date?: string; slot?: MealSlot }) {
  const { pop } = useApp()
  return (
    <>
      <TopBar
        title={date ? `Add to ${friendlyDate(date)}` : 'Meal ideas'}
        onBack={pop}
        solid
      />
      <div className="scroll">
        <PlanPane date={date} slot={slot} />
      </div>
    </>
  )
}

/* --------------------------------------------------------- recipe detail -- */

type Section = 'ingredients' | 'steps' | 'health'

export function RecipeView({
  recipeId,
  date,
  slot,
}: {
  recipeId: string
  date?: string
  slot?: MealSlot
}) {
  const app = useApp()
  const { pop, data, settings, planMeal, logItems, toggleRecipeBookmark, addRecipeToShoppingList } = app
  const dbSize = useFoodDb()
  // Amounts are shown in whatever the Units screen says, so a recipe reads the
  // way this particular person cooks rather than the way it was written down.
  const prefs = useMemo(() => unitPrefsFrom(settings), [settings])

  const recipe = useMemo(
    () => allRecipes(data.recipes).find((r) => r.id === recipeId),
    [data.recipes, recipeId],
  )

  const [section, setSection] = useState<Section>('ingredients')
  const [servings, setServings] = useState(() => recipe?.servingsMade ?? 1)
  const [note, setNote] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  const resolved = useMemo(
    () =>
      recipe
        ? resolveRecipe(recipe, [...data.customFoods, ...Object.values(data.foodCache)])
        : null,
    // dbSize is a dependency, not a stray: the resolution changes when the
    // database grows underneath it, and nothing else here would say so.
    [recipe, data.customFoods, data.foodCache, dbSize],
  )

  if (!recipe || !resolved) {
    return (
      <>
        <TopBar title="Recipe" onBack={pop} solid />
        <Empty title="That recipe is gone" />
      </>
    )
  }

  const made = Math.max(1, recipe.servingsMade)
  /* Every amount on screen scales with the servings stepper, which is the one
     interaction people actually use on a recipe — cooking for two when it makes
     four. The stored recipe never changes; only what is displayed. */
  const scale = servings / made
  const mins = totalMinutes(recipe)

  /**
   * Keeps the recipe as a meal you can log from the food search.
   *
   * A recipe lives in Plan and the diary lives on Home, and until now the only
   * way across was to log it there and then. Bookmarking puts it in My Meals,
   * where it sits alongside everything else you eat regularly — so tomorrow you
   * find it by searching for food rather than by remembering which recipe it
   * came from. Saved at the servings currently on screen, since that is the
   * portion you decided on.
   */
  const bookmarked = data.savedRecipeIds.includes(recipe.id)

  const bookmark = () => {
    if (!resolved) return
    const items = resolved.items.map((it) => ({
      ...it,
      servings: it.servings * scale,
      nutrients: scaleNutrients(it.nutrients, scale),
    }))
    toggleRecipeBookmark(recipe, items)
    setNote(
      bookmarked
        ? 'Removed from your favourites'
        : 'Saved — it is in Favourite meals, and in My Meals when you log food',
    )
  }

  const plan = (targetSlot: MealSlot) => {
    planMeal({
      recipeId: recipe.id,
      date: date ?? today(),
      slot: targetSlot,
      /* Servings, not recipe multiples. `PlanEntry.servings` counts portions —
         everything downstream divides by `servingsMade` itself, so dividing
         here too priced a planned dinner at ⅜ lb of chicken. */
      servings,
    })
    setPicking(false)
    setNote(`Planned for ${date ? friendlyDate(date) : 'today'}`)
  }

  return (
    <>
      <TopBar
        title={recipe.name}
        onBack={pop}
        solid
        right={
          <button
            className={`iconbtn ${bookmarked ? 'iconbtn--saved' : ''}`}
            onClick={bookmark}
            aria-label={bookmarked ? 'Remove from favourites' : 'Save to favourites'}
          >
            {/* Always a bookmark. The star is a different control for a
                different thing — foods, not meals — and swapping the glyph
                would blur two distinctions the app is trying to keep. */}
            <Icon name="bookmark" size={20} />
          </button>
        }
      />

      <div className="scroll">
        <div className="rhero">
          {recipe.imageUrl ? (
            <img className="rhero__img" src={recipe.imageUrl} alt="" />
          ) : (
            <span className="rcard__fallback">
              <Icon name="note" size={48} strokeWidth={1.4} />
            </span>
          )}
        </div>

        <div className="pagetitle" style={{ paddingBottom: 4 }}>
          {recipe.name}
        </div>
        {recipe.description && (
          <div className="hint" style={{ paddingTop: 0 }}>
            {recipe.description}
          </div>
        )}
        {/* Somebody took this photograph and licensed it for reuse; saying so
            is both the licence term and the decent thing. */}
        {PHOTO_CREDITS[recipe.id] && (
          <div className="hint" style={{ paddingTop: 0, color: 'var(--text-3)', fontSize: 12 }}>
            Photo: {PHOTO_CREDITS[recipe.id]}
          </div>
        )}

        {/* Summary and navigation in one control: three numbers worth knowing,
            each of which opens the section behind it. */}
        <div className="rstats">
          <button
            className={`rstats__item ${section === 'ingredients' ? 'rstats__item--active' : ''}`}
            onClick={() => setSection('ingredients')}
          >
            <div className="rstats__value">{ingredientCount(recipe)}</div>
            <div className="rstats__label">Ingredients</div>
          </button>
          <button
            className={`rstats__item ${section === 'steps' ? 'rstats__item--active' : ''}`}
            onClick={() => setSection('steps')}
          >
            <div className="rstats__value">{mins ? formatMinutes(mins) : '—'}</div>
            <div className="rstats__label">
              {recipe.steps?.length ? `${recipe.steps.length} steps` : 'Method'}
            </div>
          </button>
          <button
            className={`rstats__item ${section === 'health' ? 'rstats__item--active' : ''}`}
            onClick={() => setSection('health')}
          >
            <div className="rstats__value">{resolved.health.score}</div>
            <div className="rstats__label">Health score</div>
          </button>
        </div>

        {/* Per serving, always — a recipe's total is a number nobody eats. */}
        <div className="card" style={{ marginTop: 12 }}>
          <Row
            title="Per serving"
            value={`${cal(resolved.perServing.calories * (scale / (servings / made || 1)))} cal`}
          />
          <Row
            title="Carbs · Fat · Protein"
            value={`${Math.round(resolved.perServing.carbs)} · ${Math.round(
              resolved.perServing.fat,
            )} · ${Math.round(resolved.perServing.protein)} g`}
          />
          {recipe.prepMin != null && recipe.cookMin != null && (
            <Row
              title="Time"
              value={`Prep ${recipe.prepMin}m · Cook ${recipe.cookMin}m`}
            />
          )}
        </div>

        {section === 'ingredients' && (
          <>
            <div className="servings">
              <button
                className="servings__btn"
                onClick={() => setServings((s) => Math.max(1, s - 1))}
                disabled={servings <= 1}
                aria-label="Fewer servings"
              >
                <Icon name="minus" size={17} strokeWidth={2.6} />
              </button>
              <span className="servings__value">
                {formatQuantity(servings)} serving{servings === 1 ? '' : 's'}
              </span>
              <button
                className="servings__btn"
                onClick={() => setServings((s) => s + 1)}
                aria-label="More servings"
              >
                <Icon name="plus" size={17} strokeWidth={2.6} />
              </button>
            </div>

            <div className="card" style={{ paddingTop: 2, paddingBottom: 2 }}>
              {(recipe.ingredients ?? []).map((line, i) => {
                const parsed = parseIngredient(line)
                const r = resolved.lines[i]
                return (
                  <div
                    key={`${line}-${i}`}
                    className={`ing ${r && !r.food ? 'ing--unmatched' : ''}`}
                  >
                    <span className="ing__amount">
                      {formatAmountFor(
                        parsed.qty != null ? parsed.qty * scale : null,
                        parsed.unit,
                        prefs,
                      )}
                    </span>
                    <span className="ing__name">
                      {parsed.name}
                      {parsed.note && <span className="ing__note">{parsed.note}</span>}
                    </span>
                    {r?.nutrients ? (
                      <span className="ing__cal">
                        {cal(r.nutrients.calories * scale)}
                      </span>
                    ) : (
                      /* Stated rather than counted as zero, and the two reasons
                         are different: "to taste" is uncountable by nature,
                         whereas an unrecognised food is a gap in the database. */
                      <span className="ing__miss">
                        {r?.reason === 'no-amount' ? 'to taste' : 'no match'}
                      </span>
                    )}
                  </div>
                )
              })}
              {!recipe.ingredients?.length &&
                recipe.items.map((it, i) => (
                  <div key={i} className="ing">
                    <span className="ing__amount">{formatQuantity(it.servings * scale)}</span>
                    <span className="ing__name">
                      {it.name}
                      <span className="ing__note">{it.servingLabel}</span>
                    </span>
                    <span className="ing__cal">{cal(it.nutrients.calories * scale)}</span>
                  </div>
                ))}
            </div>

            {resolved.unmatched.length > 0 && (
              <UncountedNote lines={resolved.lines} />
            )}

            <div className="btn-wrap">
              <button
                className="btn btn--ghost"
                onClick={() => {
                  const n = addRecipeToShoppingList(recipe.id, scale)
                  setNote(n ? `${n} added to your shopping list` : 'Already on your list')
                }}
              >
                Add to shopping list
              </button>
            </div>
          </>
        )}

        {section === 'steps' && (
          <div className="card" style={{ padding: 0 }}>
            {(recipe.prepMin || recipe.cookMin) && (
              <div className="step__times">
                <Icon name="clock" size={14} />
                {recipe.prepMin ? <span>Prep: <b>{recipe.prepMin}m</b></span> : null}
                {recipe.cookMin ? <span>Cook: <b>{recipe.cookMin}m</b></span> : null}
              </div>
            )}
            {(recipe.steps ?? []).map((s, i) => {
              const d = stepDetail(s, recipe.ingredients ?? [])
              return (
              <div key={i} className="step">
                <div className="step__n">STEP {i + 1}</div>
                <div className="step__text">{s}</div>
                {(d.appliances.length > 0 ||
                  d.equipment.length > 0 ||
                  d.ingredients.length > 0) && (
                  <div className="chips">
                    {d.appliances.map((a) => (
                      <span key={a.name} className="chip chip--appliance">
                        <b>{a.name}</b>
                        {a.setting && <em>{a.setting}</em>}
                      </span>
                    ))}
                    {d.equipment.map((e) => (
                      <span key={e} className="chip">{e}</span>
                    ))}
                    {d.ingredients.map((g) => (
                      <span key={g.name} className="chip">
                        {g.name}
                        {g.amount && <em>{g.amount}</em>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              )
            })}
            {!recipe.steps?.length && (
              <div className="hint">This recipe has no method written down.</div>
            )}
          </div>
        )}

        {section === 'health' && <HealthPanel resolved={resolved} />}

        {note && (
          <div className="hint" style={{ color: 'var(--accent)' }}>
            {note}
          </div>
        )}

        <div style={{ height: 12 }} />
      </div>

      {/* Plan it, or log it now. Both reference apps keep their primary verb
          pinned here; ours needs two because it is the only one of the three
          that owns a diary. */}
      <div className="ractions">
        <button
          className="btn btn--ghost"
          /* Arriving from a specific slot means the answer is already known —
             asking "which meal?" when you tapped the breakfast slot is a
             question with one possible answer. */
          onClick={() => (slot ? plan(slot) : setPicking(true))}
        >
          Plan
        </button>
        <button
          className="btn"
          onClick={() => {
            const items = resolved.items.map((it) => ({
              ...it,
              servings: it.servings * scale,
              nutrients: scaleNutrients(it.nutrients, scale),
            }))
            logItems(items, date ?? today(), 'recipe')
            setNote(`Logged ${cal(resolved.perServing.calories * servings)} cal to your diary`)
          }}
        >
          Log to diary
        </button>
      </div>

      {picking && (
        <div className="scrim" onClick={() => setPicking(false)} role="presentation">
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="sheet__grip" />
            <div className="sheet__title">Plan this for</div>
            {MEAL_SLOTS.map((s) => (
              <button key={s} className="row" onClick={() => plan(s)}>
                <span className="row__main row__title">{SLOT_LABELS[s]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * What the calorie figure leaves out, and why.
 *
 * The two reasons need different sentences. "To taste" is uncountable by
 * nature and nothing is wrong; an unrecognised food is a gap that a more
 * specific name would close. Saying "not in the food database" for a pinch of
 * salt sends people hunting for a problem that isn't there.
 */
function UncountedNote({
  lines,
}: {
  lines: NonNullable<ReturnType<typeof resolveRecipe>>['lines']
}) {
  const toTaste = lines.filter((l) => !l.nutrients && l.reason === 'no-amount').length
  const missing = lines.filter((l) => !l.nutrients && l.reason !== 'no-amount').length
  const parts: string[] = []
  if (toTaste) {
    parts.push(
      `${toTaste} ${toTaste === 1 ? 'ingredient gives' : 'ingredients give'} no amount, so ${
        toTaste === 1 ? 'it is' : 'they are'
      } left out`,
    )
  }
  if (missing) {
    parts.push(
      `${missing} ${missing === 1 ? 'is' : 'are'} not in the food database`,
    )
  }
  if (!parts.length) return null

  return (
    <div className="hint" style={{ color: 'var(--text-3)' }}>
      {parts.join(', and ')} — none of it counts toward the calories above.
    </div>
  )
}

function HealthPanel({ resolved }: { resolved: NonNullable<ReturnType<typeof resolveRecipe>> }) {
  const { health } = resolved
  return (
    <>
      <div className="card" style={{ paddingBottom: 8 }}>
        <div className="hscore">
          <div>
            <span
              className="hscore__value"
              style={{
                color:
                  health.band === 'Great'
                    ? 'var(--positive)'
                    : health.band === 'Low'
                      ? 'var(--danger)'
                      : 'var(--warning)',
              }}
            >
              {health.score}
            </span>
            <span className="hscore__out">/10</span>
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>Health score</div>
            <div style={{ color: 'var(--text-2)', fontSize: 13 }}>{health.band}</div>
          </div>
        </div>
        <div className="hint" style={{ paddingTop: 0 }}>
          Worked out from nutrient density against FDA daily values, on the seventeen
          nutrients LogPal tracks. Calories are not scored — a calorie is not good or bad
          on its own, which is why this sits beside the count rather than replacing it.
        </div>
      </div>

      {health.positive.length > 0 && (
        <>
          <div className="section-label">Nutrients with positive impact</div>
          <div className="card" style={{ paddingTop: 6, paddingBottom: 10 }}>
            {health.positive.map((n) => (
              <NutrientBar key={n.key} n={n} tone="var(--positive)" />
            ))}
          </div>
        </>
      )}

      {health.negative.length > 0 && (
        <>
          <div className="section-label">Nutrients to keep an eye on</div>
          <div className="card" style={{ paddingTop: 6, paddingBottom: 10 }}>
            {health.negative.map((n) => (
              <NutrientBar key={n.key} n={n} tone="var(--danger)" />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function NutrientBar({
  n,
  tone,
}: {
  n: { label: string; amount: number; unit: string; dv: number }
  tone: string
}) {
  const pct = Math.round(n.dv * 100)
  return (
    <div className="hbar">
      <div className="hbar__top">
        <span>
          {n.label} <span className="hbar__amount">{Math.round(n.amount)}{n.unit === 'cal' ? '' : n.unit}</span>
        </span>
        <span className="hbar__amount">{pct}% DV</span>
      </div>
      <div className="hbar__track">
        <span
          className="hbar__fill"
          style={{ width: `${Math.min(100, pct)}%`, background: tone }}
        />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- shopping list -- */

export function ShoppingList() {
  const {
    pop,
    data,
    toggleShoppingItem,
    addShoppingItem,
    clearCheckedShopping,
    addPlanToShoppingList,
  } = useApp()
  const [entry, setEntry] = useState('')
  const [tab, setTab] = useState<'list' | 'pantry'>('list')
  const [note, setNote] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const by = new Map<string, typeof data.shopping>()
    for (const it of data.shopping) {
      const list = by.get(it.aisle) ?? []
      list.push(it)
      by.set(it.aisle, list)
    }
    return [...by.entries()].sort((a, b) => sortAisles(a[0], b[0]))
  }, [data.shopping])

  const done = data.shopping.filter((i) => i.checked).length

  return (
    <>
      <TopBar
        title="Shopping list"
        onBack={pop}
        solid
        right={
          done > 0 ? (
            <button className="textbtn" style={{ padding: 0 }} onClick={clearCheckedShopping}>
              Clear {done}
            </button>
          ) : undefined
        }
      />

      <Tabs
        tabs={[
          { key: 'list' as const, label: `Shopping list ${data.shopping.length || ''}`.trim() },
          { key: 'pantry' as const, label: 'Food list' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="scroll">
        {tab === 'list' ? (
          <>
            <div className="searchbar">
              <div className="searchbar__box">
                <Icon name="plus" size={17} />
                <input
                  className="searchbar__input"
                  placeholder="Add an item"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && entry.trim()) {
                      addShoppingItem(entry)
                      setEntry('')
                    }
                  }}
                />
              </div>
            </div>

            {data.shopping.length === 0 ? (
              <Empty title="Your list is empty">
                <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
                  Add a recipe's ingredients from the recipe itself, or pull in everything
                  you have planned for the week.
                </div>
              </Empty>
            ) : (
              grouped.map(([aisle, items]) => (
                <div key={aisle}>
                  <div className="saisle">{aisle}</div>
                  <div className="card" style={{ paddingTop: 0, paddingBottom: 0 }}>
                    {items.map((it) => (
                      <button
                        key={it.id}
                        className={`sitem ${it.checked ? 'sitem--done' : ''}`}
                        onClick={() => toggleShoppingItem(it.id)}
                      >
                        <span className="sitem__box">
                          <Icon name="check" size={14} strokeWidth={3} />
                        </span>
                        <span className="sitem__name">{it.name}</span>
                        {it.amount && <span className="sitem__amount">{it.amount}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}

            <div className="btn-wrap">
              <button
                className="btn btn--ghost"
                onClick={() => {
                  const n = addPlanToShoppingList(today(), addDays(today(), 6))
                  setNote(
                    n
                      ? `${n} item${n === 1 ? '' : 's'} added from your plan`
                      : 'Nothing new to add — the week is already on your list',
                  )
                }}
              >
                Add this week's plan
              </button>
            </div>
            {note && (
              <div className="hint" style={{ color: 'var(--accent)' }}>
                {note}
              </div>
            )}
          </>
        ) : (
          <PantryTab />
        )}
        <div style={{ height: 16 }} />
      </div>
    </>
  )
}

/**
 * The Food List: staples you already have.
 *
 * Its only job is subtraction. Anything named here is skipped when a recipe's
 * ingredients are folded into the shopping list, which is what stops a list of
 * twelve things being a list of four things and eight you own already.
 */
function PantryTab() {
  const { data, togglePantry } = useApp()
  const [entry, setEntry] = useState('')

  const COMMON = ['salt', 'pepper', 'olive oil', 'flour', 'sugar', 'butter', 'eggs', 'milk', 'rice', 'pasta']

  return (
    <>
      <div className="searchbar">
        <div className="searchbar__box">
          <Icon name="plus" size={17} />
          <input
            className="searchbar__input"
            placeholder="Something you always have"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && entry.trim()) {
                togglePantry(entry)
                setEntry('')
              }
            }}
          />
        </div>
      </div>

      <div className="hint">
        Anything here is left off your shopping list when you add a recipe, so the list is
        only what you actually need to buy.
      </div>

      {data.pantry.length > 0 && (
        <div className="card" style={{ paddingTop: 0, paddingBottom: 0 }}>
          {data.pantry.map((p) => (
            <button key={p} className="sitem sitem--done" onClick={() => togglePantry(p)}>
              <span className="sitem__box">
                <Icon name="check" size={14} strokeWidth={3} />
              </span>
              <span className="sitem__name" style={{ textDecoration: 'none', color: 'var(--text)' }}>
                {p}
              </span>
              <span className="sitem__amount">Remove</span>
            </button>
          ))}
        </div>
      )}

      <div className="section-label">Common staples</div>
      <div className="chips" style={{ padding: '0 14px 12px', flexWrap: 'wrap', gap: 8 }}>
        {COMMON.filter((c) => !data.pantry.includes(c)).map((c) => (
          <button key={c} className="chip" onClick={() => togglePantry(c)}>
            + {c}
          </button>
        ))}
      </div>
    </>
  )
}
