import { useMemo, useState } from 'react'
import { type Food } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/ui'
import { MacroSummary, NutritionLabel } from '../components/nutrition'
import { Donut } from '../components/charts'
import { cal } from '../lib/format'
import { macroPercents, scaleNutrients } from '../lib/nutrition'

export function FoodDetail({
  food,
  date,
  entryId,
  servings: initialServings,
  servingLabel,
}: {
  food: Food
  date: string
  entryId?: string
  servings?: number
  servingLabel?: string
}) {
  const app = useApp()
  const { pop, data } = app

  const [servingIdx, setServingIdx] = useState(() => {
    const i = food.servings.findIndex((s) => s.label === servingLabel)
    return i >= 0 ? i : 0
  })
  const [count, setCount] = useState(String(initialServings ?? 1))

  const serving = food.servings[servingIdx] ?? food.servings[0]
  const n = useMemo(() => {
    const qty = parseFloat(count)
    const factor = (Number.isFinite(qty) ? qty : 0) * serving.multiplier
    return scaleNutrients(food.nutrients, factor)
  }, [food.nutrients, serving.multiplier, count])

  const percents = macroPercents(n)
  const isFavorite = data.favoriteFoodIds.includes(food.id)
  function save() {
    const qty = parseFloat(count)
    if (!Number.isFinite(qty) || qty <= 0) return
    app.logFood({
      food,
      date,
      servings: qty,
      servingLabel: serving.label,
      nutrients: n,
      entryId,
    })
    pop()
  }

  /** Common portions, so the usual case is one tap rather than typing. */
  const quickCounts = [0.5, 1, 1.5, 2, 3]

  return (
    <>
      <TopBar
        title={entryId ? 'Edit Entry' : 'Add Food'}
        onBack={pop}
        right={
          <>
            {/* Foods get a star; meals get a bookmark. Both fill solid when
                on, so "saved" reads the same way in either place without the
                two ever becoming the same control. */}
            <button
              className={`iconbtn ${isFavorite ? 'iconbtn--saved' : ''}`}
              onClick={() => app.toggleFavorite(food.id)}
              aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            >
              <Icon name={isFavorite ? 'star-filled' : 'star'} size={21} />
            </button>
            <button className="iconbtn iconbtn--accent" onClick={save} aria-label="Save">
              <Icon name="check" size={24} strokeWidth={2.6} />
            </button>
          </>
        }
      />

      <div className="scroll">
        {isFavorite && (
          <div className="hint" style={{ color: 'var(--text-2)', paddingBottom: 0 }}>
            Starred, find it under My Favourites when you search for a food.
          </div>
        )}
        <div style={{ padding: '18px 16px 12px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>{food.name}</div>
          {food.brand && (
            <div style={{ color: 'var(--text-2)', marginTop: 2, fontSize: 14 }}>
              {food.brand}
            </div>
          )}
          {food.source === 'off' && (
            <span className="badge" style={{ display: 'inline-block', marginTop: 8 }}>
              OPEN FOOD FACTS
            </span>
          )}
          {food.source === 'usda' && (
            <span className="badge" style={{ display: 'inline-block', marginTop: 8 }}>
              USDA
            </span>
          )}
          {food.source === 'seed' && (
            <span className="badge" style={{ display: 'inline-block', marginTop: 8 }}>
              VERIFIED
            </span>
          )}
        </div>

        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '18px 16px',
            marginBottom: 12,
          }}
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
                <div
                  className="num"
                  style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}
                >
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

        <div className="btn-wrap" style={{ display: 'grid', gap: 10 }}>
          <button className="btn" onClick={save}>
            {entryId ? 'Save changes' : 'Log this food'}
          </button>
          {entryId && (
            <button
              className="btn btn--danger"
              onClick={() => {
                app.deleteEntry(entryId)
                pop()
              }}
            >
              Delete Entry
            </button>
          )}
        </div>
      </div>
    </>
  )
}
