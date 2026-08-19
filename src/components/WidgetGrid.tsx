import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Sheet } from './ui'
import { WIDGETS } from './widgets'
import {
  COLUMNS,
  GAP,
  MIN_WIDTH,
  ROW_H,
  WIDGET_LABELS,
  clampWidth,
  defaultLayout,
  loadLayout,
  reorder,
  saveLayout,
  type WidgetHeight,
  type WidgetId,
  type WidgetLayout,
} from '../lib/widgetLayout'

/**
 * The arrangeable Home board.
 *
 * Four columns, rows as tall as `ROW_H`, and CSS grid doing the packing — a
 * widget declares how many columns and rows it spans and the browser closes up
 * behind it. That is the whole reason the model is an ordered list rather than
 * coordinates: there is no state in which two widgets overlap or a hole opens
 * up, because neither is expressible.
 *
 * Everything is pointer events rather than HTML5 drag-and-drop, which does not
 * fire on iOS Safari at all — and this is an iPhone app first. `setPointerCapture`
 * keeps the gesture attached to the finger that started it even when it leaves
 * the element.
 */
export function WidgetGrid({
  date,
  editing,
  onEditingChange,
}: {
  date: string
  editing: boolean
  onEditingChange(v: boolean): void
}) {
  const [layout, setLayout] = useState<WidgetLayout>(() => loadLayout())
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState<WidgetId | null>(null)
  const [resizing, setResizing] = useState<WidgetId | null>(null)
  const [adding, setAdding] = useState(false)

  const update = useCallback((next: WidgetLayout) => {
    setLayout(next)
    saveLayout(next)
  }, [])

  /* Leaving edit mode is the natural end of any gesture. */
  useEffect(() => {
    if (!editing) {
      setDragging(null)
      setResizing(null)
    }
  }, [editing])

  const cellWidth = () => {
    const width = gridRef.current?.clientWidth ?? 0
    return (width - GAP * (COLUMNS - 1)) / COLUMNS
  }

  /* ------------------------------------------------------------- moving -- */

  const onDragMove = (e: React.PointerEvent, id: WidgetId) => {
    if (!editing || dragging !== id) return
    /* Which widget is under the finger, rather than which one it started on:
       the pointer is captured, so every move event still targets the dragged
       element and `e.target` would never change. */
    const under = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest('[data-widget]') as HTMLElement | null
    const overId = under?.dataset.widget as WidgetId | undefined
    if (!overId || overId === id) return

    const from = layout.shown.findIndex((s) => s.id === id)
    const to = layout.shown.findIndex((s) => s.id === overId)
    if (from < 0 || to < 0) return
    update({ ...layout, shown: reorder(layout.shown, from, to) })
  }

  /* ------------------------------------------------------------ resizing -- */

  const onResizeMove = (e: React.PointerEvent, id: WidgetId) => {
    if (resizing !== id) return
    const el = gridRef.current?.querySelector(`[data-widget="${id}"]`) as HTMLElement | null
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cw = cellWidth()

    /* Whole cells only. Half a column would leave a gap nothing else can fill,
       which is exactly the ragged look the grid exists to prevent. */
    const w = clampWidth(id, Math.round((e.clientX - rect.left + GAP) / (cw + GAP)))
    const rows = Math.round((e.clientY - rect.top + GAP) / (ROW_H + GAP))
    const h = Math.min(3, Math.max(1, rows)) as WidgetHeight

    const current = layout.shown.find((s) => s.id === id)
    if (!current || (current.w === w && current.h === h)) return
    update({
      ...layout,
      shown: layout.shown.map((s) => (s.id === id ? { ...s, w, h } : s)),
    })
  }

  /* ------------------------------------------------------ add and remove -- */

  const remove = (id: WidgetId) =>
    update({
      shown: layout.shown.filter((s) => s.id !== id),
      hidden: [...layout.hidden, id],
    })

  const add = (id: WidgetId) =>
    update({
      shown: [...layout.shown, { id, w: Math.max(2, MIN_WIDTH[id]) as 2 | 3 | 4, h: 2 }],
      hidden: layout.hidden.filter((h) => h !== id),
    })

  return (
    <>
      <div
        ref={gridRef}
        className={`wgrid ${editing ? 'wgrid--editing' : ''}`}
        style={{
          gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
          gridAutoRows: `${ROW_H}px`,
          gap: GAP,
        }}
      >
        {layout.shown.map((spec) => {
          const Body = WIDGETS[spec.id]
          return (
            <div
              key={spec.id}
              data-widget={spec.id}
              className={`widget ${dragging === spec.id ? 'widget--dragging' : ''}`}
              style={{ gridColumn: `span ${spec.w}`, gridRow: `span ${spec.h}` }}
              onPointerDown={(e) => {
                if (!editing || resizing) return
                if ((e.target as HTMLElement).closest('.widget__remove, .widget__resize')) return
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                setDragging(spec.id)
              }}
              onPointerMove={(e) => onDragMove(e, spec.id)}
              onPointerUp={() => setDragging(null)}
              onPointerCancel={() => setDragging(null)}
            >
              <Body date={date} w={spec.w} h={spec.h} editing={editing} />

              {editing && (
                <>
                  <button
                    className="widget__remove"
                    /* The press must not reach the widget behind it. That
                       pointerdown starts a drag and captures the pointer, and a
                       captured pointer retargets the click that follows — so
                       the button was visibly there and could not be tapped. */
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(spec.id)
                    }}
                    aria-label={`Remove ${WIDGET_LABELS[spec.id]}`}
                  >
                    <Icon name="close" size={13} strokeWidth={2.6} />
                  </button>

                  {/* Bottom-right, the corner every resize handle has been in
                      since windows had corners. */}
                  <span
                    className="widget__resize"
                    role="slider"
                    aria-label={`Resize ${WIDGET_LABELS[spec.id]}`}
                    aria-valuenow={spec.w}
                    aria-valuemin={MIN_WIDTH[spec.id]}
                    aria-valuemax={COLUMNS}
                    tabIndex={0}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                      setResizing(spec.id)
                    }}
                    onPointerMove={(e) => onResizeMove(e, spec.id)}
                    onPointerUp={() => setResizing(null)}
                    onPointerCancel={() => setResizing(null)}
                  />
                </>
              )}
            </div>
          )
        })}
      </div>

      {editing && (
        <div className="wedit">
          <div className="wedit__actions">
            {/* Three real buttons rather than two text links and a slab: they
                are equally weighted actions, and Done was reading as the only
                one that existed. */}
            <button className="btn btn--ghost" onClick={() => setAdding(true)}>
              Add widget
            </button>
            <button className="btn btn--ghost" onClick={() => update(defaultLayout())}>
              Reset layout
            </button>
            <button className="btn btn--primary" onClick={() => onEditingChange(false)}>
              Done
            </button>
          </div>
          <div className="hint" style={{ paddingTop: 8 }}>
            Drag a widget to move it, pull the corner to resize, or tap ✕ to take it off the board.
            Widths snap to quarters of the screen.
          </div>
        </div>
      )}

      {adding && (
        <Sheet title="Add a widget" onClose={() => setAdding(false)}>
          <div style={{ padding: '4px 4px 12px' }}>
            {layout.hidden.length === 0 ? (
              <div className="hint" style={{ padding: '8px 12px 14px' }}>
                Every widget is already on the board. Remove one with ✕ to bring it back here.
              </div>
            ) : (
              layout.hidden.map((id) => (
                <button
                  key={id}
                  className="row"
                  onClick={() => {
                    add(id)
                    setAdding(false)
                  }}
                >
                  <span className="row__main">
                    <span className="row__title">{WIDGET_LABELS[id]}</span>
                  </span>
                  <span className="row__chev">
                    <Icon name="plus" size={18} strokeWidth={2.2} />
                  </span>
                </button>
              ))
            )}
          </div>
        </Sheet>
      )}

    </>
  )
}
