import { useEffect, useMemo, useState } from 'react'
import { MEAL_KEYS, PERIOD_LABELS } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/ui'
import { FastDial, FastHistoryBars, WeekStrip } from '../components/charts'
import { cal, weight as fmtWeight } from '../lib/format'
import { addDays, longDate, today } from '../lib/dates'
import { lbToDisplay, mlToDisplay, waterUnitLabel } from '../lib/units'
import {
  PROTOCOL_BY_KEY,
  activeFast,
  completedFasts,
  fastElapsedMs,
  fastProgress,
  fastStats,
  formatClock,
  formatDuration,
  targetHoursFor,
  windowFor,
} from '../lib/fasting'

/**
 * Home screen, laid out to match the reference app: a calorie bar, a macro
 * bar, then plain rows. Deliberately flat — no rings or donuts here. The rich
 * charts live on Progress and Nutrition, where someone has gone looking.
 */
export function Today() {
  const app = useApp()
  const {
    date,
    setDate,
    settings,
    profile,
    totalsFor,
    dayLog,
    macroTargets,
    waterTarget,
    latestWeight,
    data,
    push,
    setTab,
    entriesFor,
  } = app

  const totals = totalsFor(date)
  const log = dayLog(date)
  const n = totals.nutrients
  const credit = settings.exerciseAddsCalories ? totals.exerciseCalories : 0
  const consumed = n.calories
  const left = totals.goal - consumed + credit
  const pctEaten = totals.goal > 0 ? Math.min(100, (consumed / totals.goal) * 100) : 0

  // Macro split by share of calories, so the three always total 100%.
  const macroCals = { c: n.carbs * 4, f: n.fat * 9, p: n.protein * 4 }
  const macroTotal = macroCals.c + macroCals.f + macroCals.p
  const share = (v: number) => (macroTotal > 0 ? (v / macroTotal) * 100 : 0)

  const week = useMemo(() => {
    const out: { label: string; logged: boolean; date: string; today?: boolean }[] = []
    // Monday-first, matching the reference app's default week start.
    const d0 = new Date(date + 'T00:00:00')
    const offset = (d0.getDay() + 6) % 7
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
  }, [date, totalsFor])

  /* Only tick while a fast is actually running — no timer otherwise. */
  const fast = activeFast(data.fasts)
  const [fastNow, setFastNow] = useState(() => Date.now())
  useEffect(() => {
    if (!fast) return
    const t = window.setInterval(() => setFastNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [fast])

  const fastBars = useMemo(
    () =>
      completedFasts(data.fasts)
        .slice(0, 7)
        .reverse()
        .map((f) => ({ hours: fastElapsedMs(f) / 3_600_000, target: f.targetHours })),
    [data.fasts]
  )
  const fastStreak = useMemo(() => fastStats(data.fasts).streak, [data.fasts])

  const lastWeigh = [...data.weights].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const fmtW = (ml: number) => {
    const v = mlToDisplay(ml, settings.waterUnit)
    return settings.waterUnit === 'ml' ? Math.round(v) : Math.round(v * 10) / 10
  }

  return (
    <>
      <TopBar
        right={
          <>
            <button
              className="goldpill"
              onClick={() => push({ name: 'goals' })}
              aria-label="Your plan"
            >
              Your plan
            </button>
            <button className="iconbtn" onClick={() => setTab('more')} aria-label="Settings">
              <Icon name="settings" size={21} />
            </button>
          </>
        }
      />

      <div className="scroll">
        <div className="pagetitle">{date === today() ? 'Today' : longDate(date)}</div>

        <div style={{ padding: '0 12px 16px' }}>
          <WeekStrip days={week} onPick={setDate} />
        </div>

        {/* ------------------------------------------------------- calories -- */}
        <div className="card">
          <div style={{ padding: '15px 16px 17px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 9 }}>Calories</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
                <span
                  className="num"
                  style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.03em' }}
                >
                  {cal(consumed)}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>cal</span>
                <span className="num" style={{ fontSize: 14, color: 'var(--text-2)' }}>
                  / {cal(totals.goal + credit)}
                </span>
              </div>
              <div style={{ flex: 'none' }}>
                <span
                  className="num"
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    color: left < 0 ? 'var(--danger)' : 'var(--text)',
                  }}
                >
                  {cal(Math.abs(left))}
                </span>
                <span style={{ fontSize: 14, color: 'var(--text-2)' }}>
                  {' '}
                  {left < 0 ? 'over' : 'left'}
                </span>
              </div>
            </div>
            <div className="progress" style={{ height: 8 }}>
              <div
                className={`progress__fill ${left < 0 ? 'progress__fill--over' : ''}`}
                style={{ width: `${pctEaten}%` }}
              />
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------- macros -- */}
        <div className="card">
          <div style={{ padding: '15px 16px 17px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                marginBottom: 12,
              }}
            >
              {(
                [
                  ['Carbs', macroCals.c, n.carbs, macroTargets.carbs, 'var(--carbs)'],
                  ['Fat', macroCals.f, n.fat, macroTargets.fat, 'var(--fat)'],
                  ['Protein', macroCals.p, n.protein, macroTargets.protein, 'var(--protein)'],
                ] as [string, number, number, number, string][]
              ).map(([label, kcal, gramsNow, target, color]) => (
                <div key={label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>
                      {label}
                    </span>
                    <span
                      style={{ width: 7, height: 7, borderRadius: 999, background: color }}
                    />
                  </div>
                  <div
                    className="num"
                    style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}
                  >
                    {Math.round(share(kcal))} %
                  </div>
                  <div className="num" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {Math.round(gramsNow)} / {target} g
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                height: 9,
                borderRadius: 999,
                overflow: 'hidden',
                background: 'var(--surface-3)',
              }}
            >
              {macroTotal > 0 &&
                (
                  [
                    [macroCals.c, 'var(--carbs)'],
                    [macroCals.f, 'var(--fat)'],
                    [macroCals.p, 'var(--protein)'],
                  ] as [number, string][]
                ).map(([v, color], i) => (
                  <div key={i} style={{ width: `${share(v)}%`, background: color }} />
                ))}
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------- diary -- */}
        <div className="section-head">
          <span>Diary</span>
          <button className="textbtn" style={{ padding: 0 }} onClick={() => push({ name: 'diary' })}>
            View all
          </button>
        </div>

        {/* One card per period, spaced apart — matching the reference layout. */}
        {MEAL_KEYS.map((period) => {
          const items = entriesFor(date, period)
          return (
            <div className="card" key={period} style={{ marginBottom: 10 }}>
              <div className="row" style={{ borderBottom: 0 }}>
                <span style={{ color: 'var(--accent)', display: 'flex', flex: 'none' }}>
                  <Icon name={PERIOD_ICON[period]} size={21} />
                </span>
                <span className="row__main">
                  <span className="row__title" style={{ display: 'block', fontWeight: 500 }}>
                    {PERIOD_LABELS[period]}
                  </span>
                  {items.length > 0 && (
                    <span className="row__sub" style={{ display: 'block' }}>
                      {items.map((i) => i.name).join(', ')}
                    </span>
                  )}
                  {items.length > 0 && (
                    <span className="row__sub" style={{ display: 'block' }}>
                      {cal(totals.byMeal[period].calories)} cal
                    </span>
                  )}
                </span>
                <button
                  className="iconbtn"
                  style={{ width: 32, height: 32, flex: 'none' }}
                  onClick={() => push({ name: 'diary' })}
                  aria-label={`${PERIOD_LABELS[period]} options`}
                >
                  <Icon name="dots" size={18} />
                </button>
                <button className="logpill" onClick={() => push({ name: 'foodSearch', date })}>
                  Log
                </button>
              </div>
            </div>
          )
        })}

        <div style={{ textAlign: 'center', padding: '6px 16px 4px' }}>
          <button
            className="textbtn"
            style={{ fontWeight: 700, fontSize: 16 }}
            onClick={() => {
              app.setCompleted(date, !log.completed)
            }}
          >
            {log.completed ? 'Day complete ✓' : 'Complete diary'}
          </button>
        </div>

        {/* --------------------------------------------- intermittent fasting -- */}
        <div className="section-head">
          <span>Intermittent fasting</span>
          <button
            className="textbtn"
            style={{ padding: 0 }}
            onClick={() => push({ name: 'fasting' })}
          >
            {fast ? 'Open' : 'Set up'}
          </button>
        </div>

        <button
          className="card"
          style={{ width: 'calc(100% - 28px)', textAlign: 'left', display: 'block', padding: 16 }}
          onClick={() => push({ name: 'fasting' })}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <FastDial
              progress={fast ? fastProgress(fast, fastNow) : 0}
              complete={fast ? fastProgress(fast, fastNow) >= 1 : false}
              center={
                fast ? (
                  <>
                    <div
                      className="num"
                      style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}
                    >
                      {formatDuration(fastElapsedMs(fast, fastNow))}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>
                      of {fast.targetHours}h
                    </div>
                  </>
                ) : (
                  <>
                    <div className="num" style={{ fontSize: 17, fontWeight: 800 }}>
                      {PROTOCOL_BY_KEY[data.fasting.protocol].label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>plan</div>
                  </>
                )
              }
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                {fast
                  ? fastProgress(fast, fastNow) >= 1
                    ? 'Target reached'
                    : 'Fasting now'
                  : 'Not fasting'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3 }}>
                {fast
                  ? `Started ${formatClock(fast.startedAt)} · ends ${formatClock(windowFor(fast).endsAt)}`
                  : `Tap to start a ${targetHoursFor(data.fasting)}h fast`}
              </div>

              {fastBars.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <FastHistoryBars fasts={fastBars} />
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>
                    Last {fastBars.length} fasts · {fastStreak} day streak
                  </div>
                </div>
              )}
            </div>
          </div>
        </button>

        {/* ------------------------------------------------- healthy habits -- */}
        <div className="section-head">
          <span>Healthy habits</span>
        </div>

        <div className="card">
          <button className="row" onClick={() => push({ name: 'water', date })}>
            <span className="row__main">
              <span className="row__title" style={{ display: 'block', fontWeight: 500 }}>
                Water
              </span>
              <span className="row__sub" style={{ display: 'block' }}>
                {fmtW(log.water)} of {fmtW(waterTarget)} {waterUnitLabel(settings.waterUnit)}
                {log.water === 0 ? ' (you must be thirsty!)' : ''}
              </span>
            </span>
            <span className="row__chev">
              <Icon name="forward" size={17} strokeWidth={2.2} />
            </span>
          </button>
          <button
            className="row"
            onClick={() => push({ name: 'exerciseSearch', date, kind: 'cardio' })}
          >
            <span className="row__main">
              <span className="row__title" style={{ display: 'block', fontWeight: 500 }}>
                Exercise
              </span>
              <span className="row__sub" style={{ display: 'block' }}>
                {totals.exerciseCalories > 0
                  ? `${cal(totals.exerciseCalories)} cal, ${totals.exerciseMinutes} minutes`
                  : 'Nothing logged yet'}
              </span>
            </span>
            <span className="row__chev">
              <Icon name="forward" size={17} strokeWidth={2.2} />
            </span>
          </button>
        </div>

        {/* --------------------------------------------------------- weight -- */}
        <div className="section-head">
          <span>Weight</span>
        </div>

        <div className="card">
          <button className="row" onClick={() => push({ name: 'weightEntry' })}>
            <span className="row__main">
              <span className="row__title" style={{ display: 'block', fontWeight: 500 }}>
                {fmtWeight(lbToDisplay(latestWeight, settings.weightUnit))} {settings.weightUnit}
              </span>
              <span className="row__sub" style={{ display: 'block' }}>
                {lastWeigh
                  ? `Logged ${longDate(lastWeigh.date)}`
                  : `Goal ${fmtWeight(lbToDisplay(profile.goalWeight, settings.weightUnit), 0)} ${settings.weightUnit}`}
              </span>
            </span>
            <span className="row__chev">
              <Icon name="forward" size={17} strokeWidth={2.2} />
            </span>
          </button>
        </div>
      </div>
    </>
  )
}
const PERIOD_ICON = {
  morning: 'sunrise',
  afternoon: 'sun',
  evening: 'moon',
  late: 'stars',
} as const
