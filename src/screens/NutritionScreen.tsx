import { useState } from 'react'
import { MEAL_KEYS, PERIOD_LABELS, type NutrientKey } from '../types'
import { useApp } from '../state/store'
import { Tabs, TopBar } from '../components/ui'
import { Donut, Legend } from '../components/charts'
import { NUTRIENTS } from '../data/nutrients'
import { cal, grams, pct } from '../lib/format'
import { macroPercents } from '../lib/nutrition'
import { friendlyDate } from '../lib/dates'

type Tab = 'calories' | 'nutrients' | 'macros'

const MEAL_COLORS = ['var(--accent)', 'var(--carbs)', 'var(--fat)', 'var(--protein)']

export function NutritionScreen({ date }: { date: string }) {
  const { pop, totalsFor, macroTargets, profile, calorieTarget } = useApp()
  const [tab, setTab] = useState<Tab>('calories')
  const totals = totalsFor(date)
  const n = totals.nutrients

  const mealSlices = MEAL_KEYS.map((m, i) => ({
    label: PERIOD_LABELS[m],
    value: totals.byMeal[m].calories,
    color: MEAL_COLORS[i],
  }))

  const macroSlices = [
    { label: 'Carbohydrates', value: n.carbs * 4, color: 'var(--carbs)' },
    { label: 'Fat', value: n.fat * 9, color: 'var(--fat)' },
    { label: 'Protein', value: n.protein * 4, color: 'var(--protein)' },
  ]

  const percents = macroPercents(n)

  /** Goal per nutrient: macros come from the split, everything else from the
   *  reference daily value unless the user has overridden it. */
  function goalFor(key: NutrientKey): number {
    if (key === 'calories') return calorieTarget
    if (key === 'carbs') return macroTargets.carbs
    if (key === 'fat') return macroTargets.fat
    if (key === 'protein') return macroTargets.protein
    const override = profile.nutrientGoals[key]
    if (override !== undefined) return override
    return NUTRIENTS.find((d) => d.key === key)?.dailyValue ?? 0
  }

  return (
    <>
      <TopBar title={`Nutrition · ${friendlyDate(date)}`} onBack={pop} />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'calories', label: 'Calories' },
          { key: 'nutrients', label: 'Nutrients' },
          { key: 'macros', label: 'Macros' },
        ]}
      />

      <div className="scroll">
        {tab === 'calories' && (
          <div className="card">
            <div
              style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '20px 16px' }}
            >
              <Donut
                size={124}
                thickness={22}
                slices={mealSlices}
                center={
                  <>
                    <div className="num" style={{ fontSize: 24, fontWeight: 800 }}>
                      {cal(n.calories)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)' }}>total cal</div>
                  </>
                }
              />
              <Legend slices={mealSlices} />
            </div>
            <div className="totals">
              <span>Goal</span>
              <span className="totals__value">{cal(totals.goal)}</span>
            </div>
            <div className="totals">
              <span>Remaining</span>
              <span
                className="totals__value"
                style={{ color: totals.remaining < 0 ? 'var(--danger)' : undefined }}
              >
                {cal(totals.remaining)}
              </span>
            </div>
          </div>
        )}

        {tab === 'macros' && (
          <>
            <div className="card">
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  alignItems: 'center',
                  padding: '20px 16px',
                }}
              >
                <Donut
                  size={124}
                  thickness={22}
                  slices={macroSlices}
                  center={
                    <>
                      <div className="num" style={{ fontSize: 24, fontWeight: 800 }}>
                        {cal(n.calories)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>cal</div>
                    </>
                  }
                />
                <Legend slices={macroSlices} unit=" cal" />
              </div>
            </div>

            <div className="card">
              <div className="card__head">
                <span className="card__title">Grams vs Goal</span>
              </div>
              {(
                [
                  ['Carbohydrates', n.carbs, macroTargets.carbs, percents.carbs, profile.macroSplit.carbs],
                  ['Fat', n.fat, macroTargets.fat, percents.fat, profile.macroSplit.fat],
                  ['Protein', n.protein, macroTargets.protein, percents.protein, profile.macroSplit.protein],
                ] as [string, number, number, number, number][]
              ).map(([label, value, target, actualPct, goalPct]) => (
                <div key={label} className="row" style={{ display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{label}</span>
                    <span className="num" style={{ color: 'var(--text-2)', fontSize: 13.5 }}>
                      {grams(value)} / {target} g
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>
                    {pct(actualPct)} of calories · goal {pct(goalPct)}
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card__head">
                <span className="card__title">By Meal</span>
              </div>
              {MEAL_KEYS.map((m) => {
                const mn = totals.byMeal[m]
                return (
                  <div key={m} className="row" style={{ display: 'block' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{PERIOD_LABELS[m]}</span>
                      <span className="num" style={{ fontSize: 13.5 }}>
                        {cal(mn.calories)} cal
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
                      {grams(mn.carbs)} g carbs · {grams(mn.fat)} g fat ·{' '}
                      {grams(mn.protein)} g protein
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {tab === 'nutrients' && (
          <div className="card">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 62px 62px 62px',
                gap: 4,
                padding: '10px 16px',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border)',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-2)',
              }}
            >
              <span>Nutrient</span>
              <span style={{ textAlign: 'right' }}>Total</span>
              <span style={{ textAlign: 'right' }}>Goal</span>
              <span style={{ textAlign: 'right' }}>Left</span>
            </div>

            {NUTRIENTS.filter((d) => d.inTable).map((def) => {
              const value = n[def.key]
              const goal = goalFor(def.key)
              const left = goal - value
              const fmt = (v: number) =>
                def.unit === 'cal'
                  ? cal(v)
                  : def.unit === 'mg'
                    ? Math.round(v)
                    : def.unit === '%'
                      ? Math.round(v)
                      : grams(v)

              return (
                <div
                  key={def.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 62px 62px 62px',
                    gap: 4,
                    padding: '9px 16px',
                    borderBottom: '1px solid var(--border)',
                    fontSize: 13.5,
                    background: 'var(--surface)',
                  }}
                >
                  <span
                    style={{
                      paddingLeft: def.indent ? 14 : 0,
                      fontWeight: def.indent ? 400 : 600,
                      color: def.indent ? 'var(--text-2)' : 'var(--text)',
                    }}
                  >
                    {def.label}
                  </span>
                  <span className="num" style={{ textAlign: 'right' }}>
                    {fmt(value)}
                  </span>
                  <span className="num" style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                    {goal > 0 ? fmt(goal) : '-'}
                  </span>
                  <span
                    className="num"
                    style={{
                      textAlign: 'right',
                      color: left < 0 ? 'var(--danger)' : 'var(--text-2)',
                    }}
                  >
                    {goal > 0 ? fmt(left) : '-'}
                  </span>
                </div>
              )
            })}

            <div className="hint">
              Goals for vitamins and minerals are percentages of the reference daily
              value. Micronutrient data is only as complete as the food entry it came
              from, many database items list macros only.
            </div>
          </div>
        )}
      </div>
    </>
  )
}
