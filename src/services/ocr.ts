import { createWorker, PSM, type Worker } from 'tesseract.js'

/**
 * Text recognition, on the device, from the bundle.
 *
 * Tesseract runs as WebAssembly in a web worker. Its three pieces, the worker
 * script, the engine and the English model, are copied into `public/ocr` so
 * they load from the app itself: the native build has to work in a kitchen
 * with no signal, and nothing here should depend on a CDN being up. The fast
 * English model is used, 2 MB rather than 11; on a printed label the
 * difference is small and the first scan starts in a second or two instead
 * of ten.
 *
 * The worker is created once and kept, the second scan is quick.
 */
export interface OcrProgress {
  status: string
  progress: number
}

let workerPromise: Promise<Worker> | null = null
const listeners = new Set<(p: OcrProgress) => void>()

export function ocrSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof WebAssembly !== 'undefined'
  )
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker('eng', 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr/tesseract-core-simd-lstm.wasm.js',
        langPath: '/ocr',
        gzip: true,
        logger: (m: { status: string; progress: number }) => {
          for (const l of listeners) l({ status: m.status, progress: m.progress })
        },
      })
      /* A label is one block of short lines. Told so, the engine keeps each
         figure on the line with its name and, on the sample labels, finds the
         "Calories 230" line that the column mode skipped. */
      await w.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      })
      return w
    })().catch((err) => {
      workerPromise = null
      throw err
    })
  }
  return workerPromise
}

/**
 * Recognise the text in an image (a data URL). `onProgress` gets the
 * engine's own stages: loading, initialising, recognising, each 0..1.
 */
export async function recogniseText(
  image: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  if (onProgress) listeners.add(onProgress)
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(image)
    return data.text
  } finally {
    if (onProgress) listeners.delete(onProgress)
  }
}

/**
 * Make a photo easier to read: grey, with the contrast stretched so faint
 * print on a shiny packet comes up black, and scaled so the text is around
 * the size the engine was trained on. Output is a PNG data URL; JPEG
 * artefacts around letters cost accuracy.
 */
export async function prepareForOcr(dataUrl: string, targetWidth = 1400): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not read the photo'))
    el.src = dataUrl
  })
  const scale = targetWidth / img.width
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return dataUrl
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = frame.data
  const hist = new Uint32Array(256)
  const grey = new Uint8ClampedArray(px.length / 4)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000
    grey[j] = g
    hist[g | 0]++
  }
  /* Stretch between the 2nd and 98th percentiles, so a few specular
     highlights or a dark border do not decide the range. */
  const total = grey.length
  let lo = 0
  let hi = 255
  for (let acc = 0, i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= total * 0.02) {
      lo = i
      break
    }
  }
  for (let acc = 0, i = 255; i >= 0; i--) {
    acc += hist[i]
    if (acc >= total * 0.02) {
      hi = i
      break
    }
  }
  const range = Math.max(1, hi - lo)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = ((grey[j] - lo) * 255) / range
    px[i] = px[i + 1] = px[i + 2] = v
    px[i + 3] = 255
  }
  ctx.putImageData(frame, 0, 0)
  return canvas.toDataURL('image/png')
}
