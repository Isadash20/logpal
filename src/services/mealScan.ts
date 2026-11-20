import { HAND_SPAN_CM, type Profile } from '../types'
import { supabase } from '../lib/supabase'
import { isNative } from '../lib/native'

/**
 * The client half of meal scan. The photo and the user's words go to
 * `/api/meal-scan` (see `api/meal-scan.ts`), which holds the model key.
 *
 * In the native app there is no same-origin server, so the call goes to the
 * production deployment. On the web it is relative, so previews talk to
 * their own deployment. A dev server has no API at all and falls back to
 * production too.
 */
const PRODUCTION = 'https://logpal-two.vercel.app'

export interface ScannedItem {
  name: string
  portion: string
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  sodium: number
  confidence: 'high' | 'medium' | 'low'
}

export interface ScanResult {
  items: ScannedItem[]
  sizing: string
}

export class MealScanError extends Error {
  constructor(
    message: string,
    /** True when the user is not signed in; the screen offers sign-in. */
    public readonly needsSignIn = false,
    /** True when the server has no model to call (503) or the day's quota is gone (429). */
    public readonly unavailable = false,
  ) {
    super(message)
  }
}

function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE as string | undefined
  if (configured) return configured.replace(/\/$/, '')
  if (isNative()) return PRODUCTION
  const host = typeof location !== 'undefined' ? location.hostname : ''
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return PRODUCTION
  return ''
}

/** Shrink a data URL to at most `maxEdge` px on its long side. */
export async function shrinkImage(dataUrl: string, maxEdge = 1280, quality = 0.82): Promise<string> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not read the photo'))
    img.src = dataUrl
  })
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  if (scale === 1 && dataUrl.startsWith('data:image/jpeg')) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

export async function scanMeal(opts: {
  image: string
  description: string
  profile: Pick<Profile, 'handSpan' | 'handPhoto'>
}): Promise<ScanResult> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
  const token = data.session?.access_token
  if (!token) throw new MealScanError('Sign in to use meal scan.', true)

  const image = await shrinkImage(opts.image)
  const hand = opts.profile.handPhoto ? await shrinkImage(opts.profile.handPhoto, 640, 0.7) : undefined
  const handSpanCm = opts.profile.handSpan ? HAND_SPAN_CM[opts.profile.handSpan] : undefined

  let res: Response
  try {
    res = await fetch(`${apiBase()}/api/meal-scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ image, hand, handSpanCm, description: opts.description }),
    })
  } catch {
    throw new MealScanError('No connection. Meal scan needs the internet.')
  }

  const body = (await res.json().catch(() => ({}))) as Partial<ScanResult> & { error?: string }
  if (res.status === 401) throw new MealScanError(body.error ?? 'Sign in to use meal scan.', true)
  if (res.status === 503 || res.status === 429) {
    throw new MealScanError(body.error ?? 'Meal scan is not available right now.', false, true)
  }
  if (!res.ok || !Array.isArray(body.items)) {
    throw new MealScanError(body.error ?? `Meal scan failed (${res.status}).`)
  }
  return { items: body.items, sizing: body.sizing ?? '' }
}
