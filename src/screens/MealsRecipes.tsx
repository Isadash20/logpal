import { useMemo, useState } from 'react'
import type { Food, MealItem, Recipe, SavedMeal } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Empty, Row, Sheet, SheetAction, TopBar } from '../components/ui'
import { MacroSummary } from '../components/nutrition'
import { searchLocal } from '../services/foodSearch'
import { scaleNutrients, sumNutrients } from '../lib/nutrition'
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
            A meal bundles several foods so you can log them together — a usual breakfast,
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

export function RecipeEditor({ recipeId }: { recipeId?: string }) {
  const { pop, data, saveRecipe } = useApp()
  const existing = recipeId ? data.recipes.find((r) => r.id === recipeId) : undefined

  const [name, setName] = useState(existing?.name ?? '')
  const [servingsMade, setServingsMade] = useState(String(existing?.servingsMade ?? 4))
  const [items, setItems] = useState<MealItem[]>(existing?.items ?? [])
  const [picking, setPicking] = useState(false)

  const totals = useMemo(() => sumNutrients(items.map((i) => i.nutrients)), [items])
  const made = Math.max(1, parseFloat(servingsMade) || 1)
  const perServing = scaleNutrients(totals, 1 / made)

  return (
    <>
      <TopBar
        title={existing ? 'Edit Recipe' : 'Create Recipe'}
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
            <span className="field__label">Recipe Name</span>
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
            <span className="field__label">Servings Made</span>
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

        <ItemList
          items={items}
          onChange={setItems}
          onAdd={() => setPicking(true)}
          label="Ingredients"
        />

        <div className="card">
          <div className="card__head">
            <span className="card__title">Per Serving</span>
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
            Create a food when something isn&apos;t in the database — homemade dishes,
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
  const results = useMemo(
    () => searchLocal(query, data.customFoods, 40),
    [query, data.customFoods]
  )

  return (
    <Sheet title="Add Food" onClose={onClose}>
      <div className="searchbar" style={{ borderBottom: 0 }}>
        <div className="searchbar__box">
          <Icon name="search" size={17} />
          <input
            className="searchbar__input"
            placeholder="Search foods"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
        {results.map((f) => {
          const serving = f.servings[0]
          return (
            <Row
              key={f.id}
              title={f.name}
              sub={[f.brand, serving.label].filter(Boolean).join(', ')}
              value={cal(f.nutrients.calories * serving.multiplier)}
              onClick={() =>
                onPick({
                  foodId: f.id,
                  name: f.name,
                  brand: f.brand,
                  servingLabel: serving.label,
                  servings: 1,
                  nutrients: scaleNutrients(f.nutrients, serving.multiplier),
                })
              }
            />
          )
        })}
      </div>
    </Sheet>
  )
}
