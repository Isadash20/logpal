import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { Sheet } from './ui'
import { WIDGETS } from './widgets'
import { useT } from '../i18n'
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
 * Four columns, rows as tall as `ROW_H`, and CSS grid doing the packing. A
 * widget declares how many columns and rows it spans and the browser closes up
 * behind it. That is the whole reason the model is an ordered list rather than
 * coordinates: there is no state in which two widgets overlap or a hole opens
 * up, because neither is expressible.
 *
 * Everything is pointer events rather than HTML5 drag-and-drop, which does not
 * fire on iOS Safari at all, and this is an iPhone app first. `setPointerCapture`
 * keeps the gesture attached to the finger that started it even when it leaves
 * the element.
 *
 * Two things make a long move (fasting from the bottom to the top, say) work,
 * neither of which the first version had:
 *
 * - The dragged widget rides under the finger as a lifted copy instead of
 *   snapping into each new slot. Snapping meant the grid re-flowed under a
 *   still finger, a different widget was suddenly underneath, and the order
 *   flipped back and forth. The ghost takes itself out of hit-testing, so the
 *   widget beneath the finger is always a *different* one, and a swap only
 *   happens once the finger is past that widget's midpoint in the direction
 *   it is travelling.
 * - The page scrolls itself when the finger is held near the top or bottom
 *   edge, so a widget can be carried further than one screen.
 *
 * And for anyone who would rather not drag at all: in edit mode every widget
 * has an up and a down arrow that move it one place.
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
  const t = useT()
  const [layout, setLayout] = useState<WidgetLayout>(() => loadLayout())
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState<WidgetId | null>(null)
  const [lift, setLift] = useState({ x: 0, y: 0 })
  const [resizing, setResizing] = useState<WidgetId | null>(null)
  const [adding, setAdding] = useState(false)

  /* Where the finger took hold, relative to the widget's own corner, and where
     it is now. Refs rather than state: the scroll loop reads them between
     renders. */
  const grab = useRef({ x: 0, y: 0 })
  const pointer = useRef({ x: 0, y: 0 })
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  /* Mirrors `dragging` synchronously: the first move event can arrive before
     the state from pointerdown has rendered, and a quick flick is all moves. */
  const draggingRef = useRef<WidgetId | null>(null)

  const update = useCallback((next: WidgetLayout) => {
    setLayout(next)
    saveLayout(next)
  }, [])

  /* Leaving edit mode is the natural end of any gesture. */
  useEffect(() => {
    if (!editing) {
      draggingRef.current = null
      setDragging(null)
      setResizing(null)
    }
  }, [editing])

  const cellWidth = () => {
    const width = gridRef.current?.clientWidth ?? 0
    return (width - GAP * (COLUMNS - 1)) / COLUMNS
  }

  /* ------------------------------------------------------------- moving -- */

  /* The widget's resting place, ignoring its own transform. offsetLeft/Top are
     laid-out positions, so they are unaffected by the lift. */
  const restingOrigin = (el: HTMLElement) => {
    const grid = gridRef.current!.getBoundingClientRect()
    return { x: grid.left + el.offsetLeft, y: grid.top + el.offsetTop }
  }

  const positionGhost = (id: WidgetId) => {
    const el = gridRef.current?.querySelector(`[data-widget="${id}"]`) as HTMLElement | null
    if (!el) return
    const rest = restingOrigin(el)
    setLift({
      x: pointer.current.x - grab.current.x - rest.x,
      y: pointer.current.y - grab.current.y - rest.y,
    })
  }

  const considerSwap = (id: WidgetId) => {
    const { x, y } = pointer.current
    /* The ghost is pointer-events: none, so this is always the widget beneath
       it rather than itself. */
    const under = document.elementFromPoint(x, y)?.closest('[data-widget]') as HTMLElement | null
    const overId = under?.dataset.widget as WidgetId | undefined
    if (!under || !overId || overId === id) return

    const shown = layoutRef.current.shown
    const from = shown.findIndex((s) => s.id === id)
    const to = shown.findIndex((s) => s.id === overId)
    if (from < 0 || to < 0) return

    /* Past the midpoint, in the direction of travel. Without this a wide
       widget swapped with a small one lands back under the finger and the
       next move event swaps them straight back. */
    const r = under.getBoundingClientRect()
    const dragged = gridRef.current?.querySelector(`[data-widget="${id}"]`) as HTMLElement | null
    const sameRow = dragged ? Math.abs(dragged.offsetTop - under.offsetTop) < ROW_H / 2 : false
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const forward = to > from
    const past = sameRow ? (forward ? x > cx : x < cx) : forward ? y > cy : y < cy
    if (!past) return

    update({ ...layoutRef.current, shown: reorder(shown, from, to) })
  }

  const onDragMove = (e: React.PointerEvent, id: WidgetId) => {
    if (!editing || draggingRef.current !== id) return
    pointer.current = { x: e.clientX, y: e.clientY }
    positionGhost(id)
    considerSwap(id)
  }

  /* After every re-flow the ghost's resting place has moved, so its offset is
     recomputed to keep it under the finger. */
  useEffect(() => {
    if (dragging) positionGhost(dragging)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, dragging])

  /* Carrying a widget to the edge of the screen scrolls the page, the way
     every list on the phone does. A frame loop rather than the move event:
     a finger held still at the edge still needs to keep scrolling. */
  useEffect(() => {
    if (!dragging) return
    const scroller = gridRef.current?.closest('.scroll') as HTMLElement | null
    if (!scroller) return
    let raf = 0
    const EDGE = 96
    const tick = () => {
      const { y } = pointer.current
      const top = scroller.getBoundingClientRect().top
      const bottom = window.innerHeight
      let dy = 0
      if (y < top + EDGE) dy = -Math.ceil((top + EDGE - y) / 6)
      else if (y > bottom - EDGE - 72) dy = Math.ceil((y - (bottom - EDGE - 72)) / 6)
      if (dy !== 0) {
        scroller.scrollBy(0, dy)
        positionGhost(dragging)
        considerSwap(dragging)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const endDrag = () => {
    draggingRef.current = null
    setDragging(null)
    setLift({ x: 0, y: 0 })
  }

  const nudge = (id: WidgetId, dir: -1 | 1) => {
    const from = layout.shown.findIndex((s) => s.id === id)
    const to = from + dir
    if (from < 0 || to < 0 || to >= layout.shown.length) return
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

  const label = (id: WidgetId) => t(`widget.${id}`, undefined, WIDGET_LABELS[id])

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
        {layout.shown.map((spec, index) => {
          const Body = WIDGETS[spec.id]
          const isDragging = dragging === spec.id
          return (
            <div
              key={spec.id}
              data-widget={spec.id}
              className={`widget widget--${spec.id} ${isDragging ? 'widget--dragging' : ''}`}
              style={{
                gridColumn: `span ${spec.w}`,
                gridRow: `span ${spec.h}`,
                ...(isDragging
                  ? { transform: `translate(${lift.x}px, ${lift.y}px) scale(1.04)` }
                  : null),
              }}
              onPointerDown={(e) => {
                if (!editing || resizing) return
                if ((e.target as HTMLElement).closest('.widget__remove, .widget__resize, .widget__move'))
                  return
                const el = e.currentTarget as HTMLElement
                el.setPointerCapture(e.pointerId)
                const rest = restingOrigin(el)
                grab.current = { x: e.clientX - rest.x, y: e.clientY - rest.y }
                pointer.current = { x: e.clientX, y: e.clientY }
                setLift({ x: 0, y: 0 })
                draggingRef.current = spec.id
                setDragging(spec.id)
              }}
              onPointerMove={(e) => onDragMove(e, spec.id)}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <Body date={date} w={spec.w} h={spec.h} editing={editing} />

              {editing && (
                <>
                  <button
                    className="widget__remove"
                    /* The press must not reach the widget behind it. That
                       pointerdown starts a drag and captures the pointer, and a
                       captured pointer retargets the click that follows, so
                       the button was visibly there and could not be tapped. */
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(spec.id)
                    }}
                    aria-label={t('widgets.remove', { name: label(spec.id) })}
                  >
                    <Icon name="close" size={13} strokeWidth={2.6} />
                  </button>

                  {/* One place up or down, for anyone who finds dragging
                      fiddly. Hidden at the ends of the list rather than
                      disabled: a greyed arrow begs to be pressed. */}
                  <span className="widget__moves">
                    {index > 0 && (
                      <button
                        className="widget__move"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          nudge(spec.id, -1)
                        }}
                        aria-label={t('widgets.moveUp', { name: label(spec.id) })}
                      >
                        <Icon name="up" size={14} strokeWidth={2.6} />
                      </button>
                    )}
                    {index < layout.shown.length - 1 && (
                      <button
                        className="widget__move"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          nudge(spec.id, 1)
                        }}
                        aria-label={t('widgets.moveDown', { name: label(spec.id) })}
                      >
                        <Icon name="down" size={14} strokeWidth={2.6} />
                      </button>
                    )}
                  </span>

                  {/* Bottom-right, the corner every resize handle has been in
                      since windows had corners. */}
                  <span
                    className="widget__resize"
                    role="slider"
                    aria-label={t('widgets.resize', { name: label(spec.id) })}
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
              {t('widgets.add')}
            </button>
            <button className="btn btn--ghost" onClick={() => update(defaultLayout())}>
              {t('widgets.reset')}
            </button>
            <button className="btn btn--primary" onClick={() => onEditingChange(false)}>
              {t('common.done')}
            </button>
          </div>
        </div>
      )}

      {adding && (
        <Sheet title={t('widgets.addTitle')} onClose={() => setAdding(false)}>
          <div style={{ padding: '4px 4px 12px' }}>
            {layout.hidden.length === 0 ? (
              <div className="hint" style={{ padding: '8px 12px 14px' }}>
                {t('widgets.allShown')}
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
                    <span className="row__title">{label(id)}</span>
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
