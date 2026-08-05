import { useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Empty, Row, Sheet, TopBar } from '../components/ui'
import { BarChart, LineChart } from '../components/charts'
import { cal, signed, weight as fmtWeight } from '../lib/format'
import { addDays, lastNDays, shortDate, today } from '../lib/dates'
import { displayToIn, displayToLb, inToDisplay, lbToDisplay } from '../lib/units'
import { bmi, bmiCategory } from '../lib/nutrition'

const RANGES = [
  { key: 30, label: '30 Days' },
  { key: 90, label: '90 Days' },
  { key: 180, label: '6 Months' },
  { key: 365, label: '1 Year' },
] as const

const MEASUREMENTS = [
  { key: 'neck', label: 'Neck' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'chest', label: 'Chest' },
  { key: 'arms', label: 'Arms' },
  { key: 'thighs', label: 'Thighs' },
]

export function Progress() {
  const app = useApp()
  const { data, settings, profile, latestWeight, push, totalsFor } = app
  const [days, setDays] = useState<number>(30)
  const [tab, setTab] = useState<'weight' | 'calories'>('weight')

  const keys = useMemo(() => lastNDays(days), [days])

  const weightPoints = useMemo(() => {
    const byDate = new Map(data.weights.map((w) => [w.date, w.weight]))
    return keys.map((d) => ({
      x: shortDate(d),
      y: byDate.has(d) ? lbToDisplay(byDate.get(d)!, settings.weightUnit) : null,
    }))
  }, [keys, data.weights, settings.weightUnit])

  const calorieBars = useMemo(() => {
    const recent = keys.slice(-14)
    return recent.map((d) => ({
      label: shortDate(d).split(' ')[1],
      value: Math.round(totalsFor(d).nutrients.calories),
    }))
  }, [keys, totalsFor])

  const sorted = [...data.weights].sort((a, b) => (a.date < b.date ? -1 : 1))
  const first = sorted[0]
  const change = first ? latestWeight - first.weight : 0
  const toGoal = latestWeight - profile.goalWeight
  const bmiValue = bmi(latestWeight, profile.heightIn)

  return (
    <>
      <TopBar
        title="Progress"
        right={
          <button
            className="iconbtn iconbtn--accent"
            onClick={() => push({ name: 'weightEntry' })}
            aria-label="Add weight"
          >
            <Icon name="plus" size={22} strokeWidth={2.4} />
          </button>
        }
      />

      <div className="scroll">
        <div className="tabs">
          <button
            className={`tabs__item ${tab === 'weight' ? 'tabs__item--active' : ''}`}
            onClick={() => setTab('weight')}
          >
            Weight
          </button>
          <button
            className={`tabs__item ${tab === 'calories' ? 'tabs__item--active' : ''}`}
            onClick={() => setTab('calories')}
          >
            Calories
          </button>
        </div>

        {tab === 'weight' && (
          <>
            <div className="chips">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  className={`chip ${days === r.key ? 'chip--active' : ''}`}
                  onClick={() => setDays(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="card">
              <div style={{ padding: '10px 8px 0' }}>
                <LineChart
                  points={weightPoints}
                  goal={lbToDisplay(profile.goalWeight, settings.weightUnit)}
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,1fr)',
                  textAlign: 'center',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <Metric
                  label="Current"
                  value={fmtWeight(lbToDisplay(latestWeight, settings.weightUnit))}
                  unit={settings.weightUnit}
                />
                <Metric
                  label="Change"
                  value={signed(lbToDisplay(change, settings.weightUnit))}
                  unit={settings.weightUnit}
                  tone={change < 0 ? 'var(--positive)' : change > 0 ? 'var(--warning)' : undefined}
                />
                <Metric
                  label="To Goal"
                  value={fmtWeight(Math.abs(lbToDisplay(toGoal, settings.weightUnit)))}
                  unit={settings.weightUnit}
                />
              </div>
            </div>

            <div className="card">
              <div className="card__head">
                <span className="card__title">Body</span>
              </div>
              {/* Category is derived from the *displayed* value so the two can
                  never disagree at a boundary (24.98 showing as "25 · Normal"). */}
              <Row
                title="BMI"
                sub={bmiCategory(Math.round(bmiValue * 10) / 10)}
                value={(Math.round(bmiValue * 10) / 10).toFixed(1)}
              />
              <Row
                title="Starting Weight"
                value={`${fmtWeight(lbToDisplay(profile.startWeight, settings.weightUnit))} ${settings.weightUnit}`}
              />
              <Row
                title="Goal Weight"
                value={`${fmtWeight(lbToDisplay(profile.goalWeight, settings.weightUnit))} ${settings.weightUnit}`}
                chevron
                onClick={() => push({ name: 'goals' })}
              />
            </div>

            <div className="card">
              <div className="card__head">
                <span className="card__title">Measurements</span>
              </div>
              {MEASUREMENTS.map((m) => {
                const entries = data.measurements
                  .filter((x) => x.key === m.key)
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                const latest = entries[0]
                return (
                  <Row
                    key={m.key}
                    title={m.label}
                    value={
                      latest
                        ? `${Math.round(inToDisplay(latest.value, settings.heightUnit) * 10) / 10} ${settings.heightUnit}`
                        : '—'
                    }
                    chevron
                    onClick={() => push({ name: 'measurement', key: m.key })}
                  />
                )
              })}
            </div>

            <div className="card">
              <div className="card__head">
                <span className="card__title">History</span>
              </div>
              {sorted.length === 0 ? (
                <Empty title="No entries yet">Tap + to log your weight.</Empty>
              ) : (
                [...sorted]
                  .reverse()
                  .slice(0, 30)
                  .map((w, i, arr) => {
                    const prev = arr[i + 1]
                    const delta = prev ? w.weight - prev.weight : 0
                    return (
                      <Row
                        key={w.date}
                        title={shortDate(w.date)}
                        sub={
                          prev
                            ? `${signed(lbToDisplay(delta, settings.weightUnit))} ${settings.weightUnit}`
                            : 'First entry'
                        }
                        value={`${fmtWeight(lbToDisplay(w.weight, settings.weightUnit))} ${settings.weightUnit}`}
                      />
                    )
                  })
              )}
            </div>
          </>
        )}

        {tab === 'calories' && (
          <>
            <div className="card">
              <div className="card__head">
                <span className="card__title">Last 14 Days</span>
              </div>
              <div style={{ padding: '12px 8px 0' }}>
                <BarChart bars={calorieBars} goal={app.calorieTarget} />
              </div>
              <div className="hint">Dashed line marks your daily calorie goal.</div>
            </div>

            <div className="card">
              <div className="card__head">
                <span className="card__title">Averages</span>
              </div>
              {(() => {
                const logged = keys
                  .map((d) => totalsFor(d))
                  .filter((t) => t.nutrients.calories > 0)
                const n = logged.length || 1
                const avg = (f: (t: ReturnType<typeof totalsFor>) => number) =>
                  logged.reduce((s, t) => s + f(t), 0) / n
                return (
                  <>
                    <Row title="Days logged" value={`${logged.length} of ${keys.length}`} />
                    <Row title="Avg. calories" value={cal(avg((t) => t.nutrients.calories))} />
                    <Row
                      title="Avg. carbs"
                      value={`${Math.round(avg((t) => t.nutrients.carbs))} g`}
                    />
                    <Row title="Avg. fat" value={`${Math.round(avg((t) => t.nutrients.fat))} g`} />
                    <Row
                      title="Avg. protein"
                      value={`${Math.round(avg((t) => t.nutrients.protein))} g`}
                    />
                    <Row
                      title="Avg. exercise"
                      value={`${cal(avg((t) => t.exerciseCalories))} cal`}
                    />
                  </>
                )
              })()}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Metric({
  label,
  value,
  unit,
  tone,
}: {
  label: string
  value: string
  unit: string
  tone?: string
}) {
  return (
    <div style={{ padding: '14px 6px' }}>
      <div className="num" style={{ fontSize: 19, fontWeight: 700, color: tone }}>
        {value}
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}> {unit}</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

/* ---------------------------------------------------------- weight entry -- */

export function WeightEntry() {
  const { pop, addWeight, settings, latestWeight, data, deleteWeight } = useApp()
  const [date, setDate] = useState(today())
  const [value, setValue] = useState(
    String(Math.round(lbToDisplay(latestWeight, settings.weightUnit) * 10) / 10)
  )

  const existing = data.weights.find((w) => w.date === date)

  return (
    <>
      <TopBar
        title="Log Weight"
        onBack={pop}
        right={
          <button
            className="textbtn"
            onClick={() => {
              const v = parseFloat(value)
              if (Number.isFinite(v) && v > 0) {
                addWeight(date, displayToLb(v, settings.weightUnit))
                pop()
              }
            }}
          >
            Save
          </button>
        }
      />
      <div className="scroll">
        <div className="card" style={{ marginTop: 0 }}>
          <label className="field">
            <span className="field__label">Date</span>
            <span className="field__control">
              <input
                className="input"
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
              />
            </span>
          </label>
          <label className="field">
            <span className="field__label">Weight</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                step="0.1"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
              <span className="unit">{settings.weightUnit}</span>
            </span>
          </label>
        </div>

        <div className="chips">
          {[-2, -1, -0.5, 0.5, 1, 2].map((d) => (
            <button
              key={d}
              className="chip"
              onClick={() => {
                const v = parseFloat(value) || 0
                setValue(String(Math.round((v + d) * 10) / 10))
              }}
            >
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>

        {existing && (
          <div className="btn-wrap">
            <button
              className="btn btn--danger"
              onClick={() => {
                deleteWeight(date)
                pop()
              }}
            >
              Delete Entry for This Date
            </button>
          </div>
        )}
      </div>
    </>
  )
}

/* ----------------------------------------------------- measurement detail -- */

export function MeasurementDetail({ measureKey }: { measureKey: string }) {
  const { pop, data, settings, addMeasurement } = useApp()
  const label = MEASUREMENTS.find((m) => m.key === measureKey)?.label ?? measureKey
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [date, setDate] = useState(today())

  const entries = data.measurements
    .filter((m) => m.key === measureKey)
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const points = useMemo(() => {
    const keys = lastNDays(90)
    const byDate = new Map(entries.map((e) => [e.date, e.value]))
    return keys.map((d) => ({
      x: shortDate(d),
      y: byDate.has(d) ? inToDisplay(byDate.get(d)!, settings.heightUnit) : null,
    }))
  }, [entries, settings.heightUnit])

  return (
    <>
      <TopBar
        title={label}
        onBack={pop}
        right={
          <button
            className="iconbtn iconbtn--accent"
            onClick={() => setOpen(true)}
            aria-label="Add measurement"
          >
            <Icon name="plus" size={22} strokeWidth={2.4} />
          </button>
        }
      />
      <div className="scroll">
        <div className="card">
          <div style={{ padding: '10px 8px 8px' }}>
            <LineChart points={points} />
          </div>
        </div>
        <div className="card">
          <div className="card__head">
            <span className="card__title">History</span>
          </div>
          {entries.length === 0 ? (
            <Empty title="No entries yet">Tap + to record a measurement.</Empty>
          ) : (
            [...entries].reverse().map((e) => (
              <Row
                key={e.date}
                title={shortDate(e.date)}
                value={`${Math.round(inToDisplay(e.value, settings.heightUnit) * 10) / 10} ${settings.heightUnit}`}
              />
            ))
          )}
        </div>
      </div>

      {open && (
        <Sheet title={`Add ${label}`} onClose={() => setOpen(false)}>
          <label className="field">
            <span className="field__label">Date</span>
            <span className="field__control">
              <input
                className="input"
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
              />
            </span>
          </label>
          <label className="field">
            <span className="field__label">{label}</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                step="0.1"
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <span className="unit">{settings.heightUnit}</span>
            </span>
          </label>
          <div className="btn-wrap">
            <button
              className="btn"
              disabled={!parseFloat(value)}
              onClick={() => {
                const v = parseFloat(value)
                if (!Number.isFinite(v)) return
                addMeasurement({
                  date,
                  key: measureKey,
                  value: displayToIn(v, settings.heightUnit),
                })
                setValue('')
                setOpen(false)
              }}
            >
              Save
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

export { addDays }
