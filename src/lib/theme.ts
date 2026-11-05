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
  root.dataset.palette = palette
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
  { key: 'lavender', label: 'Lavender', bg: '#f7f5fb', accent: '#9d8ccf', second: '#7fb8a8' },
  { key: 'peach', label: 'Peach', bg: '#fdf5f1', accent: '#e8927a', second: '#6fa9b5' },
  { key: 'sky', label: 'Sky', bg: '#f3f7fc', accent: '#6f9fd8', second: '#e0a86d' },
  { key: 'honey', label: 'Honey', bg: '#fcf8ef', accent: '#d9a441', second: '#6b86b5' },
  { key: 'slate', label: 'Slate', bg: '#f2f4f7', accent: '#5c7291', second: '#d99a4e' },
  { key: 'forest', label: 'Forest', bg: '#f2f6f3', accent: '#4f7d62', second: '#c7824f' },
  { key: 'ocean', label: 'Ocean', bg: '#f1f6f8', accent: '#3f7f93', second: '#e2846d' },
  { key: 'mono', label: 'Mono', bg: '#f4f4f5', accent: '#3a3a44', second: '#d14b5c' },
]
