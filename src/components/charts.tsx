import { useId, useMemo, useState } from 'react'
import { cal, pct } from '../lib/format'

/* ------------------------------------------------------------ tri-rings -- */

export interface RingSpec {
  label: string
  value: number
  goal: number
  color: string
  /** Short readout under the label, e.g. "1.8 / 2.9 L". */
  readout?: string
}

/**
 * Concentric progress rings — calories, water and protein at a glance.
 *
 * Rings overrun rather than clamp: past 100% the arc keeps going round in a
 * lighter tone, so "over" is legible instead of just looking finished.
 */
export function TriRing({
  rings,
  size = 168,
  stroke = 13,
  gap = 5,
  center,
}: {
  rings: RingSpec[]
  size?: number
  stroke?: number
  gap?: number
  center?: React.ReactNode
}) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {rings.map((r, i) => {
          const radius = (size - stroke) / 2 - i * (stroke + gap)
          if (radius <= 0) return null
          const c = 2 * Math.PI * radius
          const ratio = r.goal > 0 ? r.value / r.goal : 0
          const first = Math.min(1, ratio) * c
          const over = Math.min(1, Math.max(0, ratio - 1)) * c
          return (
            <g key={r.label}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={r.color}
                strokeWidth={stroke}
                opacity={0.16}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={r.color}
                strokeWidth={stroke}
                strokeDasharray={`${first} ${c - first}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray .4s cubic-bezier(.4,0,.2,1)' }}
              />
              {over > 0 && (
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="var(--danger)"
                  strokeWidth={stroke}
                  strokeDasharray={`${over} ${c - over}`}
                  strokeLinecap="round"
                />
              )}
            </g>
          )
        })}
      </svg>
      {center && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeContent: 'center',
            textAlign: 'center',
          }}
        >
          {center}
        </div>
      )}
    </div>
  )
}

/**
 * Label above value, not beside it. Side-by-side runs out of room the moment a
 * readout gets long ("6.8 / 14.4 cups") and clips against the card edge.
 */
export function RingLegend({ rings }: { rings: RingSpec[] }) {
  return (
    <div style={{ display: 'grid', gap: 13, flex: 1, minWidth: 0 }}>
      {rings.map((r) => (
        <div key={r.label} style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: r.color,
                flex: 'none',
              }}
            />
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
              {r.label}
            </span>
          </div>
          <div
            className="num"
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginTop: 1,
              paddingLeft: 15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {r.readout ?? `${Math.round(r.value)} / ${Math.round(r.goal)}`}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------- ring -- */

export function CalorieRing({
  consumed,
  goal,
  size = 152,
  stroke = 13,
}: {
  consumed: number
  goal: number
  size?: number
  stroke?: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ratio = goal > 0 ? consumed / goal : 0
  const over = ratio > 1
  const dash = Math.min(1, Math.max(0, ratio)) * c
  const remaining = Math.round(goal - consumed)

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--danger)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray .4s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeContent: 'center',
          textAlign: 'center',
        }}
      >
        <div
          className="num"
          style={{
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: '-0.035em',
            lineHeight: 1.05,
            color: over ? 'var(--danger)' : 'var(--text)',
          }}
        >
          {cal(Math.abs(remaining))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 600, marginTop: 2 }}>
          {over ? 'over' : 'remaining'}
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- donut -- */

export interface Slice {
  label: string
  value: number
  color: string
}

export function Donut({
  slices,
  size = 150,
  thickness = 26,
  center,
}: {
  slices: Slice[]
  size?: number
  thickness?: number
  center?: React.ReactNode
}) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r

  let offset = 0
  const arcs = slices.map((s) => {
    const frac = total > 0 ? s.value / total : 0
    const arc = { ...s, dash: frac * c, offset }
    offset += frac * c
    return arc
  })

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          arcs.map((a, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${c - a.dash}`}
              strokeDashoffset={-a.offset}
            />
          ))}
      </svg>
      {center && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeContent: 'center',
            textAlign: 'center',
          }}
        >
          {center}
        </div>
      )}
    </div>
  )
}

export function Legend({ slices, unit = '' }: { slices: Slice[]; unit?: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  return (
    <div style={{ display: 'grid', gap: 10, flex: 1, minWidth: 0 }}>
      {slices.map((s) => (
        <div key={s.label} className="stack-h" style={{ gap: 6 }}>
          <span className="dot" style={{ background: s.color }} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              color: 'var(--text-2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {s.label}
          </span>
          <span
            className="num"
            style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', flex: 'none' }}
          >
            {Math.round(s.value)}
            {unit}
          </span>
          <span
            className="num"
            style={{
              fontSize: 12,
              color: 'var(--text-3)',
              width: 32,
              textAlign: 'right',
              whiteSpace: 'nowrap',
              flex: 'none',
            }}
          >
            {total > 0 ? pct((s.value / total) * 100) : '0%'}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ line chart -- */

export interface Point {
  x: string
  y: number | null
}

/** Catmull-Rom through the points, converted to cubic bezier segments. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : ''
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    // Tension 1/6 keeps the curve tight enough not to invent peaks.
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`
  }
  return d
}

/**
 * Weight / measurement trend. Tap or drag to scrub — the callout reads the
 * exact value, which is the thing a chart this small otherwise can't tell you.
 */
export function LineChart({
  points,
  height = 210,
  goal,
  unit = '',
  format = (v: number) => String(Math.round(v * 10) / 10),
}: {
  points: Point[]
  height?: number
  goal?: number
  unit?: string
  format?: (v: number) => string
}) {
  const gid = useId().replace(/:/g, '')
  const [active, setActive] = useState<number | null>(null)

  const W = 320
  const padL = 34
  const padR = 12
  const padT = 16
  const padB = 26

  const real = useMemo(
    () =>
      points
        .map((p, i) => ({ ...p, i }))
        .filter((p) => p.y !== null) as { x: string; y: number; i: number }[],
    [points]
  )

  if (real.length === 0) {
    return <div className="empty" style={{ padding: '40px 20px' }}>No data yet</div>
  }

  const values = real.map((p) => p.y)
  if (goal !== undefined) values.push(goal)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (max - min < 1) {
    const mid = (max + min) / 2
    min = mid - 1
    max = mid + 1
  }
  const span = max - min
  min -= span * 0.15
  max += span * 0.15

  const n = Math.max(1, points.length - 1)
  const xAt = (i: number) => padL + (i / n) * (W - padL - padR)
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (height - padT - padB)

  const coords = real.map((p) => ({ x: xAt(p.i), y: yAt(p.y) }))
  const line = smoothPath(coords)
  const area =
    `${line} L${coords[coords.length - 1].x},${height - padB} L${coords[0].x},${height - padB} Z`

  const ticks = [max, (max + min) / 2, min]
  const cur = active !== null ? real[active] : null

  function scrub(clientX: number, target: SVGSVGElement) {
    const box = target.getBoundingClientRect()
    const rel = ((clientX - box.left) / box.width) * W
    let best = 0
    let bestD = Infinity
    real.forEach((p, k) => {
      const d = Math.abs(xAt(p.i) - rel)
      if (d < bestD) {
        bestD = d
        best = k
      }
    })
    setActive(best)
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      role="img"
      style={{ touchAction: 'pan-y' }}
      onMouseMove={(e) => scrub(e.clientX, e.currentTarget)}
      onMouseLeave={() => setActive(null)}
      onTouchStart={(e) => scrub(e.touches[0].clientX, e.currentTarget)}
      onTouchMove={(e) => scrub(e.touches[0].clientX, e.currentTarget)}
      onTouchEnd={() => setActive(null)}
    >
      <defs>
        <linearGradient id={`fill${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.26" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={W - padR}
            y1={yAt(t)}
            y2={yAt(t)}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text x={padL - 6} y={yAt(t) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--text-3)">
            {format(t)}
          </text>
        </g>
      ))}

      {goal !== undefined && goal >= min && goal <= max && (
        <>
          <line
            x1={padL}
            x2={W - padR}
            y1={yAt(goal)}
            y2={yAt(goal)}
            stroke="var(--positive)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <text x={W - padR} y={yAt(goal) - 5} textAnchor="end" fontSize="9" fill="var(--positive)">
            goal
          </text>
        </>
      )}

      <path d={area} fill={`url(#fill${gid})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {real.length <= 40 &&
        coords.map((p, k) => (
          <circle
            key={k}
            cx={p.x}
            cy={p.y}
            r={2.6}
            fill="var(--surface)"
            stroke="var(--accent)"
            strokeWidth="1.8"
          />
        ))}

      {cur && (
        <g>
          <line
            x1={xAt(cur.i)}
            x2={xAt(cur.i)}
            y1={padT}
            y2={height - padB}
            stroke="var(--border-strong)"
            strokeWidth="1"
          />
          <circle cx={xAt(cur.i)} cy={yAt(cur.y)} r={5} fill="var(--accent)" />
          <circle cx={xAt(cur.i)} cy={yAt(cur.y)} r={2} fill="var(--surface)" />
          <rect
            x={Math.min(W - padR - 74, Math.max(padL, xAt(cur.i) - 37))}
            y={4}
            width={74}
            height={20}
            rx={5}
            fill="var(--ink)"
          />
          <text
            x={Math.min(W - padR - 37, Math.max(padL + 37, xAt(cur.i)))}
            y={18}
            textAnchor="middle"
            fontSize="10.5"
            fill="#fff"
          >
            {cur.x} · {format(cur.y)}
            {unit}
          </text>
        </g>
      )}

      <text x={padL} y={height - 8} fontSize="9.5" fill="var(--text-3)">
        {points[0]?.x}
      </text>
      <text x={W - padR} y={height - 8} fontSize="9.5" fill="var(--text-3)" textAnchor="end">
        {points[points.length - 1]?.x}
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------- bar chart -- */

/**
 * Daily totals against a goal. Bars past the goal switch colour and the goal
 * line is labelled, so the chart answers "did I stay under?" without a legend.
 */
export function BarChart({
  bars,
  goal,
  height = 180,
  unit = '',
}: {
  bars: { label: string; value: number }[]
  goal?: number
  height?: number
  unit?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const W = 320
  const padB = 22
  const padT = 14
  const max = Math.max(goal ?? 0, ...bars.map((b) => b.value), 1) * 1.15
  const step = W / Math.max(1, bars.length)
  const bw = Math.min(26, step * 0.6)

  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img">
      {goal !== undefined && (
        <>
          <line
            x1={0}
            x2={W}
            y1={padT + (1 - goal / max) * (height - padT - padB)}
            y2={padT + (1 - goal / max) * (height - padT - padB)}
            stroke="var(--text-3)"
            strokeWidth="1.2"
            strokeDasharray="5 4"
          />
          <text
            x={W - 2}
            y={padT + (1 - goal / max) * (height - padT - padB) - 4}
            textAnchor="end"
            fontSize="9"
            fill="var(--text-3)"
          >
            goal {Math.round(goal)}
          </text>
        </>
      )}
      {bars.map((b, i) => {
        const h = (b.value / max) * (height - padT - padB)
        const over = goal !== undefined && b.value > goal
        const x = i * step + (step - bw) / 2
        return (
          <g
            key={i}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onTouchStart={() => setActive(i)}
          >
            <rect x={i * step} y={0} width={step} height={height} fill="transparent" />
            <rect
              x={x}
              y={height - padB - h}
              width={bw}
              height={Math.max(0, h)}
              rx="4"
              fill={over ? 'var(--danger)' : 'var(--accent)'}
              opacity={b.value === 0 ? 0.16 : active === null || active === i ? 1 : 0.4}
            />
            {active === i && b.value > 0 && (
              <text
                x={i * step + step / 2}
                y={height - padB - h - 5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="var(--text)"
              >
                {Math.round(b.value)}
                {unit}
              </text>
            )}
            <text
              x={i * step + step / 2}
              y={height - 6}
              fontSize="9.5"
              fill="var(--text-3)"
              textAnchor="middle"
            >
              {b.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------ week strip -- */

/**
 * Seven dots, one per day, filled in proportion to goal completion. The
 * cheapest possible "am I being consistent?" answer.
 */
/**
 * Weekday letters over plain circles: filled with a tick once the day has been
 * logged, hollow otherwise, with a marker dot above the selected day.
 */
export function WeekStrip({
  days,
  onPick,
}: {
  days: { label: string; logged: boolean; date: string; today?: boolean }[]
  onPick?(date: string): void
}) {
  return (
    <div style={{ display: 'flex', padding: '2px 0 4px' }}>
      {days.map((d, i) => (
        <button
          key={d.date}
          onClick={() => onPick?.(d.date)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 7,
          }}
          aria-label={`${d.label}${d.logged ? ' — logged' : ''}`}
        >
          <span style={{ position: 'relative', lineHeight: 1 }}>
            {d.today && (
              <span
                style={{
                  position: 'absolute',
                  top: -6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 4,
                  height: 4,
                  borderRadius: 999,
                  background: 'var(--text-2)',
                }}
              />
            )}
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-2)',
              }}
            >
              {d.label}
            </span>
          </span>
          <span
            style={{
              width: 27,
              height: 27,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              background: d.logged ? 'var(--ink)' : 'transparent',
              border: d.logged ? 'none' : '1.5px solid var(--border-strong)',
              color: '#fff',
            }}
          >
            {d.logged && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          {i < 0 && null}
        </button>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------- stacked bar -- */

/** A single horizontal bar split by macro — used as a compact day summary. */
export function StackedBar({
  segments,
  height = 10,
}: {
  segments: { value: number; color: string; label: string }[]
  height?: number
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  return (
    <div
      style={{
        display: 'flex',
        height,
        borderRadius: 999,
        overflow: 'hidden',
        background: 'var(--surface-3)',
      }}
    >
      {total > 0 &&
        segments.map((s) => (
          <div
            key={s.label}
            title={s.label}
            style={{
              width: `${(s.value / total) * 100}%`,
              background: s.color,
              transition: 'width .3s ease',
            }}
          />
        ))}
    </div>
  )
}

/* ------------------------------------------------------------ fast dial -- */

/**
 * A dial showing progress through a fast.
 *
 * A linear bar can't express that a fast wraps past midnight and that the
 * eating window is the remainder of the same cycle. A dial can, and the filled
 * portion reads as "how far through" at a glance.
 */
export function FastDial({
  progress,
  size = 108,
  stroke = 10,
  complete,
  center,
}: {
  progress: number
  size?: number
  stroke?: number
  complete?: boolean
  center?: React.ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = Math.min(1, Math.max(0, progress)) * c

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={complete ? 'var(--positive)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray .6s linear' }}
        />
      </svg>
      {center && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeContent: 'center',
            textAlign: 'center',
          }}
        >
          {center}
        </div>
      )}
    </div>
  )
}

/** Recent fasts as bars against their targets — the consistency view. */
export function FastHistoryBars({
  fasts,
  height = 44,
}: {
  fasts: { hours: number; target: number }[]
  height?: number
}) {
  if (fasts.length === 0) return null
  const max = Math.max(...fasts.map((f) => Math.max(f.hours, f.target)), 1)

  return (
    // Capped width so a short history reads as bars rather than blocks.
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height }}>
      {fasts.map((f, i) => (
        <div
          key={i}
          title={`${f.hours.toFixed(1)}h of ${f.target}h`}
          style={{
            flex: '0 1 14px',
            maxWidth: 14,
            height: `${Math.max(12, (f.hours / max) * 100)}%`,
            background: f.hours >= f.target ? 'var(--accent)' : 'var(--border-strong)',
            borderRadius: 3,
          }}
        />
      ))}
    </div>
  )
}
