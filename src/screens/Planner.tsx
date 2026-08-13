import { useMemo, useState } from 'react'
import type { MealSlot, Recipe } from '../types'
import { MEAL_SLOTS, SLOT_LABELS } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Empty, Row, Tabs, TopBar } from '../components/ui'
import { addDays, friendlyDate, today } from '../lib/dates'
import { cal } from '../lib/format'
import { scaleNutrients } from '../lib/nutrition'
import { formatAmount, formatQuantity, parseIngredient } from '../lib/ingredients'
import { sortAisles } from '../data/aisles'
import {
  allRecipes,
  allTags,
  formatMinutes,
  ingredientCount,
  resolveRecipe,
  searchRecipes,
  totalMinutes,
} from '../services/recipes'

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
  onClick,
}: {
  recipe: Recipe
  variant?: 'grid' | 'rail'
  slot?: MealSlot
  logged?: boolean
  onClick(): void
}) {
  const mins = totalMinutes(recipe)
  const tag = recipe.tags?.[0]
  const { data } = useApp()
  const resolved = resolveRecipe(recipe, [...data.customFoods, ...Object.values(data.foodCache)])

  return (
    <button className={`rcard ${variant === 'rail' ? 'rcard--rail' : ''}`} onClick={onClick}>
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
  )
}

/* ---------------------------------------------------------------- planner -- */

const DAYS_SHOWN = 7

export function Planner() {
  const app = useApp()
  const { pop, push, data, calorieTarget, planFor, plannedCalories } = app

  const days = useMemo(
    () => Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today(), i)),
    [],
  )

  const planned = data.planEntries.length

  return (
    <>
      <TopBar
        title="Meal plan"
        onBack={pop}
        solid
        right={
          <button
            className="iconbtn"
            onClick={() => push({ name: 'shoppingList' })}
            aria-label="Shopping list"
          >
            <Icon name="bookmark" size={21} />
          </button>
        }
      />

      <div className="scroll">
        {!planned && (
          <div className="hint" style={{ paddingTop: 14 }}>
            Put a recipe on a day and it shows up here with its calories counted
            against your target. Nothing is logged to your diary until you say so.
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

        <div className="btn-wrap">
          <button
            className="btn btn--ghost"
            onClick={() => push({ name: 'shoppingList' })}
          >
            Shopping list
          </button>
        </div>
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

export function RecipeBrowse({ date, slot }: { date?: string; slot?: MealSlot }) {
  const { pop, push, data } = useApp()
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)

  const recipes = useMemo(() => allRecipes(data.recipes), [data.recipes])
  const tagOptions = useMemo(() => allTags(recipes), [recipes])
  const results = useMemo(
    () => searchRecipes(recipes, query, { tags }),
    [recipes, query, tags],
  )

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))

  return (
    <>
      <TopBar title={date ? `Add to ${friendlyDate(date)}` : 'Recipes'} onBack={pop} solid />

      <div className="searchbar">
        <div className="searchbar__box">
          <Icon name="search" size={17} />
          <input
            className="searchbar__input"
            placeholder="Search recipes and ingredients"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear">
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
        <button
          className="iconbtn"
          onClick={() => setShowFilters((v) => !v)}
          aria-label="Filters"
        >
          <Icon name="menu" size={20} />
        </button>
      </div>

      {showFilters && (
        <div className="chips" style={{ padding: '10px 14px', flexWrap: 'wrap', gap: 8 }}>
          {tagOptions.map((t) => (
            <button
              key={t}
              className={`chip ${tags.includes(t) ? 'chip--active' : ''}`}
              onClick={() => toggleTag(t)}
            >
              {t}
            </button>
          ))}
          {tags.length > 0 && (
            <button className="textbtn" style={{ padding: 0 }} onClick={() => setTags([])}>
              Clear
            </button>
          )}
        </div>
      )}

      <div className="scroll">
        {results.length === 0 ? (
          <Empty title="Nothing matches">
            <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
              Try a different word, or clear the filters. Your own recipes are searched
              alongside the built-in ones.
            </div>
          </Empty>
        ) : (
          <div className="rgrid">
            {results.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                onClick={() => push({ name: 'recipeView', recipeId: r.id, date, slot })}
              />
            ))}
          </div>
        )}
        <div style={{ height: 20 }} />
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
  const { pop, data, planMeal, logItems, addRecipeToShoppingList } = app

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
    [recipe, data.customFoods, data.foodCache],
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
      <TopBar title={recipe.name} onBack={pop} solid />

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
                      {parsed.qty != null
                        ? formatAmount(parsed.qty * scale, parsed.unit)
                        : ''}
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
            {(recipe.steps ?? []).map((s, i) => (
              <div key={i} className="step">
                <div className="step__n">STEP {i + 1}</div>
                <div className="step__text">{s}</div>
              </div>
            ))}
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
