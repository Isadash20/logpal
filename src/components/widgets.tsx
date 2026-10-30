import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { useApp } from '../state/store'
import { Icon, type IconName } from './Icon'
import { cal } from '../lib/format'
import { lbToDisplay, mlToDisplay, waterUnitLabel } from '../lib/units'
import { addDays, shortDate } from '../lib/dates'
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
 * squeezed. The parts that do not fit are simply not drawn.
 *
 * The look follows DESIGN.md: a small grey title with the stat's icon in a
 * tinted circle, one large figure, a grey sub-line, and the progress drawn
 * in the stat's own colour.
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

/* ---------------------------------------------------------------- title -- */

/** The widget's name with its icon in a circle tinted by the stat's colour. */
function Title({
  icon,
  color,
  glyph = '#ffffff',
  children,
}: {
  icon: IconName
  color: string
  /** The icon's own colour; white on a solid disc unless told otherwise. */
  glyph?: string
  children: ReactNode
}) {
  return (
    <span className="widget__title">
      <span className="stat-icon" style={{ background: color, color: glyph }}>
        <Icon name={icon} size={15} strokeWidth={2.2} />
      </span>
      {children}
    </span>
  )
}

/* ----------------------------------------------------------------- ring -- */

/**
 * A progress ring with its percentage in the middle.
 *
 * Sized by the space it is given, or by `size` when a widget wants a fixed
 * dial beside its figures. The arc is capped at a full turn while the number
 * is not: 130% of a calorie goal is worth saying, and a ring that wrapped past
 * twelve o'clock would read as 30%.
 */
function Ring({
  value,
  color,
  caption,
  label,
  over,
  size,
  stroke = 8,
}: {
  /** 0-1 and beyond; 1 is the goal. */
  value: number
  color: string
  caption?: string
  label?: string
  /** Colours the ring as a warning once past the goal (calories, not steps). */
  over?: boolean
  /** Fixed pixel size. Without it the ring fills whatever space it is given. */
  size?: number
  stroke?: number
}) {
  const r = 34
  const circumference = 2 * Math.PI * r
  const filled = Math.min(1, Math.max(0, value))
  const tone = over && value > 1 ? 'var(--danger)' : color
  const fixed = size !== undefined
  /* Small dials get a proportionally larger figure or it vanishes. */
  const fontSize = fixed && size! <= 56 ? 21 : 17

  return (
    <span
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        flex: fixed ? 'none' : 1,
        minHeight: 0,
        minWidth: 0,
        width: fixed ? size : '100%',
      }}
    >
      <svg
        viewBox="0 0 80 80"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${Math.round(value * 100)}%`}
        /* Capped so a four-column widget on a tablet does not turn into one
           enormous dial; the flex above still shrinks it on a phone. */
        style={
          fixed
            ? { width: size, height: size, flex: 'none' }
            : { flex: 1, minHeight: 0, width: '100%', maxWidth: 124 }
        }
      >
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {filled > 0 && (
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth={stroke}
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
          style={{ fontSize, fontWeight: 800, fill: 'var(--text)', letterSpacing: '-0.03em' }}
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

/** The thin bar under a figure, in the stat's colour. */
function Bar({ value, color }: { value: number; color: string }) {
  return (
    <span className="tile__bar" style={{ marginTop: 'auto' }}>
      <span
        className="tile__fill"
        style={{ width: `${Math.min(100, Math.max(0, value) * 100)}%`, background: color }}
      />
    </span>
  )
}

/* ------------------------------------------------------------- calories -- */

/**
 * The hero. Remaining is the large figure, since it is the one that changes
 * what you do next; eaten and goal sit under it in grey. The ring at the
 * right shows how far through the goal the day is, the shape every tracker
 * studied puts beside this number.
 */
function CaloriesWidget({ date, w, h, editing }: WidgetProps) {
  const { totalsFor, settings } = useApp()
  const open = useOpen(editing)
  const totals = totalsFor(date)
  const credit = settings.exerciseAddsCalories ? totals.exerciseCalories : 0
  const consumed = totals.nutrients.calories
  const goal = totals.goal + credit
  const left = goal - consumed
  const ratio = goal > 0 ? consumed / goal : 0

  const ring = h >= 2 && w >= 3
  const ringSize = isExpanded(h) ? 132 : 96

  return (
    <div
      className="widget__body"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, alignSelf: 'stretch' }}>
        <Title icon="flame" color="var(--accent)">
          Calories
        </Title>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4, minWidth: 0 }}>
          <span
            className="num"
            style={{
              fontSize: h >= 2 ? 36 : 26,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 1,
              color: left < 0 ? 'var(--danger)' : 'var(--text)',
            }}
          >
            {cal(Math.abs(left))}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>
            {left < 0 ? 'over' : 'left'}
          </span>
        </div>
        {h >= 2 && (
          <div className="widget__sub" style={{ marginTop: 6 }}>
            <span className="num" style={{ color: 'var(--text)', fontWeight: 600 }}>
              {cal(consumed)}
            </span>{' '}
            eaten
            <span style={{ color: 'var(--text-3)' }}> · </span>
            <span className="num" style={{ color: 'var(--text)', fontWeight: 600 }}>
              {cal(goal)}
            </span>{' '}
            goal
          </div>
        )}
        {h >= 2 && (
          <button
            className="textbtn"
            style={{ padding: 0, marginTop: 'auto', alignSelf: 'flex-start', fontSize: 13.5 }}
            onClick={() => open({ name: 'goals' })}
          >
            Your plan
          </button>
        )}
        {h === 1 && (
          <div className="progress" style={{ height: 6, marginTop: 'auto' }}>
            <div
              className={`progress__fill ${left < 0 ? 'progress__fill--over' : ''}`}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
        )}
      </div>
      {ring && (
        <Ring value={ratio} color="var(--accent)" over size={ringSize} stroke={9} />
      )}
      {h >= 2 && !ring && (
        <div className="progress" style={{ height: 6, marginTop: 'auto' }}>
          <div
            className={`progress__fill ${left < 0 ? 'progress__fill--over' : ''}`}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- macros -- */

/**
 * Three equal units, each in its own colour: grams eaten over the target with
 * a bar underneath. Expanded, each becomes a ring. The narrow one-row form
 * keeps only the grams.
 */
function MacrosWidget({ date, w, h }: WidgetProps) {
  const { totalsFor, macroTargets } = useApp()
  const n = totalsFor(date).nutrients

  const rows: [string, number, number, string][] = [
    ['Protein', n.protein, macroTargets.protein, 'var(--protein)'],
    ['Carbs', n.carbs, macroTargets.carbs, 'var(--carbs)'],
    ['Fat', n.fat, macroTargets.fat, 'var(--fat)'],
  ]

  return (
    <div className="widget__body">
      <Title icon="chart" color="var(--carbs)">
        Macros
      </Title>
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
          {rows.map(([label, gramsNow, target, color]) => (
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: w > 2 ? 14 : 8,
            marginTop: 6,
            flex: 1,
          }}
        >
          {rows.map(([label, gramsNow, target, color]) => (
            <div key={label} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flex: 'none' }} />
                <span
                  style={{
                    fontSize: 12.5,
                    color: 'var(--text-2)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, minWidth: 0 }}>
                <span
                  className="num"
                  style={{
                    fontSize: w > 2 ? 20 : 17,
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                    color,
                  }}
                >
                  {Math.round(gramsNow)}
                </span>
                <span className="num" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
                  / {target} g
                </span>
              </div>
              {h > 1 && (
                <span className="widget__sub" style={{ fontSize: 12 }}>
                  {gramsNow > target
                    ? `${Math.round(gramsNow - target)} g over`
                    : `${Math.round(target - gramsNow)} g left`}
                </span>
              )}
              {h > 1 && (
                <span className="tile__bar" style={{ height: 5, marginTop: 'auto' }}>
                  <span
                    className="tile__fill"
                    style={{
                      width: `${target > 0 ? Math.min(100, (gramsNow / target) * 100) : 0}%`,
                      background: color,
                    }}
                  />
                </span>
              )}
            </div>
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
  const color = progress >= 1 ? 'var(--positive)' : 'var(--sleep)'

  return (
    <button className="widget__body widget__body--tap" onClick={() => open({ name: 'fasting' })}>
      <Title icon="clock" color="var(--sleep)">
        Fasting
      </Title>
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
              <Ring value={progress} color={color} caption="of target" />
            </span>
          ) : (
            <Bar value={progress} color={color} />
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
  const ratio = waterTarget > 0 ? log.water / waterTarget : 0

  return (
    <button className="widget__body widget__body--tap" onClick={() => open({ name: 'water', date })}>
      <Title icon="water" color="var(--water)">
        Water
      </Title>
      <span className="widget__value">
        <span className="num">{fmt(log.water)}</span>
        {/* One column is too narrow for "6 / 13.1 cups". The goal is the
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
              <Ring value={ratio} color="var(--water)" caption="of goal" />
            </span>
          ) : (
            <Bar value={ratio} color="var(--water)" />
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
  const ratio = (log.sleepMin ?? 0) / Math.max(1, goal)

  return (
    <button className="widget__body widget__body--tap" onClick={() => open({ name: 'sleep', date })}>
      <Title icon="moon" color="var(--sleep)">
        Sleep
      </Title>
      <span className="widget__value">
        <span className="num">{log.sleepMin == null ? '–' : formatSleep(log.sleepMin)}</span>
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
              <Ring value={ratio} color="var(--sleep)" caption="of target" />
            </span>
          ) : (
            <Bar value={ratio} color="var(--sleep)" />
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
  const ratio = (log.steps ?? 0) / Math.max(1, goal)

  return (
    <button className="widget__body widget__body--tap" onClick={() => open({ name: 'steps', date })}>
      <Title icon="steps" color="var(--steps)">
        Steps
      </Title>
      <span className="widget__value">
        <span className="num">{log.steps == null ? '–' : log.steps.toLocaleString()}</span>
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
              <Ring value={ratio} color="var(--steps)" caption="of goal" />
            </span>
          ) : (
            <Bar value={ratio} color="var(--steps)" />
          )}
        </>
      )}
    </button>
  )
}

/* --------------------------------------------------------------- weight -- */

/** A small trend line: the last fortnight of weigh-ins, nothing labelled. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 0.5)
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * 100
    const y = 4 + (1 - (v - min) / span) * 24
    return [x, y] as const
  })
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: '100%', height: 34, marginTop: 'auto', display: 'block', overflow: 'visible' }}
    >
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * Latest weight, the change over a week, and the trend. The figure every
 * weight-loss tracker studied puts on its first screen, and the one this app
 * kept two taps away.
 */
function WeightWidget({ date, w, h, editing }: WidgetProps) {
  const { data, settings } = useApp()
  const open = useOpen(editing)
  const unit = settings.weightUnit
  const disp = (lb: number) => Math.round(lbToDisplay(lb, unit) * 10) / 10

  const sorted = data.weights
    .filter((x) => x.date <= date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const latest = sorted[sorted.length - 1]
  const weekAgo = addDays(date, -7)
  const ref = [...sorted].reverse().find((x) => x.date <= weekAgo)
  const delta = latest && ref ? latest.weight - ref.weight : null
  const trend = sorted.slice(-14).map((x) => x.weight)

  const sub = !latest
    ? 'Tap to log a weigh-in'
    : delta == null
      ? `Logged ${shortDate(latest.date)}`
      : Math.abs(disp(delta)) < 0.05
        ? 'No change this week'
        : `${delta < 0 ? 'Down' : 'Up'} ${Math.abs(disp(delta))} ${unit} this week`

  return (
    <button className="widget__body widget__body--tap" onClick={() => open({ name: 'weightEntry' })}>
      <Title icon="scale" color="var(--accent)">
        Weight
      </Title>
      <span className="widget__value">
        <span className="num">{latest ? disp(latest.weight) : '–'}</span>
        {latest && w > 1 && <span className="widget__unit">{unit}</span>}
      </span>
      {h > 1 && <span className="widget__sub">{sub}</span>}
      {h > 1 && trend.length >= 2 && (
        <Sparkline values={trend} color={delta != null && delta < 0 ? 'var(--positive)' : 'var(--accent)'} />
      )}
    </button>
  )
}

/* -------------------------------------------------------------- exercise -- */

function ExerciseWidget({ date, h, editing }: WidgetProps) {
  const { data, totalsFor } = useApp()
  const open = useOpen(editing)
  const totals = totalsFor(date)
  const workouts = data.exerciseEntries.filter((e) => e.date === date)

  return (
    <button
      className="widget__body widget__body--tap"
      onClick={() => open({ name: 'exerciseSearch', date, kind: 'cardio' })}
    >
      <Title icon="dumbbell" color="var(--steps)">
        Exercise
      </Title>
      <span className="widget__value" style={{ fontSize: workouts.length ? 17 : 17, fontWeight: workouts.length ? 700 : 600 }}>
        <span style={{ color: workouts.length ? 'var(--text)' : 'var(--text-2)' }}>
          {workouts.length ? workouts.map((e) => e.name).join(', ') : 'Nothing logged'}
        </span>
      </span>
      {h > 1 && (
        <span className="widget__sub">
          {workouts.length
            ? `${totals.exerciseMinutes} min · ${cal(totals.exerciseCalories)} cal`
            : 'Tap to add a workout'}
        </span>
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
  weight: WeightWidget,
  exercise: ExerciseWidget,
}
