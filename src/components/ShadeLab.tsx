import { useEffect, useState } from 'react'

/**
 * A palette bench, reachable only at `?shades=1`.
 *
 * Choosing an accent from screenshots does not work: the colour has to be seen
 * on the real board, on the device it will be used on, with the real numbers
 * in front of it. This overrides the tokens live so a shade can be tried for a
 * minute rather than judged for a second, and it ships behind a query string
 * so nobody meets it by accident.
 *
 * Nothing here is the app's palette. When one wins it goes into tokens.css and
 * this comes out.
 */
interface Shade {
  name: string
  accent: string
  press: string
  soft: string
  ink: string
}

const SHADES: Shade[] = [
  { name: 'Indigo', accent: '#4f46e5', press: '#4338ca', soft: '#eeebfb', ink: '#1a1730' },
  { name: 'Violet', accent: '#7c3aed', press: '#6d28d9', soft: '#f1e9fe', ink: '#241a3f' },
  { name: 'Light violet', accent: '#8b5cf6', press: '#7c3aed', soft: '#f3ecfe', ink: '#2b2150' },
  { name: 'Deep purple', accent: '#6d28d9', press: '#5b21b6', soft: '#efe7fd', ink: '#1e1533' },
  { name: 'Grape', accent: '#9333ea', press: '#7e22ce', soft: '#f6e9fe', ink: '#2a1240' },
  { name: 'Periwinkle', accent: '#6366f1', press: '#4f46e5', soft: '#eef0fe', ink: '#1d1c3a' },
  { name: 'Plum', accent: '#a21caf', press: '#86198f', soft: '#fbe8fb', ink: '#2e1030' },
  { name: 'Blue violet', accent: '#5b5bd6', press: '#4a4ab8', soft: '#ececfc', ink: '#1a1a36' },
  { name: 'Orchid', accent: '#a855f7', press: '#9333ea', soft: '#f7ecfe', ink: '#2d1b45' },
]

const KEY = 'logpal.shade'

export function shadeLabOpen(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('shades')
  } catch {
    return false
  }
}

function apply(s: Shade) {
  const root = document.documentElement.style
  root.setProperty('--accent', s.accent)
  root.setProperty('--accent-press', s.press)
  root.setProperty('--accent-soft', s.soft)
  root.setProperty('--accent-ring', `${s.accent}2e`)
  root.setProperty('--ink', s.ink)
}

export function ShadeLab() {
  const [picked, setPicked] = useState(() => {
    try {
      return localStorage.getItem(KEY) ?? SHADES[0].name
    } catch {
      return SHADES[0].name
    }
  })

  useEffect(() => {
    const s = SHADES.find((x) => x.name === picked)
    if (!s) return
    apply(s)
    try {
      localStorage.setItem(KEY, s.name)
    } catch {
      /* A blocked store just means the choice does not survive a reload. */
    }
  }, [picked])

  return (
    <div className="shadelab">
      {SHADES.map((s) => (
        <button
          key={s.name}
          className={`shadelab__chip ${picked === s.name ? 'shadelab__chip--on' : ''}`}
          style={{ background: s.accent }}
          onClick={() => setPicked(s.name)}
          aria-label={s.name}
          title={`${s.name} ${s.accent}`}
        />
      ))}
      <span className="shadelab__name">{picked}</span>
    </div>
  )
}
