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
  { key: 'sakura', label: 'Sakura', bg: '#eef3fb', accent: '#ea7fa6', second: '#3e4b40' },
  { key: 'matcha', label: 'Matcha', bg: '#fcecec', accent: '#7fb86a', second: '#5a3838' },
  { key: 'lavender', label: 'Lavender', bg: '#fbf8d8', accent: '#a483dc', second: '#3d2e4f' },
  { key: 'sky', label: 'Sky', bg: '#fdf0e3', accent: '#5fa3e6', second: '#243247' },
  { key: 'honey', label: 'Honey', bg: '#eaf1f8', accent: '#e8ae2e', second: '#4e3414' },
  { key: 'slate', label: 'Slate', bg: '#f5efe3', accent: '#6b90c0', second: '#26303c' },
  { key: 'mocha', label: 'Mocha', bg: '#eaf3ec', accent: '#c7845a', second: '#3a2820' },
  { key: 'earth', label: 'Earth', bg: '#fbf1df', accent: '#b9ae66', second: '#163e11' },
  { key: 'neapolitan', label: 'Neapolitan', bg: '#fcf7e4', accent: '#e27ab0', second: '#604734' },
]
