/** Display formatting. Nutrition figures round the way a food label does. */

export function round(n: number, places = 0): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/** Whole numbers for calories. No decimals anywhere in the UI. */
export function cal(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/**
 * Grams: one decimal below 10, whole numbers above, matching label style.
 * Compares magnitude so negatives (a "left to goal" that has gone past zero)
 * format the same way positives do.
 */
export function grams(n: number): string {
  if (n === 0) return '0'
  if (Math.abs(n) < 10) return String(round(n, 1))
  return String(Math.round(n))
}

export function mg(n: number): string {
  return String(Math.round(n))
}

export function pct(n: number): string {
  return `${Math.round(n)}%`
}

export function weight(n: number, places = 1): string {
  return round(n, places).toLocaleString('en-US', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  })
}

/** 1.5 → "1.5", 2 → "2", for serving counts. */
export function servingCount(n: number): string {
  return String(round(n, 2))
}

export function signed(n: number, places = 1): string {
  const v = round(n, places)
  return `${v > 0 ? '+' : ''}${v}`
}

/** Sentence-cases a database name without destroying acronyms. */
export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) =>
    t.length > 3 && t === t.toUpperCase() ? t : t[0].toUpperCase() + t.slice(1)
  )
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s
}

/** "7:42 am". The trailing timestamp on a logged entry. */
export function timeOfDay(ts: number): string {
  return new Date(ts)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
}

/** "Chobani, 1 container (150 g)". The subtitle under a diary food row. */
export function entrySubtitle(opts: {
  brand?: string
  servings: number
  servingLabel: string
}): string {
  const portion =
    opts.servings === 1
      ? opts.servingLabel
      : `${servingCount(opts.servings)} × ${opts.servingLabel}`
  return opts.brand ? `${opts.brand}, ${portion}` : portion
}
