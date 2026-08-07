import { useEffect, useMemo, useState } from 'react'
import { MEAL_KEYS, PERIOD_LABELS } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/ui'
import { WeekStrip } from '../components/charts'
import { cal, weight as fmtWeight } from '../lib/format'
import { addDays, longDate, today } from '../lib/dates'
import { lbToDisplay, mlToDisplay, waterUnitLabel } from '../lib/units'
import {
  activeFast,
  fastElapsedMs,
  fastProgress,
  formatDuration,
  targetHoursFor,
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
    const out: {
      label: string
      logged: boolean
      date: string
      selected?: boolean
      isToday?: boolean
    }[] = []
    // Monday-first, matching the reference app's default week start.
    const d0 = new Date(date + 'T00:00:00')
    const offset = (d0.getDay() + 6) % 7
    const realToday = today()
    for (let i = 0; i < 7; i++) {
      const d = addDays(date, i - offset)
      out.push({
        label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
        logged: totalsFor(d).nutrients.calories > 0,
        date: d,
        selected: d === date,
        isToday: d === realToday,
      })
    }
    return out
  }, [date, totalsFor])

  /**
   * Consecutive days logged, counting back from today.
   *
   * A day counts as logged when it has calories on it — the same rule the week
   * strip ticks use, so the streak can never disagree with the row of circles
   * directly above it.
   *
   * Counting starts at yesterday when today has nothing on it yet. Anchoring on
   * today would reset a long streak to zero every midnight and only restore it
   * after the first meal, which reads as losing the streak for breakfast.
   */
  const logStreak = useMemo(() => {
    const realToday = today()
    const loggedOn = (d: string) => totalsFor(d).nutrients.calories > 0
    let cursor = loggedOn(realToday) ? realToday : addDays(realToday, -1)
    let count = 0
    // Bounded so a corrupt date can never spin here forever.
    while (count < 3650 && loggedOn(cursor)) {
      count++
      cursor = addDays(cursor, -1)
    }
    return count
  }, [totalsFor])

  /* Only tick while a fast is actually running — no timer otherwise. */
  const fast = activeFast(data.fasts)
  const [fastNow, setFastNow] = useState(() => Date.now())
  useEffect(() => {
    if (!fast) return
    const t = window.setInterval(() => setFastNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [fast])


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
        <div className="pagetitle">
          {date === today() ? 'Today' : longDate(date)}
          {/* Only from one day — a streak of zero is not worth a badge, and
              showing "0" on day one is discouraging rather than motivating. */}
          {logStreak > 0 && (
            <span className="streak" title={`${logStreak} days logged in a row`}>
              <Icon name="flame" size={14} />
              <span className="num">{logStreak}</span>
              <span className="streak__unit">
                {logStreak === 1 ? 'day' : 'days'}
              </span>
            </span>
          )}
        </div>

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

        {/* ------------------------------------------------ fasting + water -- */}
        {/* Both used to sit below the diary, which on a phone meant scrolling
            past four meal cards to reach them — so in practice they were never
            seen. Promoted to a pair of tiles directly under the macros, each
            one a single tap through to its own screen. */}
        <div className="tilerow">
          <button className="tile" onClick={() => push({ name: 'fasting' })}>
            <span className="tile__head">
              <Icon name="clock" size={15} />
              Fasting
            </span>
            {fast ? (
              <>
                <span className="tile__value">
                  <span className="num">{formatDuration(fastElapsedMs(fast, fastNow))}</span>
                </span>
                <span className="tile__sub">of {fast.targetHours}h target</span>
                <span className="tile__bar">
                  <span
                    className="tile__fill"
                    style={{
                      width: `${Math.min(100, fastProgress(fast, fastNow) * 100)}%`,
                      background:
                        fastProgress(fast, fastNow) >= 1
                          ? 'var(--positive)'
                          : 'var(--accent)',
                    }}
                  />
                </span>
              </>
            ) : (
              /* A stopwatch at rest, not a streak count. The number that
                 belongs on this tile is the one that moves while you fast;
                 "0 day streak" reported a statistic nobody asked for and read
                 as a scolding. */
              <>
                <span className="tile__value">
                  <span className="num">0:00</span>
                </span>
                <span className="tile__sub">
                  Not fasting · {targetHoursFor(data.fasting)}h plan
                </span>
                <span className="tile__bar">
                  <span className="tile__fill" style={{ width: '0%' }} />
                </span>
              </>
            )}
          </button>

          <button className="tile" onClick={() => push({ name: 'water', date })}>
            <span className="tile__head">
              <Icon name="water" size={15} />
              Water
            </span>
            <span className="tile__value">
              <span className="num">{fmtW(log.water)}</span>
              <span className="tile__unit">
                / {fmtW(waterTarget)} {waterUnitLabel(settings.waterUnit)}
              </span>
            </span>
            <span className="tile__sub">
              {log.water >= waterTarget
                ? 'Goal reached'
                : `${fmtW(Math.max(0, waterTarget - log.water))} to go`}
            </span>
            <span className="tile__bar">
              <span
                className="tile__fill"
                style={{
                  width: `${waterTarget > 0 ? Math.min(100, (log.water / waterTarget) * 100) : 0}%`,
                  background: 'var(--water)',
                }}
              />
            </span>
          </button>
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

        {/* ------------------------------------------------- healthy habits -- */}
        <div className="section-head">
          <span>Healthy habits</span>
        </div>

        {/* Water is not repeated here — it has its own tile above the diary. */}
        <div className="card">
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
