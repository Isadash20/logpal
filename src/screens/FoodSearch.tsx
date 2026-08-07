import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { Food, Recipe } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Empty, Row, TopBar } from '../components/ui'
import { cal } from '../lib/format'
import { scaleNutrients, sumNutrients } from '../lib/nutrition'
import { looksLikeBarcode, searchLocal } from '../services/foodSearch'
import { loadFoodDb, onFoodDbGrown } from '../services/foodDb'
import { RateLimitedError, lookupBarcode, searchProducts } from '../services/openFoodFacts'

type Tab = 'all' | 'meals' | 'recipes' | 'myfoods'

export function FoodSearch({ date }: { date: string }) {
  const app = useApp()
  const { settings, data, push, pop } = app

  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<Food[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /* The bulk database is a separate static file; pull it down as soon as the
     search screen opens so results fill in without a visible wait. `searchLocal`
     reads it directly, so all this has to do is trigger the load and re-run the
     search once it lands — the counter is what makes the memo notice. */
  const [dbVersion, setDbVersion] = useState(0)
  useEffect(() => {
    let live = true
    void loadFoodDb()
    const off = onFoodDbGrown(() => live && setDbVersion((v) => v + 1))
    return () => {
      live = false
      off()
    }
  }, [])

  /* Scanning sixty thousand foods takes a few hundred milliseconds on a laptop
     and rather longer on a phone. Deferring it lets React paint the typed
     character first and abandon a half-finished result list as soon as the next
     keystroke arrives, so the field stays responsive at speed instead of
     running one full search per letter. */
  const deferredQuery = useDeferredValue(query)
  const localResults = useMemo(
    () =>
      searchLocal(deferredQuery, [...data.customFoods, ...Object.values(data.foodCache)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dbVersion is the
    // signal that the database behind searchLocal grew; it has no other use.
    [deferredQuery, data.customFoods, data.foodCache, dbVersion]
  )

  /* Debounced network search. Open Food Facts allows only ~10 searches per
     minute per IP, so the wait is deliberately long — a per-keystroke search
     exhausts the budget in seconds and the service then fails opaquely. The
     service layer additionally caches and throttles. */
  useEffect(() => {
    if (tab !== 'all') {
      setRemote([])
      return
    }
    const q = query.trim()
    if (q.length < 3) {
      setRemote([])
      setError(null)
      setLoading(false)
      return
    }

    const ctrl = new AbortController()
    setLoading(true)
    setError(null)

    const t = window.setTimeout(async () => {
      try {
        const found = looksLikeBarcode(q)
          ? [await lookupBarcode(q, ctrl.signal)].filter((f): f is Food => f !== null)
          : await searchProducts(q, ctrl.signal)
        if (!ctrl.signal.aborted) setRemote(found)
      } catch (err) {
        if (ctrl.signal.aborted || (err as Error).name === 'AbortError') return
        setRemote([])
        if (err instanceof RateLimitedError) {
          setError(
            `Open Food Facts limits how often it can be searched. Try again in about ${err.retryInSeconds}s — built-in results are still shown above.`
          )
        } else if ((err as Error).message === 'offline') {
          setError('Could not reach Open Food Facts. Check your connection.')
        } else {
          setError((err as Error).message)
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 700)

    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [query, settings.useOpenFoodFacts, tab])

  const recents = useMemo(() => {
    const out: Food[] = []
    for (const id of data.recentFoodIds) {
      const f = app.resolveFood(id)
      if (f) out.push(f)
      if (out.length >= 40) break
    }
    return out
  }, [data.recentFoodIds, app])

  const favorites = useMemo(
    () => data.favoriteFoodIds.map((id) => app.resolveFood(id)).filter(Boolean) as Food[],
    [data.favoriteFoodIds, app]
  )

  function quickLog(food: Food) {
    const serving = food.servings[0]
    app.logFood({
      food,
      date,
      servings: 1,
      servingLabel: serving.label,
      nutrients: scaleNutrients(food.nutrients, serving.multiplier),
    })
    pop()
  }

  function openFood(food: Food) {
    push({ name: 'foodDetail', food, date })
  }

  const showingSearch = query.trim().length > 0

  return (
    <>
      <TopBar
        title="Log food"
        onBack={pop}
        right={
          <button
            className="iconbtn iconbtn--accent"
            onClick={() => push({ name: 'scan', date })}
            aria-label="Scan barcode"
          >
            <Icon name="barcode" size={21} />
          </button>
        }
      />

      <div className="searchbar">
        <div className="searchbar__box">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            className="searchbar__input"
            placeholder="Search for a food"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {(
          [
            ['all', 'All'],
            ['meals', 'My Meals'],
            ['recipes', 'My Recipes'],
            ['myfoods', 'My Foods'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            className={`tabs__item ${tab === k ? 'tabs__item--active' : ''}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="scroll">
        {tab === 'all' && (
          <>
            {!showingSearch && favorites.length > 0 && (
              <>
                <div className="section-label">Favorites</div>
                {favorites.map((f) => (
                  <FoodRow key={f.id} food={f} onOpen={openFood} onAdd={quickLog} />
                ))}
              </>
            )}

            {!showingSearch && (
              <>
                <div className="section-label">
                  {recents.length ? 'Recent' : 'Common Foods'}
                </div>
                {(recents.length ? recents : localResults.slice(0, 30)).map((f) => (
                  <FoodRow key={f.id} food={f} onOpen={openFood} onAdd={quickLog} />
                ))}
              </>
            )}

            {showingSearch && (
              <>
                {localResults.length > 0 && (
                  <>
                    <div className="section-label">Food database</div>
                    {localResults.map((f) => (
                      <FoodRow key={f.id} food={f} onOpen={openFood} onAdd={quickLog} />
                    ))}
                  </>
                )}

                {settings.useOpenFoodFacts && (
                  <>
                    <div
                      className="section-label"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <span>Open Food Facts</span>
                      {loading && <span className="spinner" style={{ width: 13, height: 13 }} />}
                    </div>
                    {error && <div className="hint">{error}</div>}
                    {!loading && !error && remote.length === 0 && query.trim().length >= 3 && (
                      <div className="hint">No online matches.</div>
                    )}
                    {query.trim().length < 3 && (
                      <div className="hint">Type at least 3 characters to search online.</div>
                    )}
                    {remote.map((f) => (
                      <FoodRow key={f.id} food={f} onOpen={openFood} onAdd={quickLog} />
                    ))}
                  </>
                )}

                {localResults.length === 0 && remote.length === 0 && !loading && (
                  <div className="btn-wrap">
                    <button
                      className="btn btn--ghost"
                      onClick={() =>
                        push({ name: 'createFood', returnTo: { date } })
                      }
                    >
                      Create &ldquo;{query.trim()}&rdquo;
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'meals' && (
          <>
            {data.savedMeals.length === 0 ? (
              <Empty title="No saved meals">
                Save a meal from the diary&apos;s meal menu to log it again in one tap.
              </Empty>
            ) : (
              data.savedMeals.map((m) => {
                const kcal = m.items.reduce((s, i) => s + i.nutrients.calories, 0)
                return (
                  <Row
                    key={m.id}
                    title={m.name}
                    sub={`${m.items.length} item${m.items.length === 1 ? '' : 's'}`}
                    value={cal(kcal)}
                    onClick={() => {
                      app.logItems(m.items, date, 'meal')
                      pop()
                    }}
                  />
                )
              })
            )}
          </>
        )}

        {tab === 'recipes' && (
          <>
            {data.recipes.length === 0 ? (
              <Empty title="No recipes">
                Build a recipe from ingredients and log it by the serving.
              </Empty>
            ) : (
              data.recipes.map((r) => {
                const total = r.items.reduce((s, i) => s + i.nutrients.calories, 0)
                const per = total / Math.max(1, r.servingsMade)
                return (
                  <Row
                    key={r.id}
                    title={r.name}
                    sub={`${r.servingsMade} servings · ${cal(per)} cal per serving`}
                    value={cal(per)}
                    onClick={() => {
                      const food = recipeToFood(r)
                      openFood(food)
                    }}
                  />
                )
              })
            )}
            <div className="btn-wrap">
              <button
                className="btn btn--ghost"
                onClick={() => push({ name: 'recipeEditor' })}
              >
                Create a Recipe
              </button>
            </div>
          </>
        )}

        {tab === 'myfoods' && (
          <>
            {data.customFoods.length === 0 ? (
              <Empty title="No custom foods">
                Create a food to log something that isn&apos;t in the database.
              </Empty>
            ) : (
              data.customFoods.map((f) => (
                <FoodRow key={f.id} food={f} onOpen={openFood} onAdd={quickLog} />
              ))
            )}
            <div className="btn-wrap">
              <button
                className="btn btn--ghost"
                onClick={() => push({ name: 'createFood', returnTo: { date } })}
              >
                Create a Food
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/** Turns a saved recipe into a loggable food priced per serving. */
export function recipeToFood(r: Recipe): Food {
  const total = sumNutrients(r.items.map((i) => i.nutrients))
  return {
    id: `recipe_${r.id}`,
    name: r.name,
    nutrients: scaleNutrients(total, 1 / Math.max(1, r.servingsMade)),
    servings: [{ label: '1 serving', multiplier: 1 }],
    source: 'recipe',
    recipeId: r.id,
  }
}

function FoodRow({
  food,
  onOpen,
  onAdd,
}: {
  food: Food
  onOpen(f: Food): void
  onAdd(f: Food): void
}) {
  const serving = food.servings[0]
  const kcal = food.nutrients.calories * serving.multiplier
  const sub = [food.brand, serving.label].filter(Boolean).join(', ')

  return (
    <Row
      title={food.name}
      sub={sub}
      value={cal(kcal)}
      onClick={() => onOpen(food)}
      right={
        <button
          className="iconbtn iconbtn--accent"
          style={{ width: 34, height: 34 }}
          onClick={() => onAdd(food)}
          aria-label={`Quick add ${food.name}`}
        >
          <Icon name="plus" size={20} strokeWidth={2.4} />
        </button>
      }
    />
  )
}
