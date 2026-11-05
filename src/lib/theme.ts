import type { Palette, Settings } from '../types'

/**
 * The look is two settings: a mode (light, dark, or the system's) and a
 * palette (the colour family under it). Both go on <html> as data
 * attributes so the tokens in `tokens.css` cascade everywhere, including
 * portalled sheets. The Appearance screen calls this as a person picks, so
 * the choice shows at once; the store calls it again whenever the saved
 * settings change, which is what puts an unsaved pick back.
 */
export function applyLook(theme: Settings['theme'], palette: Palette): void {
  const root = document.documentElement
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.dataset.theme = dark ? 'dark' : 'light'
  /* A save may name a look that was since cut (Peach, Ocean, Mono went on
     2026-11-05); that falls back to classic rather than to no tokens. */
  root.dataset.palette = PALETTES.some((p) => p.key === palette) ? palette : 'classic'
  /* The browser chrome (and the PWA's status bar) takes the wash colour. */
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (bg) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg))
}

/** What the Appearance screen offers, with the colours each swatch is drawn in:
    the wash, the brand colour, and the second colour that is splashed about. */
export const PALETTES: { key: Palette; label: string; bg: string; accent: string; second: string }[] = [
  { key: 'classic', label: 'Classic', bg: '#f4f4f7', accent: '#5b5bd6', second: '#16a34a' },
  { key: 'sakura', label: 'Sakura', bg: '#fbf4f6', accent: '#d8809a', second: '#86ad82' },
  { key: 'matcha', label: 'Matcha', bg: '#f5f8f3', accent: '#83a97f', second: '#d98ba3' },
  { key: 'lavender', label: 'Lavender', bg: '#f6f3fc', accent: '#8f74d2', second: '#4fb39a' },
  { key: 'sky', label: 'Sky', bg: '#f1f6fc', accent: '#4f8fe0', second: '#e09a4a' },
  { key: 'honey', label: 'Honey', bg: '#fcf7ea', accent: '#d9961f', second: '#4d6fb3' },
  { key: 'slate', label: 'Slate', bg: '#f0f3f8', accent: '#44679f', second: '#e08f2f' },
  { key: 'forest', label: 'Forest', bg: '#f0f6f1', accent: '#2f8457', second: '#d07a3a' },
]
