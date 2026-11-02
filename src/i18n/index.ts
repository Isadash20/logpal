/**
 * Language and region.
 *
 * A small translation layer rather than a library: a dictionary per language
 * (`strings.ts`), a `t()` that looks a key up in the current one and falls
 * back to English, and a hook that re-renders a component when the language
 * changes. The current language and time zone are module state, set from the
 * saved settings by the store (`applyRegion`), so plain functions such as the
 * date formatters can read them without being handed a locale every call.
 *
 * Coverage is deliberate rather than total. The surfaces a person sees every
 * day are translated: the tab bar, Home and its widgets, the add sheet, the
 * sign-in screen and the Settings pages. Deeper screens still read in English
 * until their strings are moved across; `t()` returns the key's English text
 * for any key a language has not translated, so a gap is never a blank.
 *
 * The time zone decides which calendar day "today" is and how clock times are
 * shown. It defaults to the device's, which is right for nearly everyone; the
 * setting exists for people who log for a place they are not in.
 */
import { useSyncExternalStore } from 'react'
import { STRINGS, type Locale, type StringKey } from './strings'

export type { Locale, StringKey } from './strings'

export const LOCALES: { code: Locale; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
]

export type LanguageSetting = 'auto' | Locale
export type TimeZoneSetting = 'auto' | string

let locale: Locale = 'en'
let zone: string | undefined
let version = 0
const listeners = new Set<() => void>()

/** The device language, narrowed to one we have. */
export function deviceLocale(): Locale {
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of tags) {
    const short = (tag || '').toLowerCase().slice(0, 2) as Locale
    if (STRINGS[short]) return short
  }
  return 'en'
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function resolveLocale(setting: LanguageSetting | undefined): Locale {
  return !setting || setting === 'auto' ? deviceLocale() : setting
}

export function resolveTimeZone(setting: TimeZoneSetting | undefined): string {
  return !setting || setting === 'auto' ? deviceTimeZone() : setting
}

/** Called by the store whenever settings load or change. Cheap when nothing moved. */
export function applyRegion(settings: { language?: LanguageSetting; timeZone?: TimeZoneSetting }): void {
  const nextLocale = resolveLocale(settings.language)
  const nextZone = resolveTimeZone(settings.timeZone)
  if (nextLocale === locale && nextZone === zone) return
  locale = nextLocale
  zone = nextZone
  version++
  document.documentElement.lang = locale
  for (const l of listeners) l()
}

export function currentLocale(): Locale {
  return locale
}

/** The IANA zone in force, or undefined before settings have loaded. */
export function currentTimeZone(): string | undefined {
  return zone
}

/** A BCP 47 tag for `Intl`, so numbers and dates follow the language. */
export function intlLocale(): string {
  return locale === 'zh' ? 'zh-CN' : locale === 'en' ? 'en-US' : locale
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/**
 * Looks a key up in the current language, then English, then the fallback
 * text. The fallback is for keys built at runtime (`widget.${id}`), where the
 * English label already exists elsewhere.
 */
export function t(key: StringKey | string, vars?: Record<string, string | number>, fallback?: string): string {
  const table = STRINGS[locale] as Record<string, string>
  const text = table[key] ?? (STRINGS.en as Record<string, string>)[key] ?? fallback ?? key
  return interpolate(text, vars)
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const snapshot = () => version

/** `t`, bound to re-render the caller when the language changes. */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, snapshot, snapshot)
  return t
}

/* ----------------------------------------------------------- time zones -- */

/** Every zone the runtime knows, with its current offset, sorted west to east. */
export function timeZoneOptions(): { value: string; label: string }[] {
  let names: string[] = []
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    names = intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : []
  } catch {
    names = []
  }
  if (names.length === 0) names = FALLBACK_ZONES
  const now = new Date()
  const rows = names.map((name) => {
    const offset = offsetMinutes(name, now)
    return { value: name, offset, label: `(${formatOffset(offset)}) ${name.replace(/_/g, ' ')}` }
  })
  rows.sort((a, b) => a.offset - b.offset || a.value.localeCompare(b.value))
  return rows.map(({ value, label }) => ({ value, label }))
}

export function offsetMinutes(zoneName: string, at = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zoneName,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at)
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
    /* `at` carries seconds the formatted parts do not, hence the rounding. */
    return Math.round((asUtc - at.getTime()) / 60_000)
  } catch {
    return 0
  }
}

export function formatOffset(minutes: number): string {
  const m = Math.round(minutes / 15) * 15
  const sign = m < 0 ? '-' : '+'
  const abs = Math.abs(m)
  const h = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `GMT${sign}${h}:${mm}`
}

const FALLBACK_ZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/Mexico_City',
  'America/New_York',
  'America/Toronto',
  'America/Bogota',
  'America/Lima',
  'America/Caracas',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Atlantic/Azores',
  'Europe/London',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
]
