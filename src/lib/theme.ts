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

/** What the Appearance screen offers, with the colours each swatch is drawn in. */
export const PALETTES: { key: Palette; label: string; bg: string; accent: string; second: string; pattern?: boolean }[] = [
  { key: 'classic', label: 'Classic', bg: '#f4f4f7', accent: '#5b5bd6', second: '#16a34a' },
  { key: 'sakura', label: 'Sakura', bg: '#fbf3f5', accent: '#e4799a', second: '#8dbd86' },
  { key: 'matcha', label: 'Matcha', bg: '#f3f7f0', accent: '#7ea878', second: '#e4799a' },
  { key: 'gingham', label: 'Gingham', bg: '#fdfbfc', accent: '#e4799a', second: '#8dbd86', pattern: true },
]
