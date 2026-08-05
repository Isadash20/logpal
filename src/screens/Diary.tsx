import { useState } from 'react'
import { MEAL_KEYS, PERIOD_LABELS, type FoodEntry } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import {
  CalendarSheet,
  DateNav,
  Dialog,
  Row,
  Sheet,
  SheetAction,
  TopBar,
} from '../components/ui'
import { CalorieFormula, MacroBars } from '../components/nutrition'
import { WeekStrip } from '../components/charts'
import { cal, entrySubtitle, timeOfDay } from '../lib/format'
import { addDays, friendlyDate, longDate, today } from '../lib/dates'
import { projectedWeight } from '../lib/nutrition'
import { mlToDisplay, waterUnitLabel } from '../lib/units'
import { uid } from '../lib/id'

export function Diary() {
  const app = useApp()
  const {
    date,
    setDate,
    settings,
    totalsFor,
    entriesFor,
    exercisesFor,
    dayLog,
    macroTargets,
    waterTarget,
    push,
  } = app

  const totals = totalsFor(date)
  const log = dayLog(date)
  const exercises = exercisesFor(date)
  const entries = entriesFor(date)

  const [dayMenu, setDayMenu] = useState(false)
  const [entryMenu, setEntryMenu] = useState<FoodEntry | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [saveMealOpen, setSaveMealOpen] = useState(false)
  const [savedName, setSavedName] = useState('')
  const [completeOpen, setCompleteOpen] = useState(false)

  const week = MEAL_KEYS.length && buildWeek()

  function buildWeek() {
    const out: { label: string; logged: boolean; date: string; today?: boolean }[] = []
    const d0 = new Date(date + 'T00:00:00')
    const offset = (d0.getDay() + 6) % 7 // Monday-first
    for (let i = 0; i < 7; i++) {
      const d = addDays(date, i - offset)
      out.push({
        label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
        logged: totalsFor(d).nutrients.calories > 0,
        date: d,
        today: d === date,
      })
    }
    return out
  }

  const waterPct = waterTarget > 0 ? Math.min(100, (log.water / waterTarget) * 100) : 0

  return (
    <>
      <TopBar
        title={<DateNav date={date} onChange={setDate} label={friendlyDate(date)} />}
        left={
          <button className="iconbtn" onClick={() => setDayMenu(true)} aria-label="Day options">
            <Icon name="more" size={20} strokeWidth={2.6} />
          </button>
        }
        right={
          <button className="iconbtn" onClick={() => push({ name: 'nutrition', date })}>
            <Icon name="chart" size={21} />
          </button>
        }
      />

      <div className="scroll">
        <CalorieFormula
          goal={totals.goal}
          food={totals.nutrients.calories}
          exercise={totals.exerciseCalories}
          showExercise={settings.exerciseAddsCalories}
        />

        <div className="card" style={{ marginBottom: 12, borderTop: 0 }}>
          <MacroBars n={totals.nutrients} targets={macroTargets} />
          <div style={{ padding: '2px 12px 12px' }}>
            {week && <WeekStrip days={week} onPick={setDate} />}
          </div>
        </div>

        {/* ---------------------------------------------------------- water -- */}
        <button
          className="card"
          style={{
            width: '100%',
            textAlign: 'left',
            display: 'block',
            padding: '14px 16px',
          }}
          onClick={() => push({ name: 'water', date })}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ color: 'var(--water)', display: 'flex' }}>
              <Icon name="water" size={19} />
            </span>
            <span className="card__title" style={{ flex: 1 }}>
              Water
            </span>
            <span className="num" style={{ fontWeight: 700, fontSize: 15 }}>
              {fmtWater(log.water, settings.waterUnit)} /{' '}
              {fmtWater(waterTarget, settings.waterUnit)} {waterUnitLabel(settings.waterUnit)}
            </span>
          </div>
          <div className="progress">
            <div
              className="progress__fill"
              style={{ width: `${waterPct}%`, background: 'var(--water)' }}
            />
          </div>
        </button>

        {/* ----------------------------------------------------------- food -- */}
        <div className="card">
          <div className="card__head">
            <span className="card__title">Food</span>
            <span className="num" style={{ fontWeight: 700, fontSize: 15 }}>
              {cal(totals.nutrients.calories)}
            </span>
          </div>

          {entries.length === 0 && (
            <div className="hint" style={{ padding: '18px 16px' }}>
              Nothing logged yet. Tap Log food to start.
            </div>
          )}

          {MEAL_KEYS.map((period) => {
            const group = entries.filter((e) => e.meal === period)
            if (group.length === 0) return null
            return (
              <div key={period}>
                <div className="totals">
                  <span>{PERIOD_LABELS[period]}</span>
                  <span className="totals__value">{cal(totals.byMeal[period].calories)}</span>
                </div>
                {group.map((e) => (
                  <Row
                    key={e.id}
                    title={e.name}
                    sub={entrySubtitle({
                      brand: e.brand,
                      servings: e.servings,
                      servingLabel: e.servingLabel,
                    })}
                    value={cal(e.nutrients.calories)}
                    onClick={() => {
                      const food = app.resolveFood(e.foodId)
                      if (food) {
                        push({
                          name: 'foodDetail',
                          food,
                          date,
                          entryId: e.id,
                          servings: e.servings,
                          servingLabel: e.servingLabel,
                        })
                      } else {
                        setEntryMenu(e)
                      }
                    }}
                    right={
                      <span
                        className="num"
                        style={{ fontSize: 11, color: 'var(--text-3)', flex: 'none' }}
                      >
                        {timeOfDay(e.loggedAt)}
                      </span>
                    }
                  />
                ))}
              </div>
            )
          })}

          <div style={{ padding: 12 }}>
            <button className="btn" onClick={() => push({ name: 'foodSearch', date })}>
              <Icon name="plus" size={19} strokeWidth={2.4} />
              Log food
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------- exercise -- */}
        <div className="card">
          <div className="card__head">
            <span className="card__title">Exercise</span>
            <span className="num" style={{ fontWeight: 700, fontSize: 15 }}>
              {cal(totals.exerciseCalories)}
            </span>
          </div>

          {exercises.map((e) => (
            <Row
              key={e.id}
              title={e.name}
              sub={
                e.kind === 'cardio'
                  ? `${e.minutes ?? 0} minutes`
                  : `${e.sets ?? 0} × ${e.reps ?? 0}${e.weight ? ` @ ${e.weight} lb` : ''}`
              }
              value={e.kind === 'cardio' ? cal(e.caloriesBurned ?? 0) : undefined}
              onClick={() =>
                push({
                  name: 'exerciseDetail',
                  date,
                  kind: e.kind,
                  exerciseId: e.exerciseId,
                  name_: e.name,
                  entryId: e.id,
                })
              }
            />
          ))}

          <Row
            className="row--link"
            title="Add exercise"
            onClick={() => push({ name: 'exerciseSearch', date, kind: 'cardio' })}
          />
          {totals.exerciseMinutes > 0 && (
            <div className="totals">
              <span>Minutes</span>
              <span className="totals__value">{totals.exerciseMinutes}</span>
            </div>
          )}
        </div>

        <div className="btn-wrap" style={{ display: 'grid', gap: 10 }}>
          <button className="btn btn--ghost" onClick={() => push({ name: 'nutrition', date })}>
            Nutrition breakdown
          </button>
          <button
            className={log.completed ? 'btn btn--ghost' : 'btn btn--ink'}
            onClick={() => {
              app.setCompleted(date, !log.completed)
              if (!log.completed) setCompleteOpen(true)
            }}
          >
            {log.completed ? 'Day complete ✓' : 'Complete this day'}
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------- sheets -- */}

      {dayMenu && (
        <Sheet title={longDate(date)} onClose={() => setDayMenu(false)}>
          <SheetAction
            icon="plus"
            label="Quick add calories"
            onClick={() => {
              push({ name: 'quickAdd', date })
              setDayMenu(false)
            }}
          />
          <SheetAction
            icon="copy"
            label="Copy this day to…"
            onClick={() => {
              setCopyOpen(true)
              setDayMenu(false)
            }}
          />
          <SheetAction
            icon="bookmark"
            label="Save day as a meal"
            onClick={() => {
              setSavedName(friendlyDate(date))
              setSaveMealOpen(true)
              setDayMenu(false)
            }}
          />
        </Sheet>
      )}

      {entryMenu && (
        <Sheet title={entryMenu.name} onClose={() => setEntryMenu(null)}>
          {MEAL_KEYS.filter((m) => m !== entryMenu.meal).map((m) => (
            <SheetAction
              key={m}
              icon="clock"
              label={`Move to ${PERIOD_LABELS[m]}`}
              onClick={() => {
                app.moveEntry(entryMenu.id, m)
                setEntryMenu(null)
              }}
            />
          ))}
          <SheetAction
            icon="trash"
            label="Delete entry"
            danger
            onClick={() => {
              app.deleteEntry(entryMenu.id)
              setEntryMenu(null)
            }}
          />
        </Sheet>
      )}

      {copyOpen && (
        <CalendarSheet
          date={date}
          onClose={() => setCopyOpen(false)}
          onPick={(target) => {
            app.copyDay(date, target)
            setCopyOpen(false)
          }}
        />
      )}

      {saveMealOpen && (
        <Dialog title="Save as a meal" onClose={() => setSaveMealOpen(false)}>
          <input
            className="input input--boxed"
            value={savedName}
            autoFocus
            onChange={(e) => setSavedName(e.target.value)}
            placeholder="Meal name"
            style={{ marginBottom: 14 }}
          />
          <button
            className="btn"
            disabled={!savedName.trim() || entries.length === 0}
            onClick={() => {
              app.saveMeal({
                id: uid('m'),
                name: savedName.trim(),
                createdAt: Date.now(),
                items: entries.map((e) => ({
                  foodId: e.foodId,
                  name: e.name,
                  brand: e.brand,
                  servingLabel: e.servingLabel,
                  servings: e.servings,
                  nutrients: e.nutrients,
                })),
              })
              setSaveMealOpen(false)
            }}
          >
            Save meal
          </button>
        </Dialog>
      )}

      {completeOpen && <CompleteDialog date={date} onClose={() => setCompleteOpen(false)} />}
    </>
  )
}

function fmtWater(ml: number, unit: 'cup' | 'ml' | 'floz') {
  const v = mlToDisplay(ml, unit)
  return unit === 'ml' ? Math.round(v) : Math.round(v * 10) / 10
}

/** The five-week projection shown on completing a day. */
function CompleteDialog({ date, onClose }: { date: string; onClose(): void }) {
  const { totalsFor, latestWeight, settings } = useApp()
  const totals = totalsFor(date)
  const net = totals.nutrients.calories - totals.exerciseCalories
  const projected = projectedWeight({
    currentWeight: latestWeight,
    maintenance: totals.maintenance,
    netCalories: net,
  })
  const unit = settings.weightUnit
  const show = (lb: number) => (unit === 'kg' ? lb / 2.2046226218 : lb)
  const diff = projected - latestWeight

  return (
    <Dialog onClose={onClose}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14.5, color: 'var(--text-2)', marginBottom: 10 }}>
          If every day looked like {date === today() ? 'today' : longDate(date)}…
        </div>
        <div
          className="num"
          style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.05 }}
        >
          {Math.round(show(projected) * 10) / 10}
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-2)' }}> {unit}</span>
        </div>
        <div
          style={{
            fontSize: 14,
            color: diff < 0 ? 'var(--positive)' : 'var(--text-2)',
            marginTop: 6,
            fontWeight: 600,
          }}
        >
          {diff >= 0 ? '+' : ''}
          {Math.round(show(diff) * 10) / 10} {unit} in 5 weeks
        </div>
        <button className="btn" style={{ marginTop: 20 }} onClick={onClose}>
          Got it
        </button>
      </div>
    </Dialog>
  )
}
