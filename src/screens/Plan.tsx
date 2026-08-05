import { useMemo } from 'react'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Row, TopBar } from '../components/ui'
import { cal } from '../lib/format'
import { sumNutrients } from '../lib/nutrition'

/**
 * Plan tab: everything you'd reach for to set up eating rather than record it —
 * saved meals to repeat, recipes to build, and your targets.
 */
export function Plan() {
  const { push, data, plan, profile } = useApp()

  /** Meals you've logged most often, offered back as one-tap repeats. */
  const repeats = useMemo(() => {
    const counts = new Map<string, { name: string; kcal: number; n: number }>()
    for (const e of data.foodEntries) {
      const cur = counts.get(e.foodId)
      if (cur) cur.n++
      else counts.set(e.foodId, { name: e.name, kcal: e.nutrients.calories, n: 1 })
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 5)
  }, [data.foodEntries])

  return (
    <>
      <TopBar />
      <div className="scroll">
        <div className="pagetitle">Plan</div>

        <div className="card">
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
              Your daily targets
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {(
                [
                  ['Calories', cal(plan.calories), 'var(--accent)'],
                  ['Carbs', `${plan.macros.carbs} g`, 'var(--carbs)'],
                  ['Fat', `${plan.macros.fat} g`, 'var(--fat)'],
                  ['Protein', `${plan.macros.protein} g`, 'var(--protein)'],
                ] as [string, string, string][]
              ).map(([label, value, color]) => (
                <div key={label}>
                  <div
                    style={{ height: 3, borderRadius: 999, background: color, marginBottom: 7 }}
                  />
                  <div className="num" style={{ fontSize: 15, fontWeight: 800 }}>
                    {value}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
          <Row
            title={profile.planMode === 'custom' ? 'Custom plan' : 'Calculated plan'}
            sub="Change your goal, pace, macros or water"
            chevron
            onClick={() => push({ name: 'goals' })}
          />
        </div>

        <div className="section-head">
          <span>Repeat meals</span>
        </div>
        <div className="card">
          {repeats.length === 0 ? (
            <div className="hint">
              Log a few foods and your most-used ones show up here for one-tap repeats.
            </div>
          ) : (
            repeats.map((r) => (
              <Row
                key={r.name}
                title={r.name}
                sub={`${cal(r.kcal)} cal · logged ${r.n}×`}
                chevron
                onClick={() => push({ name: 'foodSearch', date: new Date().toISOString().slice(0, 10) })}
              />
            ))
          )}
        </div>

        <div className="section-head">
          <span>My meals</span>
          <button className="textbtn" style={{ padding: 0 }} onClick={() => push({ name: 'meals' })}>
            View all
          </button>
        </div>
        <div className="card">
          {data.savedMeals.length === 0 ? (
            <div className="hint">
              Bundle the foods you eat together into a named meal and log it in one tap.
            </div>
          ) : (
            data.savedMeals.slice(0, 4).map((m) => (
              <Row
                key={m.id}
                title={m.name}
                sub={`${m.items.length} item${m.items.length === 1 ? '' : 's'}`}
                value={cal(sumNutrients(m.items.map((i) => i.nutrients)).calories)}
                chevron
                onClick={() => push({ name: 'mealEditor', mealId: m.id })}
              />
            ))
          )}
          <Row
            className="row--link"
            title="Create a meal"
            onClick={() => push({ name: 'mealEditor' })}
          />
        </div>

        <div className="section-head">
          <span>My recipes</span>
          <button
            className="textbtn"
            style={{ padding: 0 }}
            onClick={() => push({ name: 'recipes' })}
          >
            View all
          </button>
        </div>
        <div className="card">
          {data.recipes.length === 0 ? (
            <div className="hint">
              Keep your homemade recipes in one place, ready to log by the serving.
            </div>
          ) : (
            data.recipes.slice(0, 4).map((r) => {
              const total = sumNutrients(r.items.map((i) => i.nutrients)).calories
              return (
                <Row
                  key={r.id}
                  title={r.name}
                  sub={`${r.servingsMade} servings`}
                  value={`${cal(total / Math.max(1, r.servingsMade))} cal`}
                  chevron
                  onClick={() => push({ name: 'recipeEditor', recipeId: r.id })}
                />
              )
            })
          )}
          <Row
            className="row--link"
            title="Create a recipe"
            onClick={() => push({ name: 'recipeEditor' })}
          />
        </div>

        <div className="section-head">
          <span>My foods</span>
        </div>
        <div className="card">
          <Row
            title="Custom foods"
            sub="Foods you've entered yourself"
            value={data.customFoods.length}
            chevron
            onClick={() => push({ name: 'myFoods' })}
          />
          <Row
            className="row--link"
            title="Create a food"
            onClick={() => push({ name: 'createFood' })}
          />
        </div>

        <div className="section-head">
          <span>Shortcuts</span>
        </div>
        <div className="card">
          <Row
            title="Barcode scan"
            left={<Ico name="barcode" />}
            chevron
            onClick={() => push({ name: 'scan', date: new Date().toISOString().slice(0, 10) })}
          />
          <Row
            title="Quick add calories"
            left={<Ico name="plus" />}
            chevron
            onClick={() => push({ name: 'quickAdd', date: new Date().toISOString().slice(0, 10) })}
          />
        </div>
      </div>
    </>
  )
}

function Ico({ name }: { name: 'barcode' | 'plus' }) {
  return (
    <span style={{ color: 'var(--accent)', display: 'flex', flex: 'none' }}>
      <Icon name={name} size={20} />
    </span>
  )
}
