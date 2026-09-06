import { useEffect, useMemo, useRef, useState } from 'react'
import type { Food, MealItem, Recipe, SavedMeal } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Empty, Row, Sheet, SheetAction, TopBar } from '../components/ui'
import { MacroSummary, NutritionLabel } from '../components/nutrition'
import { Donut } from '../components/charts'
import { searchLocal } from '../services/foodSearch'
import { loadFoodDb, onFoodDbGrown } from '../services/foodDb'
import { macroPercents, scaleNutrients, sumNutrients } from '../lib/nutrition'
import { cal, entrySubtitle } from '../lib/format'
import { uid } from '../lib/id'

/* ------------------------------------------------------------- my meals -- */

export function MealsList() {
  const { pop, push, data, deleteMeal } = useApp()
  const [menu, setMenu] = useState<SavedMeal | null>(null)

  return (
    <>
      <TopBar
        title="My Meals"
        onBack={pop}
        right={
          <button
            className="iconbtn iconbtn--accent"
            onClick={() => push({ name: 'mealEditor' })}
            aria-label="Create meal"
          >
            <Icon name="plus" size={22} strokeWidth={2.4} />
          </button>
        }
      />
      <div className="scroll">
        {data.savedMeals.length === 0 ? (
          <Empty title="No saved meals">
            A meal bundles several foods so you can log them together. A usual breakfast,
            a go-to lunch.
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
                onClick={() => push({ name: 'mealEditor', mealId: m.id })}
                right={
                  <button
                    className="iconbtn"
                    style={{ width: 32, height: 32 }}
                    onClick={() => setMenu(m)}
                    aria-label="Meal options"
                  >
                    <Icon name="more" size={18} strokeWidth={2.6} />
                  </button>
                }
              />
            )
          })
        )}
      </div>

      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <SheetAction
            icon="edit"
            label="Edit Meal"
            onClick={() => {
              push({ name: 'mealEditor', mealId: menu.id })
              setMenu(null)
            }}
          />
          <SheetAction
            icon="trash"
            label="Delete Meal"
            danger
            onClick={() => {
              deleteMeal(menu.id)
              setMenu(null)
            }}
          />
        </Sheet>
      )}
    </>
  )
}

export function MealEditor({ mealId }: { mealId?: string }) {
  const { pop, data, saveMeal } = useApp()
  const existing = mealId ? data.savedMeals.find((m) => m.id === mealId) : undefined

  const [name, setName] = useState(existing?.name ?? '')
  const [items, setItems] = useState<MealItem[]>(existing?.items ?? [])
  const [picking, setPicking] = useState(false)

  const totals = useMemo(() => sumNutrients(items.map((i) => i.nutrients)), [items])

  return (
    <>
      <TopBar
        title={existing ? 'Edit Meal' : 'Create Meal'}
        onBack={pop}
        right={
          <button
            className="textbtn"
            disabled={!name.trim() || items.length === 0}
            onClick={() => {
              saveMeal({
                id: existing?.id ?? uid('m'),
                name: name.trim(),
                items,
                createdAt: existing?.createdAt ?? Date.now(),
              })
              pop()
            }}
          >
            Save
          </button>
        }
      />
      <div className="scroll">
        <div className="card" style={{ marginTop: 0 }}>
          <label className="field">
            <span className="field__label">Meal Name</span>
            <span className="field__control">
              <input
                className="input"
                placeholder="e.g. Usual Breakfast"
                value={name}
                autoFocus={!existing}
                onChange={(e) => setName(e.target.value)}
              />
            </span>
          </label>
        </div>

        <ItemList items={items} onChange={setItems} onAdd={() => setPicking(true)} />

        <div className="card">
          <div className="card__head">
            <span className="card__title">Meal Total</span>
            <span className="num" style={{ fontWeight: 700 }}>
              {cal(totals.calories)} cal
            </span>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <MacroSummary n={totals} />
          </div>
        </div>
      </div>

      {picking && (
        <IngredientPicker
          onClose={() => setPicking(false)}
          onPick={(item) => {
            setItems((p) => [...p, item])
            setPicking(false)
          }}
        />
      )}
    </>
  )
}

/* -------------------------------------------------------------- recipes -- */

export function RecipesList() {
  const { pop, push, data, deleteRecipe } = useApp()
  const [menu, setMenu] = useState<Recipe | null>(null)

  return (
    <>
      <TopBar
        title="My Recipes"
        onBack={pop}
        right={
          <button
            className="iconbtn iconbtn--accent"
            onClick={() => push({ name: 'recipeEditor' })}
            aria-label="Create recipe"
          >
            <Icon name="plus" size={22} strokeWidth={2.4} />
          </button>
        }
      />
      <div className="scroll">
        {data.recipes.length === 0 ? (
          <Empty title="No recipes">
            Add the ingredients once, say how many servings it makes, and log it by the
            serving from then on.
          </Empty>
        ) : (
          data.recipes.map((r) => {
            const total = r.items.reduce((s, i) => s + i.nutrients.calories, 0)
            return (
              <Row
                key={r.id}
                title={r.name}
                sub={`${r.items.length} ingredients · ${r.servingsMade} servings`}
                value={`${cal(total / Math.max(1, r.servingsMade))} cal`}
                onClick={() => push({ name: 'recipeEditor', recipeId: r.id })}
                right={
                  <button
                    className="iconbtn"
                    style={{ width: 32, height: 32 }}
                    onClick={() => setMenu(r)}
                    aria-label="Recipe options"
                  >
                    <Icon name="more" size={18} strokeWidth={2.6} />
                  </button>
                }
              />
            )
          })
        )}
      </div>

      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <SheetAction
            icon="edit"
            label="Edit Recipe"
            onClick={() => {
              push({ name: 'recipeEditor', recipeId: menu.id })
              setMenu(null)
            }}
          />
          <SheetAction
            icon="trash"
            label="Delete Recipe"
            danger
            onClick={() => {
              deleteRecipe(menu.id)
              setMenu(null)
            }}
          />
        </Sheet>
      )}
    </>
  )
}

/**
 * Building a recipe out of real foods.
 *
 * Every line is a database food with a serving and a count, so the nutrition
 * is the sum of things that were actually measured rather than an estimate
 * parsed back out of prose. That is the difference between this and the
 * catalogue: a recipe someone wrote here knows exactly what is in it.
 *
 * Shaped after the reference app's own flow, which is the one people already
 * know: photograph at the top, then the name, then a running total that
 * updates as ingredients go in, then the method.
 */
export function RecipeEditor({ recipeId }: { recipeId?: string }) {
  const { pop, data, saveRecipe } = useApp()
  const existing = recipeId ? data.recipes.find((r) => r.id === recipeId) : undefined

  const [name, setName] = useState(existing?.name ?? '')
  const [servingsMade, setServingsMade] = useState(String(existing?.servingsMade ?? 4))
  const [items, setItems] = useState<MealItem[]>(existing?.items ?? [])
  const [steps, setSteps] = useState((existing?.steps ?? []).join('\n'))
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl)
  const [picking, setPicking] = useState(false)
  const [showFacts, setShowFacts] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const totals = useMemo(() => sumNutrients(items.map((i) => i.nutrients)), [items])
  const made = Math.max(1, parseFloat(servingsMade) || 1)
  const perServing = scaleNutrients(totals, 1 / made)

  return (
    <>
      <TopBar
        title={existing ? 'Edit recipe' : 'Create a recipe'}
        onBack={pop}
        right={
          <button
            className="textbtn"
            disabled={!name.trim() || items.length === 0}
            onClick={() => {
              saveRecipe({
                id: existing?.id ?? uid('r'),
                name: name.trim(),
                servingsMade: made,
                items,
                createdAt: existing?.createdAt ?? Date.now(),
                imageUrl,
                steps: steps
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean),
              })
              pop()
            }}
          >
            Save
          </button>
        }
      />
      <div className="scroll">
        {/* The photograph, first, because it is what the recipe will look like
            on the Plan shelves beside the catalogue's own. */}
        <button className="rphoto" onClick={() => fileRef.current?.click()}>
          {imageUrl ? (
            <img className="rphoto__img" src={imageUrl} alt="" />
          ) : (
            <span className="rphoto__empty">
              <Icon name="camera" size={26} />
              Add photo
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) setImageUrl(await downscale(file))
            e.target.value = ''
          }}
        />
        {imageUrl && (
          <div style={{ padding: '6px 16px 0' }}>
            <button className="textbtn" style={{ padding: 0 }} onClick={() => setImageUrl(undefined)}>
              Remove photo
            </button>
          </div>
        )}

        <div className="card">
          <label className="field">
            <span className="field__label">Name</span>
            <span className="field__control">
              <input
                className="input"
                placeholder="e.g. Chili"
                value={name}
                autoFocus={!existing}
                onChange={(e) => setName(e.target.value)}
              />
            </span>
          </label>
          <label className="field">
            <span className="field__label">Servings made</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min="1"
                value={servingsMade}
                onChange={(e) => setServingsMade(e.target.value)}
              />
            </span>
          </label>
        </div>

        {/* Running totals, per serving, updated as each ingredient lands. */}
        <div className="card">
          <div className="card__head">
            <span className="card__title">Per serving</span>
            <span className="num" style={{ fontWeight: 700 }}>
              {cal(perServing.calories)} cal
            </span>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <MacroSummary n={perServing} />
          </div>
          <div className="totals">
            <span>Whole recipe</span>
            <span className="totals__value">{cal(totals.calories)} cal</span>
          </div>
          <button
            className="row"
            onClick={() => setShowFacts((v) => !v)}
            style={{ justifyContent: 'center' }}
          >
            <span className="row__main row__title" style={{ textAlign: 'center' }}>
              {showFacts ? 'Hide nutrition facts' : 'Show nutrition facts'}
            </span>
          </button>
          {showFacts && <NutritionLabel n={perServing} />}
        </div>

        <ItemList
          items={items}
          onChange={setItems}
          onAdd={() => setPicking(true)}
          label="Ingredients"
        />

        <div className="card">
          <div className="card__head">
            <span className="card__title">Directions</span>
          </div>
          <div style={{ padding: '8px 16px 14px' }}>
            <textarea
              className="input input--boxed"
              style={{ width: '100%', minHeight: 120, resize: 'vertical', textAlign: 'left' }}
              placeholder={'One step a line'}
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
            />
          </div>
        </div>

        <div style={{ height: 20 }} />
      </div>

      {picking && (
        <IngredientPicker
          onClose={() => setPicking(false)}
          onPick={(item) => {
            setItems((p) => [...p, item])
            setPicking(false)
          }}
        />
      )}
    </>
  )
}

/**
 * A photograph small enough to live inside the recipe.
 *
 * Recipes sync as JSON, so the image travels with them: a phone photograph
 * would be several megabytes of base64 in a database row. Longest edge 900px
 * at moderate quality is about 80 KB and still sharp on a card.
 */
async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.72)
}

/* ------------------------------------------------------------- my foods -- */

export function MyFoods() {
  const { pop, push, data, deleteCustomFood } = useApp()
  const [menu, setMenu] = useState<Food | null>(null)

  return (
    <>
      <TopBar
        title="My Foods"
        onBack={pop}
        right={
          <button
            className="iconbtn iconbtn--accent"
            onClick={() => push({ name: 'createFood' })}
            aria-label="Create food"
          >
            <Icon name="plus" size={22} strokeWidth={2.4} />
          </button>
        }
      />
      <div className="scroll">
        {data.customFoods.length === 0 ? (
          <Empty title="No custom foods">
            Create a food when something isn&apos;t in the database, homemade dishes,
            local brands, supplements.
          </Empty>
        ) : (
          data.customFoods.map((f) => (
            <Row
              key={f.id}
              title={f.name}
              sub={[f.brand, f.servings[0]?.label].filter(Boolean).join(', ')}
              value={cal(f.nutrients.calories)}
              onClick={() => setMenu(f)}
            />
          ))
        )}
      </div>

      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <SheetAction
            icon="trash"
            label="Delete Food"
            danger
            onClick={() => {
              deleteCustomFood(menu.id)
              setMenu(null)
            }}
          />
        </Sheet>
      )}
    </>
  )
}

/* ------------------------------------------------------------ item list -- */

function ItemList({
  items,
  onChange,
  onAdd,
  label = 'Foods',
}: {
  items: MealItem[]
  onChange(items: MealItem[]): void
  onAdd(): void
  label?: string
}) {
  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">{label}</span>
        <span className="num" style={{ fontWeight: 700 }}>
          {items.length}
        </span>
      </div>

      {items.map((it, i) => (
        <Row
          key={i}
          title={it.name}
          sub={entrySubtitle({
            brand: it.brand,
            servings: it.servings,
            servingLabel: it.servingLabel,
          })}
          value={cal(it.nutrients.calories)}
          right={
            <button
              className="iconbtn"
              style={{ width: 32, height: 32, color: 'var(--danger)' }}
              onClick={() => onChange(items.filter((_, k) => k !== i))}
              aria-label={`Remove ${it.name}`}
            >
              <Icon name="close" size={18} strokeWidth={2.4} />
            </button>
          }
        />
      ))}

      <Row className="row--link" title={`Add ${label === 'Ingredients' ? 'Ingredient' : 'Food'}`} onClick={onAdd} />
    </div>
  )
}

/** Inline food picker used by the meal and recipe editors. */
function IngredientPicker({
  onClose,
  onPick,
}: {
  onClose(): void
  onPick(item: MealItem): void
}) {
  const { data } = useApp()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<Food | null>(null)
  const [dbSize, setDbSize] = useState(0)

  /* The whole database, not just the seed foods. This used to search whatever
     happened to be in memory, so a recipe built before the food search had
     been opened could see 324 foods. */
  useEffect(() => {
    void loadFoodDb()
    return onFoodDbGrown(() => setDbSize((n) => n + 1))
  }, [])

  const results = useMemo(
    () => (query.trim().length < 2 ? [] : searchLocal(query, data.customFoods, 40)),
    [query, data.customFoods, dbSize],
  )

  if (chosen) {
    return (
      <div className="fullsheet">
        <ServingPicker food={chosen} onBack={() => setChosen(null)} onAdd={onPick} />
      </div>
    )
  }

  return (
    <div className="fullsheet">
      <TopBar title="Add ingredient" onBack={onClose} solid />
      <div className="searchbar">
        <div className="searchbar__box">
          <Icon name="search" size={17} />
          <input
            className="searchbar__input"
            placeholder="Search foods"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear">
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
      </div>

      <div className="scroll">
        {results.map((f) => {
          const serving = f.servings[0]
          return (
            <Row
              key={f.id}
              title={f.name}
              sub={[f.brand, serving?.label].filter(Boolean).join(', ')}
              value={cal(f.nutrients.calories * (serving?.multiplier ?? 1))}
              chevron
              onClick={() => setChosen(f)}
            />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Serving size and how many, in the same shape as the food detail screen.
 *
 * Not a different control for the same decision: someone who has logged an
 * apple has already learned this screen, and adding an apple to a recipe asks
 * exactly the same two questions. The donut, the two fields and the quick
 * counts are the ones from Add Food, deliberately.
 */
function ServingPicker({
  food,
  onBack,
  onAdd,
}: {
  food: Food
  onBack(): void
  onAdd(item: MealItem): void
}) {
  const [servingIdx, setServingIdx] = useState(0)
  const [count, setCount] = useState('1')

  const serving = food.servings[servingIdx] ?? food.servings[0]
  const qty = parseFloat(count)
  const n = scaleNutrients(food.nutrients, (Number.isFinite(qty) ? qty : 0) * (serving?.multiplier ?? 1))
  const percents = macroPercents(n)

  /** Common portions, so the usual case is one tap rather than typing. */
  const quickCounts = [0.5, 1, 1.5, 2, 3]

  return (
    <>
      <TopBar
        title="Add ingredient"
        onBack={onBack}
        solid
        right={
          <button
            className="iconbtn iconbtn--accent"
            disabled={!Number.isFinite(qty) || qty <= 0}
            aria-label="Add"
            onClick={() =>
              onAdd({
                foodId: food.id,
                name: food.name,
                brand: food.brand,
                servingLabel: serving?.label ?? '1 serving',
                servings: qty,
                nutrients: n,
              })
            }
          >
            <Icon name="check" size={24} strokeWidth={2.6} />
          </button>
        }
      />

      <div className="scroll">
        <div style={{ padding: '18px 16px 12px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>{food.name}</div>
          {food.brand && (
            <div style={{ color: 'var(--text-2)', marginTop: 2, fontSize: 14 }}>{food.brand}</div>
          )}
        </div>

        <div
          className="card"
          style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '18px 16px', marginBottom: 12 }}
        >
          <Donut
            size={116}
            thickness={20}
            slices={[
              { label: 'Carbs', value: percents.carbs, color: 'var(--carbs)' },
              { label: 'Fat', value: percents.fat, color: 'var(--fat)' },
              { label: 'Protein', value: percents.protein, color: 'var(--protein)' },
            ]}
            center={
              <>
                <div className="num" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {cal(n.calories)}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-2)' }}>cal</div>
              </>
            }
          />
          <div style={{ flex: 1 }}>
            <MacroSummary n={n} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <label className="field">
            <span className="field__label">Serving Size</span>
            <span className="field__control">
              <select
                className="select"
                value={servingIdx}
                onChange={(e) => setServingIdx(+e.target.value)}
              >
                {food.servings.map((s, i) => (
                  <option key={i} value={i}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span style={{ color: 'var(--text-3)', display: 'flex' }}>
                <Icon name="down" size={16} strokeWidth={2.4} />
              </span>
            </span>
          </label>

          <label className="field">
            <span className="field__label">Number of Servings</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </span>
          </label>
        </div>

        <div className="chips">
          {quickCounts.map((q) => (
            <button
              key={q}
              className={`chip ${parseFloat(count) === q ? 'chip--active' : ''}`}
              onClick={() => setCount(String(q))}
            >
              {q} {q === 1 ? 'serving' : 'servings'}
            </button>
          ))}
        </div>

        <div className="section-label">Nutrition Facts</div>
        <NutritionLabel n={n} />

        <div className="btn-wrap">
          <button
            className="btn"
            disabled={!Number.isFinite(qty) || qty <= 0}
            onClick={() =>
              onAdd({
                foodId: food.id,
                name: food.name,
                brand: food.brand,
                servingLabel: serving?.label ?? '1 serving',
                servings: qty,
                nutrients: n,
              })
            }
          >
            Add ingredient
          </button>
        </div>
      </div>
    </>
  )
}
