/** All dates in storage are local-time `YYYY-MM-DD` strings, never Date objects. */
import { currentTimeZone, intlLocale, t } from '../i18n'

export function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromKey(key: string): Date {
  return new Date(key + 'T00:00:00')
}

/**
 * Today's key in the chosen time zone. Falls back to the device clock when no
 * zone has been applied yet, or when the runtime does not know the zone.
 */
export function today(): string {
  const zone = currentTimeZone()
  if (!zone) return toKey(new Date())
  try {
    /* en-CA gives ISO order, so no part reassembly is needed. */
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : toKey(new Date())
  } catch {
    return toKey(new Date())
  }
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

export function diffDays(a: string, b: string): number {
  const ms = fromKey(a).getTime() - fromKey(b).getTime()
  return Math.round(ms / 86_400_000)
}

/* Names come from `Intl` in the current language. A key is turned into a
   local Date by `fromKey`, so no zone is passed here: the key already is the
   day, and the zone only matters for deciding which key is today. */
function fmt(d: Date, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(intlLocale(), opts).format(d)
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(d)
  }
}

/** "Today" / "Yesterday" / "Tuesday, August 2". The diary date header. */
export function friendlyDate(key: string): string {
  const now = today()
  if (key === now) return t('common.today')
  if (key === addDays(now, -1)) return t('common.yesterday')
  if (key === addDays(now, 1)) return t('common.tomorrow')
  const d = fromKey(key)
  const withinWeek = Math.abs(diffDays(key, now)) < 7
  if (withinWeek) return fmt(d, { weekday: 'long' })
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return fmt(
    d,
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' },
  )
}

/** "Tuesday, August 2". Home splits this on the first comma, so the weekday leads. */
export function longDate(key: string): string {
  const d = fromKey(key)
  return `${fmt(d, { weekday: 'long' })}, ${fmt(d, { month: 'long', day: 'numeric' })}`
}

export function shortDate(key: string): string {
  return fmt(fromKey(key), { month: 'short', day: 'numeric' })
}

export function monthLabel(key: string): string {
  return fmt(fromKey(key), { month: 'long', year: 'numeric' })
}

/** One letter per weekday in the current language, Sunday first or Monday first. */
export function weekdayInitials(start: 'sunday' | 'monday' = 'sunday'): string[] {
  const out: string[] = []
  /* 2023-01-01 was a Sunday. */
  for (let i = 0; i < 7; i++) {
    const d = new Date(2023, 0, 1 + i + (start === 'monday' ? 1 : 0))
    out.push(fmt(d, { weekday: 'narrow' }))
  }
  return out
}

/** 6×7 grid of date keys covering the month `key` falls in. */
export function monthGrid(key: string): string[] {
  const d = fromKey(key)
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  const out: string[] = []
  for (let i = 0; i < 42; i++) {
    const cur = new Date(start)
    cur.setDate(start.getDate() + i)
    out.push(toKey(cur))
  }
  return out
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(key)
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  return toKey(d)
}

/** Inclusive list of date keys from `from` to `to`. */
export function rangeKeys(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  let guard = 0
  while (cur <= to && guard++ < 4000) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/** Date key `n` days back from today, inclusive of today. */
export function lastNDays(n: number): string[] {
  const t = today()
  return rangeKeys(addDays(t, -(n - 1)), t)
}
