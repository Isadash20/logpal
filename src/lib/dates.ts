/** All dates in storage are local-time `YYYY-MM-DD` strings, never Date objects. */

export function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromKey(key: string): Date {
  return new Date(key + 'T00:00:00')
}

export function today(): string {
  return toKey(new Date())
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

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "Today" / "Yesterday" / "Tuesday, August 2" — the diary date header. */
export function friendlyDate(key: string): string {
  const t = today()
  if (key === t) return 'Today'
  if (key === addDays(t, -1)) return 'Yesterday'
  if (key === addDays(t, 1)) return 'Tomorrow'
  const d = fromKey(key)
  const withinWeek = Math.abs(diffDays(key, t)) < 7
  if (withinWeek) return DAY_NAMES[d.getDay()]
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}${
    sameYear ? '' : `, ${d.getFullYear()}`
  }`
}

export function longDate(key: string): string {
  const d = fromKey(key)
  return `${DAY_NAMES[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function shortDate(key: string): string {
  const d = fromKey(key)
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
}

export function monthLabel(key: string): string {
  const d = fromKey(key)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

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
