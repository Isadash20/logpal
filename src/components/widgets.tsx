import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { useApp } from '../state/store'
import { Icon, type IconName } from './Icon'
import { cal } from '../lib/format'
import { stepCalories } from '../lib/nutrition'
import { lbToDisplay, mlToDisplay, waterUnitLabel } from '../lib/units'
import { addDays, shortDate } from '../lib/dates'
import { useT } from '../i18n'
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
 * each is drawn for the *shape* it has been given, not merely trimmed to fit
 * it. A one-row strip is laid out sideways, icon then figure then bar then
 * note, because a column of three lines in a 72 px band squashes the number
 * and leaves the right-hand half empty. A half-width card puts its dial in
 * the corner the title does not use. A wide card puts the dial beside the
 * figures. Nothing is ever squeezed, and no shape is left half blank.
 *
 * The eight shapes a widget can be are named in `formOf`; every widget draws
 * all eight, so resizing on the board can never produce a layout nobody
 * designed.
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

/**
 * The shapes a widget is designed for.
 *
 *   tiny       1×1   icon and figure, nothing else
 *   halfstrip  2×1   sideways: icon, then title over figure, a hairline bar
 *   strip      4×1   sideways: icon, title over figure, bar, note at the right
 *   column     1×2+  icon, title, figure, bar
 *   card       2×2   title with a small dial in the corner, big figure, note
 *   tall       2×3   title, figure, note, a dial filling the rest
 *   wide       4×2   figures on the left, a large dial on the right
 *   big        4×3   the same, larger
 */
export type Form = 'tiny' | 'halfstrip' | 'strip' | 'column' | 'card' | 'tall' | 'wide' | 'big'

export function formOf(w: number, h: number): Form {
  if (h <= 1) return w <= 1 ? 'tiny' : w === 2 ? 'halfstrip' : 'strip'
  if (w <= 1) return 'column'
  if (w === 2) return h === 2 ? 'card' : 'tall'
  return h === 2 ? 'wide' : 'big'
}

function useOpen(editing: boolean) {
  const { push } = useApp()
  return (route: Parameters<typeof push>[0]) => {
    if (!editing) push(route)
  }
}

/* --------------------------------------------------------------- pieces -- */

/** The stat's icon on a solid disc of its colour. */
function Disc({ icon, color, size = 28 }: { icon: IconName; color: string; size?: number }) {
  return (
    <span
      className="stat-icon"
      style={{ background: color, color: '#ffffff', width: size, height: size }}
    >
      <Icon name={icon} size={Math.round(size * 0.54)} strokeWidth={2.2} />
    </span>
  )
}

/** The widget's name with its icon in a circle tinted by the stat's colour. */
function Title({ icon, color, children }: { icon: IconName; color: string; children: ReactNode }) {
  return (
    <span className="widget__title">
      <Disc icon={icon} color={color} />
      {children}
    </span>
  )
}

/** The headline figure with its unit hanging off the baseline. */
function Figure({
  value,
  unit,
  size,
  color,
  style,
}: {
  value: ReactNode
  unit?: ReactNode
  size: number
  color?: string
  style?: CSSProperties
}) {
  return (
    <span
      className="widget__value"
      style={{ fontSize: size, marginTop: 0, color: color ?? 'var(--text)', whiteSpace: 'nowrap', minWidth: 0, ...style }}
    >
      <span className="num">{value}</span>
      {unit && (
        <span
          className="widget__unit"
          style={{ fontSize: Math.max(11, Math.round(size * 0.4)), ...ellipsis, minWidth: 0 }}
        >
          {unit}
        </span>
      )}
    </span>
  )
}

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
  const fontSize = fixed && size! <= 56 ? 22 : 17

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
            : { flex: 1, minHeight: 0, width: '100%', maxWidth: 140 }
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

/** The thin bar under a figure, in the stat's colour. */
function Bar({
  value,
  color,
  height = 6,
  style,
}: {
  value: number
  color: string
  height?: number
  style?: CSSProperties
}) {
  return (
    <span className="tile__bar" style={{ height, marginTop: 'auto', ...style }}>
      <span
        className="tile__fill"
        style={{ width: `${Math.min(100, Math.max(0, value) * 100)}%`, background: color }}
      />
    </span>
  )
}

const ellipsis: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

/** A figure's size in the narrow shapes: "6h 50m" cannot be set as large as "5.3". */
function fit(value: string | number, max: number): number {
  const len = String(value).length
  if (len <= 4) return max
  if (len <= 6) return Math.round(max * 0.78)
  return Math.round(max * 0.66)
}

/* ----------------------------------------------------------- stat shapes -- */

/**
 * What a single-figure widget has to say. Calories, fasting, water, sleep and
 * steps are all this shape: one figure against a goal. They share the eight
 * layouts below so the board stays one design rather than five.
 */
interface StatSpec {
  icon: IconName
  color: string
  title: string
  /** The headline figure. */
  value: string
  /** What sits after it: "/ 8h", "left", "cups". Dropped where there is no room. */
  unit?: string
  /** The grey note: "3 to go", "Not logged". */
  sub?: string
  /** A shorter note for the strip, where the bar takes the middle. */
  short?: string
  /** 0-1 and beyond against the goal. */
  ratio: number
  /** The bar and dial colour when it should differ from the icon's. */
  tone?: string
  /** Colours the dial red once past the goal. */
  over?: boolean
  /** The dial's caption in the tall shape: "of goal", "of target". */
  caption?: string
  /** A second note for the wide shapes, e.g. eaten and goal. */
  detail?: ReactNode
  /** A control for the bottom of the wide shapes, e.g. "Your plan". */
  action?: ReactNode
  valueColor?: string
}

function Stat({ form, s, onOpen }: { form: Form; s: StatSpec; onOpen: () => void }) {
  const tone = s.tone ?? s.color

  if (form === 'tiny') {
    return (
      <button className="widget__body widget__body--tap widget__body--tiny" onClick={onOpen}>
        <Disc icon={s.icon} color={s.color} size={24} />
        <Figure value={s.value} size={fit(s.value, 19)} color={s.valueColor} />
      </button>
    )
  }

  if (form === 'halfstrip') {
    return (
      <button className="widget__body widget__body--tap widget__body--row" onClick={onOpen}>
        <Disc icon={s.icon} color={s.color} size={34} />
        <span className="widget__col">
          <span className="widget__label">{s.title}</span>
          {/* No unit: "6h 50m / 8h" does not fit beside the disc, and the
              bar underneath already says how far along it is. */}
          <Figure value={s.value} size={21} color={s.valueColor} />
          <Bar value={s.ratio} color={tone} height={4} style={{ marginTop: 5 }} />
        </span>
      </button>
    )
  }

  if (form === 'strip') {
    return (
      <button className="widget__body widget__body--tap widget__body--row" onClick={onOpen}>
        <Disc icon={s.icon} color={s.color} size={36} />
        <span className="widget__col" style={{ flex: 'none', maxWidth: '42%' }}>
          <span className="widget__label">{s.title}</span>
          <Figure value={s.value} unit={s.unit} size={22} color={s.valueColor} />
        </span>
        <Bar value={s.ratio} color={tone} height={7} style={{ flex: 1, marginTop: 0, minWidth: 40 }} />
        {(s.short ?? s.sub) && (
          <span className="widget__sub" style={{ ...ellipsis, flex: 'none', maxWidth: '36%' }}>
            {s.short ?? s.sub}
          </span>
        )}
      </button>
    )
  }

  if (form === 'column') {
    return (
      <button className="widget__body widget__body--tap widget__body--column" onClick={onOpen}>
        <Disc icon={s.icon} color={s.color} size={26} />
        <span className="widget__label" style={{ marginTop: 8, ...ellipsis }}>
          {s.title}
        </span>
        <Figure value={s.value} size={fit(s.value, 22)} color={s.valueColor} />
        {/* The note is too long for one column. A dial takes the rest of the
            height instead, with the percentage inside it. */}
        <span style={{ display: 'flex', flex: 1, minHeight: 0, paddingTop: 8 }}>
          <Ring value={s.ratio} color={tone} over={s.over} stroke={9} />
        </span>
      </button>
    )
  }

  if (form === 'card') {
    return (
      <button className="widget__body widget__body--tap" onClick={onOpen}>
        <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <Title icon={s.icon} color={s.color}>
            {s.title}
          </Title>
          <Ring value={s.ratio} color={tone} over={s.over} size={46} stroke={8} />
        </span>
        <span style={{ marginTop: 'auto' }} />
        <Figure value={s.value} unit={s.unit} size={fit(s.value, 32)} color={s.valueColor} />
        {s.sub && <span className="widget__sub">{s.sub}</span>}
      </button>
    )
  }

  if (form === 'tall') {
    return (
      <button className="widget__body widget__body--tap" onClick={onOpen}>
        <Title icon={s.icon} color={s.color}>
          {s.title}
        </Title>
        <Figure value={s.value} unit={s.unit} size={fit(s.value, 32)} color={s.valueColor} style={{ marginTop: 6 }} />
        {s.sub && <span className="widget__sub">{s.sub}</span>}
        <span style={{ display: 'flex', flex: 1, minHeight: 0, paddingTop: 6 }}>
          <Ring value={s.ratio} color={tone} over={s.over} caption={s.caption} />
        </span>
      </button>
    )
  }

  /* wide and big: figures left, dial right. */
  const large = form === 'big'
  return (
    <button
      className="widget__body widget__body--tap"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}
      onClick={onOpen}
    >
      <span className="widget__col" style={{ alignSelf: 'stretch', gap: 3 }}>
        <Title icon={s.icon} color={s.color}>
          {s.title}
        </Title>
        <Figure
          value={s.value}
          unit={s.unit}
          size={large ? 44 : 36}
          color={s.valueColor}
          style={{ marginTop: large ? 14 : 8 }}
        />
        {s.sub && (
          <span className="widget__sub" style={{ fontSize: 13, marginTop: 2 }}>
            {s.sub}
          </span>
        )}
        {s.detail && (
          <span className="widget__sub" style={{ fontSize: 13 }}>
            {s.detail}
          </span>
        )}
        <span style={{ marginTop: 'auto' }} />
        {s.action ?? <Bar value={s.ratio} color={tone} height={6} style={{ marginTop: 0 }} />}
      </span>
      <Ring
        value={s.ratio}
        color={tone}
        over={s.over}
        size={large ? 150 : 100}
        stroke={9}
      />
    </button>
  )
}

/* ------------------------------------------------------------- calories -- */

/**
 * The hero. Remaining is the large figure, since it is the one that changes
 * what you do next; eaten and goal sit under it in grey. The ring shows how
 * far through the goal the day is, the shape every tracker studied puts
 * beside this number.
 */
function CaloriesWidget({ date, w, h, editing }: WidgetProps) {
  const { totalsFor, settings } = useApp()
  const t = useT()
  const open = useOpen(editing)
  const totals = totalsFor(date)
  const credit = settings.exerciseAddsCalories ? totals.exerciseCalories : 0
  const consumed = totals.nutrients.calories
  const goal = totals.goal + credit
  const left = goal - consumed
  const ratio = goal > 0 ? consumed / goal : 0
  const form = formOf(w, h)

  const eatenGoal = (
    <>
      <span className="num" style={{ color: 'var(--text)', fontWeight: 600 }}>
        {cal(consumed)}
      </span>{' '}
      {t('w.eaten')}
      <span style={{ color: 'var(--text-3)' }}> · </span>
      <span className="num" style={{ color: 'var(--text)', fontWeight: 600 }}>
        {cal(goal)}
      </span>{' '}
      {t('w.goal')}
    </>
  )

  return (
    <Stat
      form={form}
      onOpen={() => open({ name: 'calories', date })}
      s={{
        icon: 'flame',
        color: 'var(--accent)',
        title: t('widget.calories'),
        value: cal(Math.abs(left)),
        unit: left < 0 ? t('w.over') : t('w.left'),
        valueColor: left < 0 ? 'var(--danger)' : undefined,
        ratio,
        over: true,
        sub:
          form === 'strip'
            ? `${cal(consumed)} ${t('w.eaten')}`
            : form === 'card' || form === 'tall'
              ? `${cal(consumed)} ${t('w.eaten')} · ${cal(goal)} ${t('w.goal')}`
              : undefined,
        detail: form === 'wide' || form === 'big' ? eatenGoal : undefined,
        action:
          form === 'wide' || form === 'big' ? (
            <span className="textbtn" style={{ padding: 0, alignSelf: 'flex-start', fontSize: 13.5 }}>
              {t('w.breakdown')}
            </span>
          ) : undefined,
      }}
    />
  )
}

/* --------------------------------------------------------------- macros -- */

/**
 * Three figures in their own colours, grams eaten over the target. Narrow
 * shapes stack them as rows with a bar each; wide shapes set them side by
 * side; the biggest gives each a ring.
 */
function MacrosWidget({ date, w, h, editing }: WidgetProps) {
  const { totalsFor, macroTargets } = useApp()
  const t = useT()
  const open = useOpen(editing)
  const onOpen = () => open({ name: 'macros', date })
  const n = totalsFor(date).nutrients
  const form = formOf(w, h)

  const rows: [string, number, number, string][] = [
    [t('w.protein'), n.protein, macroTargets.protein, 'var(--protein)'],
    [t('w.carbs'), n.carbs, macroTargets.carbs, 'var(--carbs)'],
    [t('w.fat'), n.fat, macroTargets.fat, 'var(--fat)'],
  ]
  const pct = (now: number, target: number) => (target > 0 ? now / target : 0)
  const dot = (color: string, size = 7) => (
    <span style={{ width: size, height: size, borderRadius: 999, background: color, flex: 'none' }} />
  )

  if (form === 'tiny') {
    return (
      <button onClick={onOpen} className="widget__body widget__body--tap widget__body--tiny" style={{ alignItems: 'stretch', gap: 3, justifyContent: 'center' }}>
        {rows.map(([label, now, , color]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            {dot(color, 6)}
            <span className="num" style={{ fontSize: 12.5, fontWeight: 800, color, ...ellipsis }}>
              {Math.round(now)}
              <span style={{ fontWeight: 600, color: 'var(--text-3)', fontSize: 10.5 }}> g</span>
            </span>
          </span>
        ))}
      </button>
    )
  }

  if (form === 'halfstrip' || form === 'strip') {
    const wide = form === 'strip'
    return (
      <button onClick={onOpen} className="widget__body widget__body--tap widget__body--row">
        {wide && <Disc icon="chart" color="var(--carbs)" size={36} />}
        <span style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: wide ? 14 : 8, flex: 1, minWidth: 0 }}>
          {rows.map(([label, now, target, color]) => (
            <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                {dot(color, 6)}
                <span className="widget__label" style={ellipsis}>
                  {label}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, minWidth: 0 }}>
                <span className="num" style={{ fontSize: wide ? 18 : 17, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color }}>
                  {Math.round(now)}
                </span>
                <span className="num" style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, ...ellipsis }}>
                  / {target} g
                </span>
              </span>
              {wide && <Bar value={pct(now, target)} color={color} height={4} style={{ marginTop: 4 }} />}
            </span>
          ))}
        </span>
      </button>
    )
  }

  if (form === 'column') {
    return (
      <button onClick={onOpen} className="widget__body widget__body--tap widget__body--column" style={{ justifyContent: 'space-between' }}>
        <Disc icon="chart" color="var(--carbs)" size={26} />
        {rows.map(([label, now, target, color]) => (
          <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {dot(color, 6)}
              <span className="num" style={{ fontSize: 14, fontWeight: 800, color, lineHeight: 1 }}>
                {Math.round(now)}
              </span>
            </span>
            <Bar value={pct(now, target)} color={color} height={4} style={{ marginTop: 0 }} />
          </span>
        ))}
      </button>
    )
  }

  if (form === 'card' || form === 'tall') {
    const tall = form === 'tall'
    return (
      <button onClick={onOpen} className="widget__body widget__body--tap">
        <Title icon="chart" color="var(--carbs)">
          Macros
        </Title>
        <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', flex: 1, minHeight: 0, gap: tall ? 10 : 6, paddingTop: 4 }}>
          {rows.map(([label, now, target, color]) => (
            <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: tall ? 5 : 3 }}>
              <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {dot(color)}
                  <span className="widget__label" style={{ fontSize: tall ? 13 : 12.5, ...ellipsis }}>
                    {label}
                  </span>
                </span>
                <span className="num" style={{ fontSize: tall ? 19 : 15, fontWeight: 800, color, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                  {Math.round(now)}
                  <span style={{ fontSize: tall ? 12 : 11, color: 'var(--text-3)', fontWeight: 600 }}> / {target} g</span>
                </span>
              </span>
              <Bar value={pct(now, target)} color={color} height={tall ? 7 : 5} style={{ marginTop: 0 }} />
            </span>
          ))}
        </span>
      </button>
    )
  }

  if (form === 'big') {
    return (
      <button onClick={onOpen} className="widget__body widget__body--tap">
        <Title icon="chart" color="var(--carbs)">
          Macros
        </Title>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, flex: 1, minHeight: 0, paddingTop: 2 }}>
          {rows.map(([label, now, target, color]) => (
            <Ring key={label} value={pct(now, target)} color={color} caption={`${Math.round(now)} / ${target} g`} label={label} />
          ))}
        </div>
      </button>
    )
  }

  /* wide: three columns with a bar each, the Home macro card. */
  return (
    <button onClick={onOpen} className="widget__body widget__body--tap">
      <Title icon="chart" color="var(--carbs)">
        Macros
      </Title>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 8, flex: 1 }}>
        {rows.map(([label, now, target, color]) => (
          <div key={label} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              {dot(color)}
              <span className="widget__label" style={ellipsis}>
                {label}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, minWidth: 0 }}>
              <span className="num" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color }}>
                {Math.round(now)}
              </span>
              <span className="num" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
                / {target} g
              </span>
            </div>
            <span className="widget__sub" style={{ fontSize: 12 }}>
              {now > target
                ? `${Math.round(now - target)} g ${t('w.over')}`
                : `${Math.round(target - now)} g ${t('w.left')}`}
            </span>
            <Bar value={pct(now, target)} color={color} height={6} />
          </div>
        ))}
      </div>
    </button>
  )
}

/* -------------------------------------------------------------- fasting -- */

function FastingWidget({ w, h, editing }: WidgetProps) {
  const { data } = useApp()
  const t = useT()
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
    <Stat
      form={formOf(w, h)}
      onOpen={() => open({ name: 'fasting' })}
      s={{
        icon: 'clock',
        color: 'var(--sleep)',
        tone: progress >= 1 ? 'var(--positive)' : 'var(--sleep)',
        title: t('widget.fasting'),
        value: fast ? formatDuration(fastElapsedMs(fast, now)) : '0:00',
        unit: fast ? `/ ${fast.targetHours}h` : undefined,
        sub: fast
          ? t('w.ofTargetHours', { h: fast.targetHours })
          : t('w.notFastingPlan', { h: targetHoursFor(data.fasting) }),
        short: fast ? t('w.targetHours', { h: fast.targetHours }) : t('w.notFasting'),
        ratio: progress,
        caption: t('w.ofTarget'),
      }}
    />
  )
}

/* ---------------------------------------------------------------- water -- */

function WaterWidget({ date, w, h, editing }: WidgetProps) {
  const { dayLog, waterTarget, settings } = useApp()
  const t = useT()
  const open = useOpen(editing)
  const log = dayLog(date)
  const fmt = (ml: number) => {
    const v = mlToDisplay(ml, settings.waterUnit)
    return settings.waterUnit === 'ml' ? Math.round(v) : Math.round(v * 10) / 10
  }
  const ratio = waterTarget > 0 ? log.water / waterTarget : 0

  return (
    <Stat
      form={formOf(w, h)}
      onOpen={() => open({ name: 'water', date })}
      s={{
        icon: 'water',
        color: 'var(--water)',
        title: t('widget.water'),
        value: String(fmt(log.water)),
        unit: `/ ${fmt(waterTarget)} ${waterUnitLabel(settings.waterUnit)}`,
        sub:
          log.water >= waterTarget
            ? t('w.goalReached')
            : t('w.toGo', { amount: fmt(Math.max(0, waterTarget - log.water)) }),
        ratio,
        caption: t('w.ofGoal'),
      }}
    />
  )
}

/* ---------------------------------------------------------------- sleep -- */

function SleepWidget({ date, w, h, editing }: WidgetProps) {
  const { dayLog, profile } = useApp()
  const t = useT()
  const open = useOpen(editing)
  const log = dayLog(date)
  const goal = profile.sleepGoalMin
  const ratio = (log.sleepMin ?? 0) / Math.max(1, goal)

  return (
    <Stat
      form={formOf(w, h)}
      onOpen={() => open({ name: 'sleep', date })}
      s={{
        icon: 'moon',
        color: 'var(--sleep)',
        title: t('widget.sleep'),
        value: log.sleepMin == null ? '–' : formatSleep(log.sleepMin),
        unit: `/ ${formatSleep(goal)}`,
        sub:
          log.sleepMin == null
            ? t('common.notLogged')
            : log.sleepMin >= goal
              ? t('w.targetMet')
              : t('w.short', { amount: formatSleep(goal - log.sleepMin) }),
        ratio,
        caption: t('w.ofTarget'),
      }}
    />
  )
}

/* ---------------------------------------------------------------- steps -- */

function StepsWidget({ date, w, h, editing }: WidgetProps) {
  const { dayLog, profile } = useApp()
  const t = useT()
  const open = useOpen(editing)
  const log = dayLog(date)
  const goal = profile.stepGoal
  const ratio = (log.steps ?? 0) / Math.max(1, goal)

  return (
    <Stat
      form={formOf(w, h)}
      onOpen={() => open({ name: 'steps', date })}
      s={{
        icon: 'steps',
        color: 'var(--steps)',
        title: t('widget.steps'),
        value: log.steps == null ? '–' : cal(log.steps),
        unit: `/ ${cal(goal)}`,
        sub:
          log.steps == null
            ? t('common.notLogged')
            : log.steps >= goal
              ? t('w.goalReached')
              : t('w.toGo', { amount: cal(goal - log.steps) }),
        ratio,
        caption:
          log.steps == null
            ? t('w.ofGoal')
            : t('w.stepKcal', {
                kcal: cal(stepCalories(log.steps, profile.heightIn, profile.currentWeight)),
              }),
      }}
    />
  )
}

/* --------------------------------------------------------------- weight -- */

/**
 * A small trend line: the last fortnight of weigh-ins, nothing labelled.
 * With fewer than two points it draws a faint dashed baseline, so the space
 * reads as "a chart will go here" rather than as a hole.
 */
function Sparkline({
  values,
  color,
  height,
  style,
}: {
  values: number[]
  color: string
  height: number
  style?: CSSProperties
}) {
  const base: CSSProperties = { width: '100%', height, display: 'block', overflow: 'visible', ...style }
  if (values.length < 2) {
    return (
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true" style={base}>
        <path d="M0,16 L100,16" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" opacity={0.6} />
      </svg>
    )
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(max - min, 0.5)
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * 100
    const y = 4 + (1 - (v - min) / span) * 24
    return [x, y] as const
  })
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${d} L100,32 L0,32 Z`
  const last = pts[pts.length - 1]
  /* The chart is stretched to fill its box, so a circle drawn inside it
     would stretch with it. The end dot is laid over the top instead. */
  return (
    <span style={{ position: 'relative', display: 'block', width: '100%', height, ...style }}>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}>
        <path d={area} fill={color} opacity={0.12} />
        <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        style={{
          position: 'absolute',
          left: `calc(${last[0]}% - 4px)`,
          top: `calc(${(last[1] / 32) * 100}% - 4px)`,
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          boxShadow: '0 0 0 2px var(--surface)',
        }}
      />
    </span>
  )
}

/**
 * Latest weight, the change over a week, and the trend. The figure every
 * weight-loss tracker studied puts on its first screen, and the one this app
 * kept two taps away.
 */
function WeightWidget({ date, w, h, editing }: WidgetProps) {
  const { data, settings } = useApp()
  const t = useT()
  const open = useOpen(editing)
  const unit = settings.weightUnit
  const disp = (lb: number) => Math.round(lbToDisplay(lb, unit) * 10) / 10
  const form = formOf(w, h)

  const sorted = data.weights
    .filter((x) => x.date <= date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const latest = sorted[sorted.length - 1]
  const weekAgo = addDays(date, -7)
  const ref = [...sorted].reverse().find((x) => x.date <= weekAgo)
  const delta = latest && ref ? latest.weight - ref.weight : null
  const trend = sorted.slice(-14).map((x) => x.weight)
  const color = delta != null && delta < 0 ? 'var(--positive)' : 'var(--accent)'

  const sub = !latest
    ? t('w.tapWeighIn')
    : delta == null
      ? t('w.loggedOn', { date: shortDate(latest.date) })
      : Math.abs(disp(delta)) < 0.05
        ? t('w.noChangeWeek')
        : t(delta < 0 ? 'w.downWeek' : 'w.upWeek', { amount: Math.abs(disp(delta)), unit })
  const short = !latest
    ? t('common.notLogged')
    : delta == null || Math.abs(disp(delta)) < 0.05
      ? t('w.noChange')
      : `${delta < 0 ? '↓' : '↑'} ${Math.abs(disp(delta))} ${unit}`
  const value = latest ? String(disp(latest.weight)) : '–'
  const onOpen = () => open({ name: 'weightEntry' })

  if (form === 'tiny') {
    return (
      <button className="widget__body widget__body--tap widget__body--tiny" onClick={onOpen}>
        <Disc icon="scale" color="var(--accent)" size={24} />
        <Figure value={value} size={fit(value, 19)} />
      </button>
    )
  }

  if (form === 'halfstrip') {
    return (
      <button className="widget__body widget__body--tap widget__body--row" onClick={onOpen}>
        <Disc icon="scale" color="var(--accent)" size={34} />
        <span className="widget__col">
          <span className="widget__label">{t('widget.weight')}</span>
          <Figure value={value} unit={latest ? unit : undefined} size={21} />
          {/* Under the figure rather than beside it: "178.4 lb" and "↓ 2.4 lb"
              do not both fit on one line of a half-width strip. */}
          <span className="widget__sub" style={{ ...ellipsis, fontSize: 11.5, color, fontWeight: 600 }}>
            {short}
          </span>
        </span>
      </button>
    )
  }

  if (form === 'strip') {
    return (
      <button className="widget__body widget__body--tap widget__body--row" onClick={onOpen}>
        <Disc icon="scale" color="var(--accent)" size={36} />
        <span className="widget__col" style={{ flex: 'none' }}>
          <span className="widget__label">{t('widget.weight')}</span>
          <Figure value={value} unit={latest ? unit : undefined} size={22} />
        </span>
        <Sparkline values={trend} color={color} height={40} style={{ flex: 1, minWidth: 40, width: 'auto' }} />
        <span className="widget__sub" style={{ ...ellipsis, flex: 'none', maxWidth: '36%' }}>
          {sub}
        </span>
      </button>
    )
  }

  if (form === 'column') {
    return (
      <button className="widget__body widget__body--tap widget__body--column" onClick={onOpen}>
        <Disc icon="scale" color="var(--accent)" size={26} />
        <span className="widget__label" style={{ marginTop: 8 }}>
          {t('widget.weight')}
        </span>
        <Figure value={value} size={fit(value, 22)} />
        <span className="widget__sub" style={{ fontSize: 11, color, fontWeight: 600, ...ellipsis }}>
          {short}
        </span>
        {/* The trend takes whatever height is left, so a one-column weight
            widget is a chart with a figure over it rather than a figure with
            a hole under it. */}
        <span style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', paddingTop: 8 }}>
          <Sparkline values={trend} color={color} height={999} style={{ height: '100%' }} />
        </span>
      </button>
    )
  }

  if (form === 'card' || form === 'tall') {
    return (
      <button className="widget__body widget__body--tap" onClick={onOpen}>
        <Title icon="scale" color="var(--accent)">
          {t('widget.weight')}
        </Title>
        <Figure value={value} unit={latest ? unit : undefined} size={32} style={{ marginTop: 6 }} />
        <span className="widget__sub">{sub}</span>
        <Sparkline values={trend} color={color} height={form === 'tall' ? 110 : 44} style={{ marginTop: 'auto' }} />
      </button>
    )
  }

  /* wide and big: figures left, the trend as a proper chart on the right. */
  const large = form === 'big'
  return (
    <button
      className="widget__body widget__body--tap"
      style={{ flexDirection: 'row', alignItems: 'stretch', gap: 18 }}
      onClick={onOpen}
    >
      <span className="widget__col" style={{ flex: 'none', minWidth: '40%', gap: 3 }}>
        <Title icon="scale" color="var(--accent)">
          {t('widget.weight')}
        </Title>
        <Figure value={value} unit={latest ? unit : undefined} size={large ? 44 : 36} style={{ marginTop: large ? 14 : 8 }} />
        <span className="widget__sub" style={{ fontSize: 13, marginTop: 2 }}>
          {sub}
        </span>
        <span style={{ marginTop: 'auto' }} />
        <span className="widget__sub" style={{ fontSize: 12, color: 'var(--text-3)' }}>
          {trend.length >= 2 ? t('w.lastWeighIns', { n: trend.length }) : t('w.trendAfterTwo')}
        </span>
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', paddingTop: 10 }}>
        <Sparkline values={trend} color={color} height={large ? 170 : 92} />
      </span>
    </button>
  )
}

/* -------------------------------------------------------------- exercise -- */

function ExerciseWidget({ date, w, h, editing }: WidgetProps) {
  const { data, totalsFor } = useApp()
  const t = useT()
  const open = useOpen(editing)
  const totals = totalsFor(date)
  const workouts = data.exerciseEntries.filter((e) => e.date === date)
  const form = formOf(w, h)
  const minutes = totals.exerciseMinutes
  const burned = totals.exerciseCalories
  const names = workouts.map((e) => e.name).join(', ')
  const onOpen = () => open({ name: 'exerciseSearch', date, kind: 'cardio' })
  const color = 'var(--steps)'

  if (form === 'tiny') {
    return (
      <button className="widget__body widget__body--tap widget__body--tiny" onClick={onOpen}>
        <Disc icon="dumbbell" color={color} size={24} />
        <Figure value={workouts.length ? minutes : '–'} unit={workouts.length ? 'm' : undefined} size={19} />
      </button>
    )
  }

  if (form === 'halfstrip') {
    return (
      <button className="widget__body widget__body--tap widget__body--row" onClick={onOpen}>
        <Disc icon="dumbbell" color={color} size={34} />
        <span className="widget__col">
          <span className="widget__label">{t('widget.exercise')}</span>
          {workouts.length ? (
            <Figure value={minutes} unit={t('w.min')} size={21} />
          ) : (
            <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-2)', ...ellipsis }}>
              {t('common.nothingLogged')}
            </span>
          )}
        </span>
      </button>
    )
  }

  if (form === 'strip') {
    return (
      <button className="widget__body widget__body--tap widget__body--row" onClick={onOpen}>
        <Disc icon="dumbbell" color={color} size={36} />
        <span className="widget__col" style={{ flex: 'none' }}>
          <span className="widget__label">{t('widget.exercise')}</span>
          {workouts.length ? (
            <Figure value={minutes} unit={t('w.min')} size={22} />
          ) : (
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)' }}>{t('common.nothingLogged')}</span>
          )}
        </span>
        <span className="widget__sub" style={{ ...ellipsis, flex: 1, textAlign: 'right' }}>
          {workouts.length ? `${names} · ${cal(burned)} ${t('common.cal')}` : t('w.tapWorkout')}
        </span>
      </button>
    )
  }

  if (form === 'column') {
    return (
      <button className="widget__body widget__body--tap widget__body--column" onClick={onOpen}>
        <Disc icon="dumbbell" color={color} size={26} />
        <span className="widget__label" style={{ marginTop: 8 }}>
          {t('widget.exercise')}
        </span>
        <Figure value={workouts.length ? minutes : '0'} unit={t('w.min')} size={22} />
        {/* The second figure sits at the bottom so the column reads as two
            stats, minutes and calories, rather than one with a gap. */}
        <span style={{ marginTop: 'auto' }} />
        <Figure value={cal(burned)} unit={t('common.cal')} size={18} color={workouts.length ? 'var(--text)' : 'var(--text-2)'} />
      </button>
    )
  }

  if (form === 'card') {
    return (
      <button className="widget__body widget__body--tap" onClick={onOpen}>
        <Title icon="dumbbell" color={color}>
          {t('widget.exercise')}
        </Title>
        <Figure value={workouts.length ? minutes : '0'} unit={t('w.min')} size={32} style={{ marginTop: 6 }} />
        <span className="widget__sub" style={ellipsis}>
          {workouts.length ? names : t('common.nothingLogged')}
        </span>
        <span style={{ marginTop: 'auto' }} />
        {/* The second figure fills the half of the card a dial would take in
            the other widgets: there is no goal for exercise to dial towards. */}
        <Figure value={cal(burned)} unit={t('w.calBurnedUnit')} size={20} color={workouts.length ? 'var(--text)' : 'var(--text-2)'} />
        {!workouts.length && (
          <span className="widget__sub" style={{ fontSize: 12 }}>
            {t('w.tapWorkout')}
          </span>
        )}
      </button>
    )
  }

  /* tall, wide and big: the figure, then the day's workouts listed. */
  const list = (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {workouts.length ? (
        workouts.slice(0, form === 'wide' ? 3 : 5).map((e) => (
          <span key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, minWidth: 0 }}>
            <span style={{ fontWeight: 600, ...ellipsis }}>{e.name}</span>
            <span className="num" style={{ color: 'var(--text-2)', flex: 'none' }}>
              {e.minutes != null
                ? `${e.minutes} ${t('w.min')}`
                : e.sets != null
                  ? `${e.sets} × ${e.reps ?? '–'}`
                  : `${cal(e.caloriesBurned ?? 0)} ${t('common.cal')}`}
            </span>
          </span>
        ))
      ) : (
        <span className="widget__sub" style={{ fontSize: 13 }}>
          {t('w.nothingLoggedTap')}
        </span>
      )}
      {workouts.length > (form === 'wide' ? 3 : 5) && (
        <span className="widget__sub" style={{ fontSize: 12 }}>
          {t('w.andMore', { n: workouts.length - (form === 'wide' ? 3 : 5) })}
        </span>
      )}
    </span>
  )

  if (form === 'tall') {
    return (
      <button className="widget__body widget__body--tap" onClick={onOpen}>
        <Title icon="dumbbell" color={color}>
          {t('widget.exercise')}
        </Title>
        <Figure value={workouts.length ? minutes : '0'} unit={t('w.min')} size={32} style={{ marginTop: 6 }} />
        <span className="widget__sub">
          {workouts.length ? t('w.calBurned', { cal: cal(burned) }) : t('w.noCalBurned')}
        </span>
        <span style={{ marginTop: 12 }} />
        {list}
      </button>
    )
  }

  const large = form === 'big'
  return (
    <button
      className="widget__body widget__body--tap"
      style={{ flexDirection: 'row', alignItems: 'stretch', gap: 18 }}
      onClick={onOpen}
    >
      <span className="widget__col" style={{ flex: 'none', minWidth: '40%', gap: 3 }}>
        <Title icon="dumbbell" color={color}>
          {t('widget.exercise')}
        </Title>
        <Figure value={workouts.length ? minutes : '0'} unit={t('w.min')} size={large ? 44 : 36} style={{ marginTop: large ? 14 : 8 }} />
        <span className="widget__sub" style={{ fontSize: 13, marginTop: 2 }}>
          {workouts.length ? t('w.calBurned', { cal: cal(burned) }) : t('w.noCalBurned')}
        </span>
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 4 }}>
        {list}
      </span>
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
