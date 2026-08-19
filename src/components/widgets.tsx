import { useEffect, useState, type ReactElement } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { cal } from '../lib/format'
import { mlToDisplay, waterUnitLabel } from '../lib/units'
import { formatSleep } from '../screens/wellness'
import {
  activeFast,
  fastElapsedMs,
  fastProgress,
  formatDuration,
  targetHoursFor,
} from '../lib/fasting'
import type { WidgetId } from '../lib/widgetLayout'

/**
 * The bodies of the Home widgets.
 *
 * Each one reads the store itself rather than being handed twenty props, and
 * each takes the size it has been given so it can decide what to drop. A
 * widget narrowed to one column keeps its headline number and loses the
 * sub-line; a widget one row tall loses its progress bar. Nothing is ever
 * squeezed — the parts that do not fit are simply not drawn.
 */

export interface WidgetProps {
  date: string
  w: number
  h: number
  /** True while the board is being arranged: taps must not navigate. */
  editing: boolean
}

function useOpen(editing: boolean) {
  const { push } = useApp()
  return (route: Parameters<typeof push>[0]) => {
    if (!editing) push(route)
  }
}


/* ----------------------------------------------------------------- ring -- */

/**
 * A progress ring with its percentage in the middle.
 *
 * Shown instead of the bar once a widget is tall enough to have the room. A
 * bar reads as a sliver in a widget three rows high, and the space wants
 * filling with something — so the same figure is drawn as the shape every
 * other progress display in the app uses: the fasting dial, and the sleep and
 * step screens.
 *
 * The arc is capped at a full turn while the number is not: 130% of a calorie
 * goal is worth saying, and a ring that wrapped past twelve o'clock would read
 * as 30%.
 */
function Ring({
  value,
  color,
  caption,
  label,
  over,
}: {
  /** 0–1 and beyond; 1 is the goal. */
  value: number
  color: string
  caption?: string
  label?: string
  /** Colours the ring as a warning once past the goal (calories, not steps). */
  over?: boolean
}) {
  const r = 34
  const circumference = 2 * Math.PI * r
  const filled = Math.min(1, Math.max(0, value))
  const tone = over && value > 1 ? 'var(--danger)' : color

  /* Sized by the space it is given rather than a fixed number of pixels: the
     widget can be two rows or four, one column or four, and a ring that stayed
     86px left most of a large widget empty. The viewBox does the scaling, so
     the percentage inside grows with it. */
  return (
    <span
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: '100%',
      }}
    >
      <svg
        viewBox="0 0 80 80"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${Math.round(value * 100)}%`}
        /* Capped so a four-column widget on a tablet does not turn into one
           enormous dial; the flex above still shrinks it on a phone. */
        style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: 124 }}
      >
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
        {filled > 0 && (
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${filled * circumference} ${circumference}`}
            transform="rotate(-90 40 40)"
            style={{ transition: 'stroke-dasharray .4s ease' }}
          />
        )}
        <text
          x="40"
          y="40"
          textAnchor="middle"
          dominantBaseline="central"
          className="num"
          style={{ fontSize: 17, fontWeight: 800, fill: 'var(--text)' }}
        >
          {Math.round(value * 100)}%
        </text>
      </svg>
      {caption && (
        <span className="num" style={{ fontSize: 11.5, color: 'var(--text-3)', flex: 'none' }}>
          {caption}
        </span>
      )}
      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', flex: 'none' }}>
          {label}
        </span>
      )}
    </span>
  )
}

/** Tall enough to be worth a ring rather than a bar. */
function isExpanded(h: number): boolean {
  return h >= 3
}

/* ------------------------------------------------------------- calories -- */

function CaloriesWidget({ date, h }: WidgetProps) {
  const { totalsFor, settings } = useApp()
  const totals = totalsFor(date)
  const credit = settings.exerciseAddsCalories ? totals.exerciseCalories : 0
  const consumed = totals.nutrients.calories
  const left = totals.goal - consumed + credit
  const pctEaten = totals.goal > 0 ? Math.min(100, (consumed / totals.goal) * 100) : 0

  return (
    <div className="widget__body">
      <div className="widget__title">Calories</div>
      <div className="widget__figures">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
          <span className="num" style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.03em' }}>
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
            style={{ fontSize: 19, fontWeight: 800, color: left < 0 ? 'var(--danger)' : 'var(--text)' }}
          >
            {cal(Math.abs(left))}
          </span>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}> {left < 0 ? 'over' : 'left'}</span>
        </div>
      </div>
      {isExpanded(h) ? (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, paddingTop: 4 }}>
          <Ring
            value={totals.goal > 0 ? consumed / (totals.goal + credit) : 0}
            color="var(--accent)"
            over
            caption="of goal"
          />
        </div>
      ) : (
        h > 1 && (
          <div className="progress" style={{ height: 8, marginTop: 'auto' }}>
            <div
              className={`progress__fill ${left < 0 ? 'progress__fill--over' : ''}`}
              style={{ width: `${pctEaten}%` }}
            />
          </div>
        )
      )}
    </div>
  )
}

/* --------------------------------------------------------------- macros -- */

function MacrosWidget({ date, w, h }: WidgetProps) {
  const { totalsFor, macroTargets } = useApp()
  const n = totalsFor(date).nutrients
  const kcal = { c: n.carbs * 4, f: n.fat * 9, p: n.protein * 4 }
  const total = kcal.c + kcal.f + kcal.p
  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0)

  const rows: [string, number, number, number, string][] = [
    ['Carbs', kcal.c, n.carbs, macroTargets.carbs, 'var(--carbs)'],
    ['Fat', kcal.f, n.fat, macroTargets.fat, 'var(--fat)'],
    ['Protein', kcal.p, n.protein, macroTargets.protein, 'var(--protein)'],
  ]

  return (
    <div className="widget__body">
      {/* Expanded, each macro gets its own ring, filled by how much of that
          macro's target has been eaten — the same thing the grams line says,
          drawn. The compact form keeps the share-of-calories split instead,
          because three numbers that add to 100 is the comparison worth having
          when there is only room for one line. */}
      <div className="widget__title">Macros</div>
      {isExpanded(h) ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${w > 1 ? 3 : 1}, 1fr)`,
            gap: 12,
            flex: 1,
            minHeight: 0,
            paddingTop: 2,
          }}
        >
          {rows.map(([label, , gramsNow, target, color]) => (
            <Ring
              key={label}
              value={target > 0 ? gramsNow / target : 0}
              color={color}
              caption={`${Math.round(gramsNow)} / ${target} g`}
              label={label}
            />
          ))}
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {rows.map(([label, k, gramsNow, target, color]) => (
          <div key={label} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  fontSize: w > 2 ? 14 : 12,
                  color: 'var(--text-2)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {label}
              </span>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flex: 'none' }} />
            </div>
            <div
              className="num"
              style={{ fontSize: w > 2 ? 20 : 17, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}
            >
              {Math.round(share(k))} %
            </div>
            {/* The grams line is the first thing to go when there is no room:
                the percentages are the comparison, the grams are the detail. */}
            {h > 1 && (
              <div className="num" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {Math.round(gramsNow)} / {target} g
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {!isExpanded(h) && (
        <div
          style={{
            display: 'flex',
            height: 9,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'var(--surface-3)',
            marginTop: 'auto',
          }}
        >
          {total > 0 &&
            ([
              [kcal.c, 'var(--carbs)'],
              [kcal.f, 'var(--fat)'],
              [kcal.p, 'var(--protein)'],
            ] as [number, string][]).map(([v, color], i) => (
              <div key={i} style={{ width: `${share(v)}%`, background: color }} />
            ))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- fasting -- */

function FastingWidget({ h, editing }: WidgetProps) {
  const { data } = useApp()
  const open = useOpen(editing)
  const fast = activeFast(data.fasts)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!fast) return
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [fast])

  const progress = fast ? fastProgress(fast, now) : 0

  return (
    <button className="widget__body widget__body--tap" onClick={() => open({ name: 'fasting' })}>
      <span className="widget__title">
        <Icon name="clock" size={15} />
        Fasting
      </span>
      <span className="widget__value">
        <span className="num">{fast ? formatDuration(fastElapsedMs(fast, now)) : '0:00'}</span>
      </span>
      {h > 1 && (
        <>
          <span className="widget__sub">
            {fast ? `of ${fast.targetHours}h target` : `Not fasting · ${targetHoursFor(data.fasting)}h plan`}
          </span>
          {isExpanded(h) ? (
            <span style={{ display: 'flex', flex: 1, minHeight: 0, paddingTop: 4 }}>
              <Ring
                value={progress}
                color={progress >= 1 ? 'var(--positive)' : 'var(--accent)'}
                caption="of target"
              />
            </span>
          ) : (
            <span className="tile__bar" style={{ marginTop: 'auto' }}>
              <span
                className="tile__fill"
                style={{
                  width: `${Math.min(100, progress * 100)}%`,
                  background: progress >= 1 ? 'var(--positive)' : 'var(--accent)',
                }}
              />
            </span>
          )}
        </>
      )}
    </button>
  )
}

/* ---------------------------------------------------------------- water -- */

function WaterWidget({ date, w, h, editing }: WidgetProps) {
  const { dayLog, waterTarget, settings } = useApp()
  const open = useOpen(editing)
  const log = dayLog(date)
  const fmt = (ml: number) => {
    const v = mlToDisplay(ml, settings.waterUnit)
    return settings.waterUnit === 'ml' ? Math.round(v) : Math.round(v * 10) / 10
  }

  return (
    <button className="widget__body widget__body--tap" onClick={() => open({ name: 'water', date })}>
      <span className="widget__title">
        <Icon name="water" size={15} />
        Water
      </span>
      <span className="widget__value">
        <span className="num">{fmt(log.water)}</span>
        {/* One column is too narrow for "6 / 13.1 cups" — the goal is the
            half to drop, since the bar underneath already shows the ratio. */}
        {w > 1 && (
          <span className="widget__unit">
            / {fmt(waterTarget)} {waterUnitLabel(settings.waterUnit)}
          </span>
        )}
      </span>
      {h > 1 && (
        <>
          <span className="widget__sub">
            {log.water >= waterTarget
              ? 'Goal reached'
              : `${fmt(Math.max(0, waterTarget - log.water))} to go`}
          </span>
          {isExpanded(h) ? (
            <span style={{ display: 'flex', flex: 1, minHeight: 0, paddingTop: 4 }}>
              <Ring
                value={waterTarget > 0 ? log.water / waterTarget : 0}
                color="var(--water)"
                caption="of goal"
              />
            </span>
          ) : (
            <span className="tile__bar" style={{ marginTop: 'auto' }}>
              <span
                className="tile__fill"
                style={{
                  width: `${waterTarget > 0 ? Math.min(100, (log.water / waterTarget) * 100) : 0}%`,
                  background: 'var(--water)',
                }}
              />
            </span>
          )}
        </>
      )}
    </button>
  )
}

/* ---------------------------------------------------------------- sleep -- */

function SleepWidget({ date, w, h, editing }: WidgetProps) {
  const { dayLog, profile } = useApp()
  const open = useOpen(editing)
  const log = dayLog(date)
  const goal = profile.sleepGoalMin

  return (
    <button className="widget__body widget__body--tap" onClick={() => open({ name: 'sleep', date })}>
      <span className="widget__title">
        <Icon name="moon" size={15} />
        Sleep
      </span>
      <span className="widget__value">
        <span className="num">{log.sleepMin == null ? '—' : formatSleep(log.sleepMin)}</span>
        {w > 1 && <span className="widget__unit">/ {formatSleep(goal)}</span>}
      </span>
      {h > 1 && (
        <>
          <span className="widget__sub">
            {log.sleepMin == null
              ? 'Not logged'
              : log.sleepMin >= goal
                ? 'Target met'
                : `${formatSleep(goal - log.sleepMin)} short`}
          </span>
          {isExpanded(h) ? (
            <span style={{ display: 'flex', flex: 1, minHeight: 0, paddingTop: 4 }}>
              <Ring value={(log.sleepMin ?? 0) / Math.max(1, goal)} color="var(--sleep)" caption="of target" />
            </span>
          ) : (
            <span className="tile__bar" style={{ marginTop: 'auto' }}>
              <span
                className="tile__fill"
                style={{
                  width: `${Math.min(100, ((log.sleepMin ?? 0) / Math.max(1, goal)) * 100)}%`,
                  background: 'var(--sleep)',
                }}
              />
            </span>
          )}
        </>
      )}
    </button>
  )
}

/* ---------------------------------------------------------------- steps -- */

function StepsWidget({ date, w, h, editing }: WidgetProps) {
  const { dayLog, profile } = useApp()
  const open = useOpen(editing)
  const log = dayLog(date)
  const goal = profile.stepGoal

  return (
    <button className="widget__body widget__body--tap" onClick={() => open({ name: 'steps', date })}>
      <span className="widget__title">
        <Icon name="steps" size={15} />
        Steps
      </span>
      <span className="widget__value">
        <span className="num">{log.steps == null ? '—' : log.steps.toLocaleString()}</span>
        {w > 1 && <span className="widget__unit">/ {goal.toLocaleString()}</span>}
      </span>
      {h > 1 && (
        <>
          <span className="widget__sub">
            {log.steps == null
              ? 'Not logged'
              : log.steps >= goal
                ? 'Goal reached'
                : `${(goal - log.steps).toLocaleString()} to go`}
          </span>
          {isExpanded(h) ? (
            <span style={{ display: 'flex', flex: 1, minHeight: 0, paddingTop: 4 }}>
              <Ring value={(log.steps ?? 0) / Math.max(1, goal)} color="var(--steps)" caption="of goal" />
            </span>
          ) : (
            <span className="tile__bar" style={{ marginTop: 'auto' }}>
              <span
                className="tile__fill"
                style={{
                  width: `${Math.min(100, ((log.steps ?? 0) / Math.max(1, goal)) * 100)}%`,
                  background: 'var(--steps)',
                }}
              />
            </span>
          )}
        </>
      )}
    </button>
  )
}

export const WIDGETS: Record<WidgetId, (p: WidgetProps) => ReactElement> = {
  calories: CaloriesWidget,
  macros: MacrosWidget,
  fasting: FastingWidget,
  water: WaterWidget,
  sleep: SleepWidget,
  steps: StepsWidget,
}
