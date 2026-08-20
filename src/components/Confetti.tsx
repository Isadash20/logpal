import { useEffect, useState } from 'react'

/**
 * A burst of confetti, once, when every macro target has been met.
 *
 * Deliberately cheap: twenty absolutely positioned pieces on a CSS animation,
 * removed from the tree when it finishes. No canvas and no library for
 * something that runs for a second and a half a few times a week.
 *
 * It fires once per day. Hitting the last target, opening the app, and being
 * congratulated again for the same day would turn the moment into wallpaper.
 */
const COLORS = [
  'var(--accent)',
  'var(--carbs)',
  'var(--protein)',
  'var(--positive)',
  'var(--water)',
  'var(--gold)',
]

const KEY = 'logpal.celebrated'

export function celebratedToday(date: string): boolean {
  try {
    return localStorage.getItem(KEY) === date
  } catch {
    return true
  }
}

export function markCelebrated(date: string): void {
  try {
    localStorage.setItem(KEY, date)
  } catch {
    /* Not worth failing over. */
  }
}

export function Confetti({ onDone }: { onDone(): void }) {
  const [pieces] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      left: (i * 97) % 100,
      delay: (i % 6) * 60,
      color: COLORS[i % COLORS.length],
      drift: ((i * 37) % 60) - 30,
      spin: ((i * 53) % 360) + 180,
    })),
  )

  useEffect(() => {
    const t = window.setTimeout(onDone, 1900)
    return () => window.clearTimeout(t)
  }, [onDone])

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti__bit"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}ms`,
            ['--drift' as string]: `${p.drift}px`,
            ['--spin' as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  )
}
