import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet } from './ui'
import { bitmapSize, clampOffset, cropAvatar, cropFromView, loadBitmap, type Bitmap } from '../lib/avatar'

/**
 * Pick the part of a photo that becomes the avatar.
 *
 * The photo sits under a dark scrim with a clear window cut out, the shape
 * the picture will be shown in. Drag moves the photo under the window, the
 * slider, a pinch or the mouse wheel zooms it, and the window never leaves
 * the photo, so nothing blank reaches the avatar. What is inside the window
 * is exactly what everyone else will see.
 */
export function AvatarCropper({
  file,
  shape = 'circle',
  title = 'Choose your photo',
  onDone,
  onClose,
}: {
  file: File
  shape?: 'circle' | 'rounded'
  title?: string
  onDone(dataUrl: string): void
  onClose(): void
}) {
  const [bitmap, setBitmap] = useState<Bitmap | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<[number, number]>([0, 0])
  const frameRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState(280)
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null)
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())

  useEffect(() => {
    let live = true
    const u = URL.createObjectURL(file)
    setUrl(u)
    loadBitmap(file)
      .then((b) => (live ? setBitmap(b) : 'close' in b && b.close()))
      .catch(() => live && setError('That photo could not be read. Try another.'))
    return () => {
      live = false
      URL.revokeObjectURL(u)
    }
  }, [file])

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => setFrame(el.clientWidth || 280)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const size = useMemo(() => (bitmap ? bitmapSize(bitmap) : null), [bitmap])

  /* Wheel zoom has to be non-passive to stop the sheet scrolling under it. */
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.08 : 0.92)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!size) return
    setOffset((o) => clampOffset(size, frame, zoom, o[0], o[1]))
  }, [zoom, size, frame])

  const styleFor = (): React.CSSProperties | undefined => {
    if (!size) return undefined
    const base = frame / Math.min(size.width, size.height)
    const scale = base * zoom
    const [ox, oy] = clampOffset(size, frame, zoom, offset[0], offset[1])
    return {
      width: size.width * scale,
      height: size.height * scale,
      transform: `translate(${frame / 2 - (size.width * scale) / 2 + ox}px, ${frame / 2 - (size.height * scale) / 2 + oy}px)`,
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
      drag.current = null
    } else {
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: offset[0], oy: offset[1] }
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current.dist > 0) setZoom(clampZoom((pinch.current.zoom * dist) / pinch.current.dist))
      return
    }
    const d = drag.current
    if (d && d.id === e.pointerId && size) {
      setOffset(clampOffset(size, frame, zoom, d.ox + e.clientX - d.x, d.oy + e.clientY - d.y))
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  function use() {
    if (!bitmap || !size) return
    try {
      onDone(cropAvatar(bitmap, cropFromView(size, frame, zoom, offset[0], offset[1])))
    } catch {
      setError('That photo could not be saved. Try another.')
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="cropper">
        <div
          ref={frameRef}
          className={`cropper__frame cropper__frame--${shape}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {url && <img src={url} alt="" draggable={false} style={styleFor()} />}
          <div className="cropper__mask" aria-hidden />
        </div>
        <div className="cropper__hint">Drag to move. Pinch or slide to zoom. What&apos;s inside is what friends will see.</div>
        <label className="cropper__zoom">
          <span aria-hidden>−</span>
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} aria-label="Zoom" />
          <span aria-hidden>+</span>
        </label>
        {error && (
          <div className="hint" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}
        <div style={{ padding: '10px 4px 6px' }}>
          <button className="btn btn--primary" style={{ width: '100%' }} onClick={use} disabled={!bitmap}>
            Use this photo
          </button>
        </div>
      </div>
    </Sheet>
  )
}

const clampZoom = (z: number) => Math.min(4, Math.max(1, z))
