import type { Nutrients } from '../types'
import { NUTRIENTS } from '../data/nutrients'
import { cal, grams, pct } from '../lib/format'
import { macroPercents } from '../lib/nutrition'

/**
 * The `Goal − Food + Exercise = Remaining` header. This equation is the
 * organising idea of the whole diary, so it is rendered literally.
 */
export function CalorieFormula({
  goal,
  food,
  exercise,
  showExercise = true,
}: {
  goal: number
  food: number
  exercise: number
  showExercise?: boolean
}) {
  const remaining = goal - food + (showExercise ? exercise : 0)
  const over = remaining < 0
  const consumedPct = goal > 0 ? Math.min(100, (food / goal) * 100) : 0

  return (
    <div className="calbar">
      <div className="calbar__formula">
        <Cell value={goal} label="Goal" />
        <span className="calbar__op">−</span>
        <Cell value={food} label="Food" />
        {showExercise && (
          <>
            <span className="calbar__op">+</span>
            <Cell value={exercise} label="Exercise" />
          </>
        )}
        <span className="calbar__op">=</span>
        <Cell value={remaining} label="Remaining" over={over} />
      </div>
      <div className="progress">
        <div
          className={`progress__fill ${over ? 'progress__fill--over' : ''}`}
          style={{ width: `${consumedPct}%` }}
        />
      </div>
    </div>
  )
}

function Cell({
  value,
  label,
  over,
}: {
  value: number
  label: string
  over?: boolean
}) {
  return (
    <div className="calbar__cell">
      <div className={`calbar__num ${over ? 'calbar__num--over' : ''}`}>
        {cal(value)}
      </div>
      <div className="calbar__label">{label}</div>
    </div>
  )
}

/* --------------------------------------------------------------- macros --- */

export function MacroBars({
  n,
  targets,
}: {
  n: Nutrients
  targets: { carbs: number; protein: number; fat: number }
}) {
  const rows = [
    { key: 'carbs', label: 'Carbs', value: n.carbs, target: targets.carbs, color: 'var(--carbs)' },
    { key: 'fat', label: 'Fat', value: n.fat, target: targets.fat, color: 'var(--fat)' },
    {
      key: 'protein',
      label: 'Protein',
      value: n.protein,
      target: targets.protein,
      color: 'var(--protein)',
    },
  ]
  return (
    <div className="macros">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="macro__top">
            <span className="macro__name">{r.label}</span>
            <span className="macro__val">
              {Math.round(r.value)}/{r.target} g
            </span>
          </div>
          <div className="macro__track">
            <div
              className="macro__fill"
              style={{
                width: `${Math.min(100, r.target > 0 ? (r.value / r.target) * 100 : 0)}%`,
                background: r.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Compact "50% carbs · 20% fat · 30% protein" strip used on food detail. */
export function MacroSummary({ n }: { n: Nutrients }) {
  const p = macroPercents(n)
  const items = [
    { label: 'Carbs', v: n.carbs, p: p.carbs, color: 'var(--carbs)' },
    { label: 'Fat', v: n.fat, p: p.fat, color: 'var(--fat)' },
    { label: 'Protein', v: n.protein, p: p.protein, color: 'var(--protein)' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', textAlign: 'center' }}>
      {items.map((it) => (
        <div key={it.label} style={{ padding: '4px 0' }}>
          <div className="num" style={{ fontSize: 17, fontWeight: 700, color: it.color }}>
            {pct(it.p)}
          </div>
          <div className="num" style={{ fontSize: 13.5, marginTop: 2 }}>
            {grams(it.v)} g
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 1 }}>
            {it.label}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------ nutrition label --- */

/** FDA-style panel shown on the food detail screen. */
export function NutritionLabel({ n }: { n: Nutrients }) {
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <div
        style={{
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '10px 12px',
            borderBottom: '6px solid var(--text)',
          }}
        >
          <strong style={{ fontSize: 16 }}>Calories</strong>
          <strong className="num" style={{ fontSize: 24, letterSpacing: '-0.02em' }}>
            {cal(n.calories)}
          </strong>
        </div>

        <div
          style={{
            padding: '4px 12px 8px',
            fontSize: 10.5,
            textAlign: 'right',
            color: 'var(--text-2)',
            borderBottom: '1px solid var(--border)',
            fontWeight: 700,
          }}
        >
          % Daily Value*
        </div>

        {NUTRIENTS.filter((d) => d.key !== 'calories').map((def) => {
          const value = n[def.key]
          const dv = def.dailyValue > 0 ? (value / def.dailyValue) * 100 : null
          const unitSuffix = def.unit === '%' ? '%' : ` ${def.unit}`
          const shown = def.unit === 'mg' ? Math.round(value) : grams(value)

          return (
            <div
              key={def.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                padding: '6px 12px',
                borderBottom: '1px solid var(--border)',
                fontSize: 13.5,
              }}
            >
              <span style={{ paddingLeft: def.indent ? 14 : 0 }}>
                <span style={{ fontWeight: def.indent ? 400 : 700 }}>{def.label}</span>{' '}
                <span className="num">
                  {def.unit === '%' ? pct(value) : `${shown}${unitSuffix}`}
                </span>
              </span>
              {def.unit !== '%' && dv !== null && (
                <span className="num" style={{ fontWeight: 700, flex: 'none' }}>
                  {pct(dv)}
                </span>
              )}
            </div>
          )
        })}

        <div style={{ padding: '8px 12px', fontSize: 10.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
          * Percent Daily Values are based on a 2,000 calorie diet. Your daily values may
          be higher or lower depending on your calorie needs.
        </div>
      </div>
    </div>
  )
}
