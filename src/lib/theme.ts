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
     2026-11-05, Sky on 2026-11-06); that falls back to classic rather than to no tokens. */
  root.dataset.palette = PALETTES.some((p) => p.key === palette) ? palette : 'classic'
  /* The browser chrome (and the PWA's status bar) takes the wash colour. */
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (bg) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg))
}

/** What the Appearance screen offers, with the colours each swatch is drawn in:
    the wash, the brand colour, and the second colour that is splashed about. */
export const PALETTES: { key: Palette; label: string; bg: string; accent: string; second: string }[] = [
  { key: 'classic', label: 'Classic', bg: '#f4f4f7', accent: '#5b5bd6', second: '#16a34a' },
  { key: 'blue', label: 'Classic Blue', bg: '#f4f4f7', accent: '#2f6fe4', second: '#16a34a' },
  { key: 'green', label: 'Classic Green', bg: '#f4f4f7', accent: '#16a34a', second: '#5b5bd6' },
  { key: 'pink', label: 'Classic Pink', bg: '#f4f4f7', accent: '#ec4899', second: '#16a34a' },
  { key: 'yellow', label: 'Classic Yellow', bg: '#f4f4f7', accent: '#e3a008', second: '#16a34a' },
  { key: 'sakura', label: 'Sakura', bg: '#fcf6f3', accent: '#ec9ab9', second: '#5a3a44' },
  { key: 'matcha', label: 'Matcha', bg: '#fbf5e1', accent: '#7fb86a', second: '#4a3626' },
  { key: 'lavender', label: 'Lavender', bg: '#fbf7f6', accent: '#b39adb', second: '#4a3d5c' },
  { key: 'honey', label: 'Honey', bg: '#fcf7e4', accent: '#e9b84a', second: '#5c4320' },
  { key: 'slate', label: 'Slate', bg: '#f5efe3', accent: '#6b90c0', second: '#26303c' },
  { key: 'mocha', label: 'Mocha', bg: '#fbf7f1', accent: '#bf8f70', second: '#3b2a22' },
  { key: 'earth', label: 'Earth', bg: '#fbf1df', accent: '#b9ae66', second: '#163e11' },
  { key: 'neapolitan', label: 'Neapolitan', bg: '#fcf7e4', accent: '#e27ab0', second: '#604734' },
]
