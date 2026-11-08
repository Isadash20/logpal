import { describe, expect, it } from 'vitest'
import { clampOffset, cropFromView } from './avatar'

describe('cropFromView', () => {
  const wide = { width: 400, height: 200 }

  it('centred at zoom 1 is the middle square', () => {
    expect(cropFromView(wide, 100, 1, 0, 0)).toEqual({ sx: 100, sy: 0, side: 200 })
  })

  it('dragging the photo right shows more of its left', () => {
    const c = cropFromView(wide, 100, 1, 50, 0)
    expect(c.sx).toBe(0)
    expect(c.side).toBe(200)
  })

  it('zooming in halves the side and keeps the centre', () => {
    expect(cropFromView(wide, 100, 2, 0, 0)).toEqual({ sx: 150, sy: 50, side: 100 })
  })

  it('cannot drag past the edge of the photo', () => {
    expect(clampOffset(wide, 100, 1, 500, 500)).toEqual([50, 0])
    expect(cropFromView(wide, 100, 1, -500, 0).sx).toBe(200)
  })
})
