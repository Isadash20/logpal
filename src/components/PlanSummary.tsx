import type { MacroSplit } from '../types'
import { cal } from '../lib/format'

/**
 * The plan at a glance: the calorie figure, then one line per macro with its
 * grams, its share and a bar in its colour.
 *
 * This replaced a set of three concentric rings. Rings suit progress, a part
 * of a whole filling up over the day, and on a plan nothing is filling up:
 * every ring sat at 100% and the picture said nothing. Bars in the macro
 * colours are the same device the Home macro card uses, so the plan reads
 * the way the day does.
 */
export function PlanSummary({
  calories,
  macros,
  split,
  water,
  showCalories = true,
}: {
  calories: number
  macros: { carbs: number; protein: number; fat: number }
  split: MacroSplit
  /** Already formatted in the user's unit, e.g. "2.9 L". */
  water?: string
  showCalories?: boolean
}) {
  const rows = [
    { key: 'carbs', label: 'Carbohydrates', color: 'var(--carbs)' },
    { key: 'protein', label: 'Protein', color: 'var(--protein)' },
    { key: 'fat', label: 'Fat', color: 'var(--fat)' },
  ] as const

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {showCalories && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            className="num"
            style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}
          >
            {cal(calories)}
          </span>
          <span style={{ color: 'var(--text-2)', fontSize: 14, fontWeight: 600 }}>
            calories a day
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="dot" style={{ background: r.color, alignSelf: 'center' }} />
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>{r.label}</span>
              <span className="num" style={{ fontSize: 16, fontWeight: 800, color: r.color }}>
                {macros[r.key]} g
              </span>
              <span
                className="num"
                style={{ fontSize: 13, color: 'var(--text-3)', minWidth: 34, textAlign: 'right' }}
              >
                {split[r.key]}%
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: 'var(--surface-3)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, split[r.key]))}%`,
                  height: '100%',
                  background: r.color,
                  borderRadius: 999,
                  transition: 'width .25s ease',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {water && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingTop: 10,
            borderTop: '1px solid var(--border)',
          }}
        >
          <span className="dot" style={{ background: 'var(--water)' }} />
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>Water</span>
          <span className="num" style={{ fontSize: 16, fontWeight: 800, color: 'var(--water)' }}>
            {water}
          </span>
        </div>
      )}
    </div>
  )
}
