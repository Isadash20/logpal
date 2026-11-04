import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Achievement } from '../lib/celebrations'

/**
 * The cheer for a goal met: confetti and a card. For the goal weight, an
 * explosion of confetti out from the card as well, and it waits to be tapped
 * away.
 *
 * Deliberately cheap: absolutely positioned pieces on a CSS animation,
 * removed from the tree when it finishes. No canvas and no library for
 * something that runs for a few seconds a few times a week.
 *
 * What to show is handed in through a tiny bus rather than props, so Home
 * can raise one and the About screen can preview one, and the overlay sits
 * at the top of the app above whatever screen is open.
 */
const COLORS = ['var(--accent)', 'var(--carbs)', 'var(--protein)', 'var(--positive)', 'var(--water)', 'var(--gold)']
const GOLD = ['#f5b301', '#ffd54a', '#ff8a3d', '#ff5c5c', '#ffffff', '#ffe9a3']

let current: Achievement[] | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function celebrate(items: Achievement[]): void {
  if (!items.length) return
  current = items
  emit()
}

function dismiss() {
  current = null
  emit()
}

export function CelebrationHost() {
  const items = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    () => current,
    () => current,
  )
  if (!items) return null
  return <Celebration key={items.map((i) => i.id).join('|')} items={items} onDone={dismiss} />
}

function Celebration({ items, onDone }: { items: Achievement[]; onDone(): void }) {
  const big = items.some((i) => i.big)
  const count = big ? 140 : 60
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      left: (i * 97) % 100,
      delay: (i % 10) * 90,
      color: big ? GOLD[i % GOLD.length] : COLORS[i % COLORS.length],
      drift: ((i * 37) % 80) - 40,
      spin: ((i * 53) % 360) + 180,
      scale: 0.7 + ((i * 7) % 6) / 10,
      dur: 1.8 + ((i * 11) % 8) / 10,
    })),
  )

  /* The explosion: pieces that start at the card and fly outward in every
     direction, in two waves so it keeps going for a moment. Angles and
     distances come from the index, so it is the same burst every time and
     needs no random source. */
  const [burst] = useState(() =>
    big
      ? Array.from({ length: 110 }, (_, i) => {
          const angle = ((i * 137.5) % 360) * (Math.PI / 180)
          const dist = 160 + ((i * 53) % 260)
          return {
            dx: Math.round(Math.cos(angle) * dist),
            dy: Math.round(Math.sin(angle) * dist),
            color: GOLD[i % GOLD.length],
            w: 6 + ((i * 7) % 8),
            h: 10 + ((i * 11) % 10),
            round: i % 4 === 0,
            spin: ((i * 71) % 720) - 360,
            delay: i < 70 ? (i * 13) % 120 : 350 + ((i * 17) % 160),
            dur: 1.1 + ((i * 7) % 6) / 10,
          }
        })
      : [],
  )

  useEffect(() => {
    if (big) return
    const t = window.setTimeout(onDone, 3400)
    return () => window.clearTimeout(t)
  }, [big, onDone])

  const lead = items.find((i) => i.big) ?? items[0]
  const title = items.length > 1 && !big ? 'Goals reached' : lead.title
  const detail = items.length > 1 && !big ? items.map((i) => i.title).join(' · ') : lead.detail

  return (
    <div
      className={`celebrate ${big ? 'celebrate--big' : ''}`}
      role="status"
      onClick={onDone}
    >
      <div className="confetti" aria-hidden="true">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti__bit"
            style={{
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.dur}s`,
              transform: `scale(${p.scale})`,
              ['--drift' as string]: `${p.drift}px`,
              ['--spin' as string]: `${p.spin}deg`,
            }}
          />
        ))}
      </div>
      {big && (
        <div className="burst" aria-hidden="true">
          {burst.map((b, i) => (
            <span
              key={i}
              className="burst__bit"
              style={{
                background: b.color,
                width: b.w,
                height: b.h,
                borderRadius: b.round ? 999 : 2,
                animationDelay: `${b.delay}ms`,
                animationDuration: `${b.dur}s`,
                ['--dx' as string]: `${b.dx}px`,
                ['--dy' as string]: `${b.dy}px`,
                ['--spin' as string]: `${b.spin}deg`,
              }}
            />
          ))}
        </div>
      )}
      <div className="celebrate__card">
        <div className="celebrate__emoji" aria-hidden="true">
          {big ? '🏆' : '🎉'}
        </div>
        <div className="celebrate__title">{title}</div>
        <div className="celebrate__detail">{detail}</div>
        {big && <div className="celebrate__tap">Tap to continue</div>}
      </div>
    </div>
  )
}
