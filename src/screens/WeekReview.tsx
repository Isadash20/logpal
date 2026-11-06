import { useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Row, TopBar } from '../components/ui'
import { ScoreDial, scoreColor } from '../components/ScoreDial'
import { addDays, fromKey, today } from '../lib/dates'
import { lbToDisplay } from '../lib/units'
import { healthScore } from '../lib/healthScore'
import {
  weekReview,
  weekStart,
  type DayInput,
  type FoodTally,
  type LiftPr,
  type WeekInput,
  type WeekReview as Review,
} from '../lib/weekReview'

/**
 * Your week, read back. See lib/weekReview.ts for what it says and why; this
 * file only draws it. The banner on Home and the screen share one builder,
 * so the number on the card is the number on the page.
 */

type Api = ReturnType<typeof useApp>

function dayInput(app: Api, date: string): DayInput {
  const t = app.totalsFor(date)
  const log = app.dayLog(date)
  const credit = app.settings.exerciseAddsCalories ? t.exerciseCalories : 0
  return {
    date,
    calories: t.nutrients.calories,
    protein: t.nutrients.protein,
    carbs: t.nutrients.carbs,
    fat: t.nutrients.fat,
    goal: t.goal + credit,
    proteinTarget: app.macroTargets.protein,
    carbsTarget: app.macroTargets.carbs,
    fatTarget: app.macroTargets.fat,
    waterMl: log.water,
    waterGoal: app.waterTarget,
    steps: log.steps ?? null,
    stepGoal: app.profile.stepGoal,
    sleepMin: log.sleepMin ?? null,
    sleepGoal: app.profile.sleepGoalMin,
    exerciseMinutes: t.exerciseMinutes,
    exerciseCalories: t.exerciseCalories,
  }
}

function weekInput(app: Api, start: string): WeekInput {
  const end = addDays(start, 6)
  const days = Array.from({ length: 7 }, (_, i) => dayInput(app, addDays(start, i)))
  const prevStart = addDays(start, -7)
  const prevHas = app.data.foodEntries.some((e) => e.date >= prevStart && e.date < start)
  const prev = prevHas ? Array.from({ length: 7 }, (_, i) => dayInput(app, addDays(prevStart, i))) : null

  const tally = new Map<string, { count: number; score: number; calories: number }>()
  for (const e of app.data.foodEntries) {
    if (e.date < start || e.date > end) continue
    const cur = tally.get(e.name) ?? { count: 0, score: 0, calories: 0 }
    cur.count++
    cur.score += healthScore(e.nutrients).score
    cur.calories += e.nutrients.calories
    tally.set(e.name, cur)
  }
  const foods: FoodTally[] = [...tally.entries()].map(([name, v]) => ({
    name,
    count: v.count,
    score: Math.round((v.score / v.count) * 10) / 10,
    calories: Math.round(v.calories),
  }))

  const weights = [...app.data.weights].sort((a, b) => (a.date < b.date ? -1 : 1))
  const before = weights.filter((w) => w.date < start).pop()
  const inside = weights.filter((w) => w.date >= start && w.date <= end).pop()

  const lifts: LiftPr[] = app.data.lifts
    .filter((l) => l.date >= start && l.date <= end)
    .filter((l) => {
      const earlier = app.data.lifts.filter((o) => o.exercise === l.exercise && o.date < l.date)
      return l.weightLb > earlier.reduce((m, o) => Math.max(m, o.weightLb), 0)
    })
    .map((l) => ({ exercise: l.exercise, weightLb: l.weightLb, date: l.date }))

  return {
    start,
    today: today(),
    days,
    prev,
    foods,
    weightBefore: before?.weight ?? null,
    weightEnd: inside?.weight ?? null,
    lifts,
  }
}

/** Monday to Wednesday reads last week; from Thursday the week in hand. */
export function bannerWeek(): string {
  const t = today()
  const wd = (fromKey(t).getDay() + 6) % 7
  const thisMonday = weekStart(t)
  return wd <= 2 ? addDays(thisMonday, -7) : thisMonday
}

function useReview(start: string): Review {
  const app = useApp()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => weekReview(weekInput(app, start)), [app.data, app.macroTargets, app.waterTarget, start])
}

/* --------------------------------------------------------------- banner -- */

export function WeekBanner() {
  const { push } = useApp()
  const start = bannerWeek()
  const r = useReview(start)
  const color = scoreColor(r.score)
  return (
    <button className="wkbanner" onClick={() => push({ name: 'weekReview', start })}>
      <span className="wkbanner__dial">
        <ScoreDial value={r.score} color={color} size={48} stroke={4} fontSize={13.5} />
      </span>
      <span className="wkbanner__main">
        <span className="wkbanner__title">{r.partial ? 'Your week so far' : 'Your week, read back'}</span>
        <span className="wkbanner__sub">
          {r.word} · {r.logged} of {r.elapsed} day{r.elapsed === 1 ? '' : 's'} logged
        </span>
        <DayDots days={r.days} small />
      </span>
      <span className="row__chev">
        <Icon name="forward" size={18} strokeWidth={2.2} />
      </span>
    </button>
  )
}

function DayDots({ days, small }: { days: Review['days']; small?: boolean }) {
  return (
    <span className={`wk-dots ${small ? 'wk-dots--sm' : ''}`}>
      {days.map((d) => (
        <span key={d.date} className={`wk-dot wk-dot--${d.status} ${d.future ? 'wk-dot--future' : ''}`}>
          {!small && <span className="wk-dot__letter">{d.letter}</span>}
        </span>
      ))}
    </span>
  )
}

/* --------------------------------------------------------------- screen -- */

export function WeekReview({ start: initial }: { start: string }) {
  const { pop, settings } = useApp()
  const [start, setStart] = useState(initial)
  const r = useReview(start)
  const color = scoreColor(r.score)
  const canForward = addDays(start, 7) <= today()
  const unit = settings.weightUnit

  const maxCal = Math.max(r.avgGoal * 1.25, ...r.days.map((d) => d.calories), 1)
  const goalPct = r.avgGoal > 0 ? Math.min(100, (r.avgGoal / maxCal) * 100) : 0

  const weightDelta =
    r.body.weightBefore !== null && r.body.weightEnd !== null ? r.body.weightEnd - r.body.weightBefore : null
  const tiles = [
    r.body.weightEnd !== null && {
      icon: 'scale' as const,
      label: 'Weight',
      value: `${Math.round(lbToDisplay(r.body.weightEnd, unit) * 10) / 10} ${unit}`,
      sub:
        weightDelta === null
          ? 'First weigh-in on record'
          : weightDelta === 0
            ? 'Held steady'
            : `${weightDelta > 0 ? '+' : ''}${Math.round(lbToDisplay(weightDelta, unit) * 10) / 10} ${unit} this week`,
      tone: weightDelta !== null && weightDelta < 0 ? 'var(--positive)' : undefined,
    },
    {
      icon: 'water' as const,
      label: 'Water',
      value: `${r.body.waterDays} of ${r.elapsed}`,
      sub: 'days at the goal',
      tone: r.body.waterDays >= r.elapsed ? 'var(--positive)' : undefined,
    },
    r.body.stepTotal > 0 && {
      icon: 'steps' as const,
      label: 'Steps',
      value: r.body.stepTotal.toLocaleString(),
      sub: r.body.bestStepDay
        ? `best ${fromKey(r.body.bestStepDay.date).toLocaleDateString(undefined, { weekday: 'short' })}, ${r.body.bestStepDay.steps.toLocaleString()}`
        : `${r.body.stepDays} days at the goal`,
    },
    r.body.sleepAvg !== null && {
      icon: 'moon' as const,
      label: 'Sleep',
      value: `${Math.floor(r.body.sleepAvg / 60)}h ${r.body.sleepAvg % 60}m`,
      sub: `a night · ${r.body.sleepDays} at the goal`,
    },
    r.body.exerciseMinutes > 0 && {
      icon: 'dumbbell' as const,
      label: 'Exercise',
      value: `${r.body.exerciseMinutes} min`,
      sub: r.body.exerciseCalories ? `${Math.round(r.body.exerciseCalories).toLocaleString()} cal burned` : 'logged',
    },
  ].filter((t): t is Exclude<typeof t, false> => !!t)

  return (
    <>
      <TopBar title="Your week" onBack={pop} />
      <div className="scroll">
        <div className="wk-nav">
          <button className="iconbtn" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week">
            <Icon name="back" size={20} strokeWidth={2.2} />
          </button>
          <span className="wk-nav__label">
            {r.label}
            {r.partial && <span className="wk-nav__tag">so far</span>}
          </span>
          <button
            className="iconbtn"
            disabled={!canForward}
            style={{ opacity: canForward ? 1 : 0.3 }}
            onClick={() => canForward && setStart(addDays(start, 7))}
            aria-label="Next week"
          >
            <Icon name="forward" size={20} strokeWidth={2.2} />
          </button>
        </div>

        <div className="card wk-hero">
          <ScoreDial value={r.score} color={color} size={132} stroke={3.5} fontSize={38} />
          <div className="ns-word" style={{ color }}>
            {r.word}
          </div>
          <p className="wk-hero__line">{r.headline}</p>
          <DayDots days={r.days} />
        </div>

        <div className="card">
          <div className="card__head">
            <span className="card__title">Calories</span>
            <span className="wk-legend">
              <i className="wk-dot wk-dot--in" /> in <i className="wk-dot wk-dot--over" /> over{' '}
              <i className="wk-dot wk-dot--under" /> light
            </span>
          </div>
          <div className="wk-bars">
            {goalPct > 0 && (
              <span className="wk-bars__goal" style={{ bottom: `${goalPct}%` }}>
                <span className="wk-bars__goaltag">goal</span>
              </span>
            )}
            {r.days.map((d) => (
              <span key={d.date} className="wk-bar">
                <span
                  className={`wk-bar__fill wk-bar__fill--${d.status}`}
                  style={{ height: `${Math.max(d.calories > 0 ? 3 : 0, (d.calories / maxCal) * 100)}%` }}
                />
                <span className="wk-bar__letter">{d.letter}</span>
              </span>
            ))}
          </div>
          <div className="wk-metrics">
            <Metric label="Average" value={r.avgCalories.toLocaleString()} unit="cal" />
            <Metric label="Goal" value={r.avgGoal.toLocaleString()} unit="cal" />
            <Metric
              label="Best day"
              value={r.bestDay ? fromKey(r.bestDay).toLocaleDateString(undefined, { weekday: 'short' }) : '–'}
              unit=""
            />
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <span className="card__title">On the plate</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>average on logged days</span>
          </div>
          <div className="wk-macros">
            {r.macros.map((m) => {
              const pct = m.target > 0 ? Math.min(100, (m.avg / m.target) * 100) : 0
              return (
                <div key={m.key} className="wk-macro">
                  <span className="wk-macro__head">
                    <span>
                      {m.label}
                      <i className="wk-macro__dot" style={{ background: `var(--${m.key})` }} />
                    </span>
                    <span className="num">
                      {m.avg} <span className="wk-macro__of">/ {m.target} g</span>
                    </span>
                  </span>
                  <span className="tile__bar">
                    <span className="tile__fill" style={{ width: `${pct}%`, background: `var(--${m.key})` }} />
                  </span>
                </div>
              )
            })}
          </div>
          {r.stars.length > 0 && (
            <>
              <div className="wk-sub">Your stars</div>
              {r.stars.map((f) => (
                <FoodLine key={f.name} f={f} />
              ))}
            </>
          )}
          {r.swaps.length > 0 && (
            <>
              <div className="wk-sub">Worth a swap</div>
              {r.swaps.map((f) => (
                <FoodLine key={f.name} f={f} />
              ))}
            </>
          )}
          {r.logged > 0 && r.stars.length === 0 && r.swaps.length === 0 && (
            <div className="hint">Nothing was logged often enough to call a star or a swap yet.</div>
          )}
        </div>

        {tiles.length > 0 && (
          <div className="card">
            <div className="card__head">
              <span className="card__title">Body</span>
            </div>
            <div className="wk-tiles">
              {tiles.map((t) => (
                <div key={t.label} className="wk-tile">
                  <span className="wk-tile__label">
                    <Icon name={t.icon} size={14} />
                    {t.label}
                  </span>
                  <span className="wk-tile__value num" style={{ color: t.tone }}>
                    {t.value}
                  </span>
                  <span className="wk-tile__sub">{t.sub}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {r.lifts.length > 0 && (
          <div className="card">
            <div className="card__head">
              <span className="card__title">New PRs</span>
            </div>
            {r.lifts.map((l) => (
              <Row
                key={`${l.exercise}-${l.date}`}
                title={l.exercise}
                sub={fromKey(l.date).toLocaleDateString(undefined, { weekday: 'long' })}
                value={`${Math.round(lbToDisplay(l.weightLb, unit) * 10) / 10} ${unit}`}
                right={<span className="prbadge">PR</span>}
              />
            ))}
          </div>
        )}

        <div className="card wk-focus">
          <div className="card__head">
            <span className="card__title">Next week</span>
          </div>
          <div className="wk-focus__body">
            <span className="wk-focus__title">{r.focus.title}</span>
            <span className="wk-focus__text">{r.focus.text}</span>
          </div>
          {r.vsLast && (
            <div className="wk-vs">
              <span className="wk-vs__label">Against last week</span>
              <span className="wk-vs__chips">
                {r.vsLast.map((v) => {
                  const good = v.delta === 0 ? null : (v.delta > 0) === (v.goodWhen === 'up')
                  return (
                    <span key={v.label} className={`wk-vs__chip ${good === null ? '' : good ? 'wk-vs__chip--good' : 'wk-vs__chip--bad'}`}>
                      <span className="num">
                        {v.delta > 0 ? '+' : ''}
                        {v.delta.toLocaleString()}
                        {v.unit}
                      </span>{' '}
                      {v.label.toLowerCase()}
                    </span>
                  )
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function FoodLine({ f }: { f: FoodTally }) {
  return (
    <Row
      title={f.name}
      sub={`${f.count} time${f.count === 1 ? '' : 's'} · ${f.calories.toLocaleString()} cal in all`}
      right={
        <span className="wk-score num" style={{ color: scoreColor(f.score) }}>
          {f.score.toFixed(1)}
        </span>
      }
    />
  )
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="wk-metric">
      <span className="wk-metric__value num">
        {value}
        {unit && <span className="wk-metric__unit"> {unit}</span>}
      </span>
      <span className="wk-metric__label">{label}</span>
    </div>
  )
}
