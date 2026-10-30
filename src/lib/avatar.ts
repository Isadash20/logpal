/**
 * Turn a chosen photo into a small square JPEG data URL for the profile.
 *
 * 256 px and quality 0.82 lands around 15–25 KB, small enough to live inside
 * the profile JSON that already syncs, so there is no bucket, no upload and
 * no second thing that can fail. The crop is a centred square, which is what
 * every avatar circle will show anyway.
 */
export async function fileToAvatar(file: File, size = 256): Promise<string> {
  const bitmap = await loadBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No canvas')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  if ('close' in bitmap) bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
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
