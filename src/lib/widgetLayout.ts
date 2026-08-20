/**
 * The Home screen's widget board.
 *
 * Home used to be a fixed stack: calories, macros, then four tiles in a set
 * order. Which of those matter is personal. Someone eating to a fasting
 * protocol wants that timer first, someone cutting wants calories, and plenty
 * of people never want to see a step count, so the layout is theirs to
 * arrange rather than ours to decide.
 *
 * Deliberately a *flow*, not free placement on an x/y plane. Widgets are held
 * in order and laid into four columns by CSS grid, which means there are never
 * overlaps or holes to reconcile, and reordering is a list operation rather
 * than a packing algorithm. iOS does the same thing: move one widget and the
 * others close up behind it.
 *
 * Device-local on purpose. It is a view preference, not data. A phone and a
 * laptop reasonably want different arrangements, and syncing it would need a
 * table to hold what is essentially a cosmetic choice.
 */

export const WIDGET_IDS = ['calories', 'macros', 'fasting', 'water', 'sleep', 'steps'] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

/** Columns a widget spans. Four is the full width of the screen. */
export type WidgetWidth = 1 | 2 | 3 | 4

/** Rows a widget spans. One row is `ROW_H` tall. */
export type WidgetHeight = 1 | 2 | 3

export interface WidgetSpec {
  id: WidgetId
  w: WidgetWidth
  h: WidgetHeight
}

export interface WidgetLayout {
  /** In display order. */
  shown: WidgetSpec[]
  /** Removed from the board, offered back in the edit sheet. */
  hidden: WidgetId[]
}

export const COLUMNS = 4

/** One row unit, in pixels. Two of them is about the height of the cards Home
 * used to have, which is what the default board is built from. */
export const ROW_H = 72

/** The gap between widgets, and between a widget and the screen edge. */
export const GAP = 12

export const WIDGET_LABELS: Record<WidgetId, string> = {
  calories: 'Calories',
  macros: 'Macros',
  fasting: 'Fasting',
  water: 'Water',
  sleep: 'Sleep',
  steps: 'Steps',
}

/** The smallest each widget still reads at, so resizing cannot break one. */
export const MIN_WIDTH: Record<WidgetId, WidgetWidth> = {
  calories: 2,
  macros: 2,
  fasting: 1,
  water: 1,
  sleep: 1,
  steps: 1,
}

/** What Home looked like before it was arrangeable, to the pixel. */
export function defaultLayout(): WidgetLayout {
  return {
    shown: [
      { id: 'calories', w: 4, h: 2 },
      { id: 'macros', w: 4, h: 2 },
      { id: 'fasting', w: 2, h: 2 },
      { id: 'water', w: 2, h: 2 },
      { id: 'sleep', w: 2, h: 2 },
      { id: 'steps', w: 2, h: 2 },
    ],
    hidden: [],
  }
}

const KEY = 'logpal.widgets.v1'

export function loadLayout(): WidgetLayout {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultLayout()
    return reconcile(JSON.parse(raw) as Partial<WidgetLayout>)
  } catch {
    return defaultLayout()
  }
}

export function saveLayout(layout: WidgetLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    /* A full or blocked store is not worth breaking Home over. */
  }
}

/**
 * Repairs a saved layout against the widgets that exist now.
 *
 * A widget added in a later version has to appear for people who already have
 * a saved board, or it would be invisible to exactly the users who have been
 * here longest, and one that has been removed from the app must not leave a
 * hole behind.
 */
export function reconcile(saved: Partial<WidgetLayout>): WidgetLayout {
  const known = new Set<string>(WIDGET_IDS)
  const shown = (saved.shown ?? [])
    .filter((s) => s && known.has(s.id))
    .map((s) => ({
      id: s.id,
      w: clampWidth(s.id, s.w),
      h: (Math.min(3, Math.max(1, Math.round(s.h ?? 2))) || 2) as WidgetHeight,
    }))
  const hidden = (saved.hidden ?? []).filter((id) => known.has(id))

  const placed = new Set([...shown.map((s) => s.id), ...hidden])
  for (const spec of defaultLayout().shown) {
    if (!placed.has(spec.id)) shown.push(spec)
  }
  return { shown, hidden }
}

export function clampWidth(id: WidgetId, w: number | undefined): WidgetWidth {
  const min = MIN_WIDTH[id]
  const value = Math.min(COLUMNS, Math.max(min, Math.round(w ?? 2)))
  return value as WidgetWidth
}

/** Moves the widget at `from` so it sits at `to`, closing the gap behind it. */
export function reorder(shown: WidgetSpec[], from: number, to: number): WidgetSpec[] {
  if (from === to || from < 0 || to < 0 || from >= shown.length || to >= shown.length) return shown
  const next = [...shown]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
