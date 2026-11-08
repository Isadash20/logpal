/**
 * Turn a chosen photo into a small square JPEG data URL for the profile.
 *
 * 256 px and quality 0.82 lands around 15–25 KB, small enough to live inside
 * the profile JSON that already syncs, so there is no bucket, no upload and
 * no second thing that can fail.
 *
 * The crop comes from the person: `AvatarCropper` lets them drag and zoom a
 * circle over the photo and hands back a square in image pixels. The old
 * centred-square path stays as `fileToAvatar` for anything that has no
 * picker.
 */

export type Bitmap = ImageBitmap | HTMLImageElement

/** A square region of the source image, in its own pixels. */
export interface Crop {
  sx: number
  sy: number
  side: number
}

export function bitmapSize(b: Bitmap): { width: number; height: number } {
  return 'naturalWidth' in b ? { width: b.naturalWidth, height: b.naturalHeight } : { width: b.width, height: b.height }
}

export function cropAvatar(bitmap: Bitmap, crop: Crop, size = 256): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas')
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.side, crop.side, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', 0.82)
}

export async function fileToAvatar(file: File, size = 256): Promise<string> {
  const bitmap = await loadBitmap(file)
  const { width, height } = bitmapSize(bitmap)
  const side = Math.min(width, height)
  const out = cropAvatar(bitmap, { sx: (width - side) / 2, sy: (height - side) / 2, side }, size)
  if ('close' in bitmap) bitmap.close()
  return out
}

export async function loadBitmap(file: File): Promise<Bitmap> {
  /* createImageBitmap honours the photo's EXIF rotation; a phone photo
     loaded through <img> can come out sideways. */
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* fall through to the element path */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read that image'))
      img.src = url
    })
  } finally {
    /* The element has decoded by now; the URL can go. */
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/**
 * The geometry behind the cropper, kept pure so it can be tested.
 *
 * The photo is shown "cover"-fitted to a square frame of `frame` px, then
 * zoomed by `zoom` (1 = just covers) and shifted by `ox, oy` frame pixels
 * from centre. The frame is what ends up in the avatar.
 */
export function cropFromView(img: { width: number; height: number }, frame: number, zoom: number, ox: number, oy: number): Crop {
  const base = frame / Math.min(img.width, img.height)
  const scale = base * zoom
  const shownW = img.width * scale
  const shownH = img.height * scale
  const [cx, cy] = clampOffset(img, frame, zoom, ox, oy)
  const sx = (shownW / 2 - cx - frame / 2) / scale
  const sy = (shownH / 2 - cy - frame / 2) / scale
  return { sx, sy, side: frame / scale }
}

/** Keeps the frame fully inside the photo, so no edge of the avatar is blank. */
export function clampOffset(img: { width: number; height: number }, frame: number, zoom: number, ox: number, oy: number): [number, number] {
  const base = frame / Math.min(img.width, img.height)
  const scale = base * zoom
  const maxX = Math.max(0, (img.width * scale - frame) / 2)
  const maxY = Math.max(0, (img.height * scale - frame) / 2)
  return [Math.min(maxX, Math.max(-maxX, ox)), Math.min(maxY, Math.max(-maxY, oy))]
}
