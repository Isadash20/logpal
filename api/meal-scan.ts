import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

/**
 * Meal scan: a plate photo and the user's own words go to Claude, which
 * names each food and weighs the portion. Runs on Vercel so the API key
 * never ships in the app.
 *
 * Who may call it: anyone holding a valid LogPal session. The Supabase
 * access token comes in the Authorization header and is checked against
 * Supabase before a single token is spent, so the key cannot be run up by
 * someone who found the URL.
 *
 * Environment (Vercel project settings):
 *   ANTHROPIC_API_KEY        the key that pays for the scans
 *   VITE_SUPABASE_URL        already set for the web app
 *   VITE_SUPABASE_ANON_KEY   already set for the web app
 */

export const config = { maxDuration: 60 }

const MODEL = 'claude-opus-5-5'

/** A base64 JPEG at 1280 px is ~400 KB; anything far past that is not a plate photo. */
const MAX_IMAGE_CHARS = 2_600_000

const Item = z.object({
  name: z.string().describe('Short food name as a diary would show it, e.g. "Grilled chicken breast"'),
  portion: z.string().describe('Portion in everyday words, e.g. "1 cup", "2 slices", "palm-sized piece"'),
  grams: z.number().describe('Estimated weight of this portion in grams'),
  calories: z.number(),
  protein: z.number().describe('grams'),
  carbs: z.number().describe('grams'),
  fat: z.number().describe('grams'),
  fiber: z.number().describe('grams'),
  sugar: z.number().describe('grams'),
  sodium: z.number().describe('milligrams'),
  confidence: z.enum(['high', 'medium', 'low']),
})

const Result = z.object({
  items: z.array(Item),
  /** One plain sentence on how the portions were sized, for the user to sanity-check. */
  sizing: z.string(),
})

export type MealScanResult = z.infer<typeof Result>

const SYSTEM = `You are the nutrition estimator inside LogPal, a food diary app. You receive a photo of a meal, sometimes a reference photo of the user's hand, and the user's own description of the plate. Return every distinct food on the plate as an item with an estimated weight in grams and its nutrition for that weight.

What the food is:
- The user's description is the authority on identity. If they say "chicken" and the photo could pass for coconut, it is chicken. Never override a named food with what the pixels suggest; use the photo to tell cooking method, cut and how much.
- Foods the user names that you cannot see are still on the plate (hidden under something, eaten already, or a drink out of frame). Include them, sized from the description or a typical serving.
- Foods you see that the description does not mention: include them unless the description rules them out.
- Sauces, dressings, oil sheen and butter count. Say so in the item name.

How much:
- Weigh what is actually there. Do not fall back to a database default serving (4 oz, 1 cup) unless the photo truly gives you nothing. A portion that is clearly double or half a typical serving must come out double or half.
- Scale references, in order of trust: the user's hand if it is in the plate photo (its palm width across the knuckles is given in centimetres; a reference photo of the same hand may be attached so you can recognise it); a fork (about 18 cm), spoon, credit card, phone, can or bottle if present; the plate (a dinner plate is 26-28 cm, a side plate 20 cm, a bowl 15-18 cm across); and otherwise the foods against each other.
- Estimate volume from footprint and height, then weight from density: leafy salad about 0.1 g/ml, cooked rice or pasta about 0.8 g/ml, cooked meat about 1.0 g/ml, bread about 0.25 g/ml, dense foods like cheese or potato about 1.0-1.1 g/ml.
- If the user states a quantity ("8 oz of chicken", "two eggs", "half a cup"), that quantity wins over your visual estimate.

Nutrition: use standard reference values for the named food as prepared (grilled, fried, with skin, and so on). Numbers are for the stated grams, not per 100 g.

Confidence: high when the food is named and the scale reference is clear; medium when either is missing; low when guessing.

sizing: one short, plain sentence saying what you used for scale and anything the user should double-check, e.g. "Sized against your hand; the rice is piled high so it may be more than it looks."`

function cors(headers: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    ...headers,
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: cors({ 'content-type': 'application/json' }),
  })
}

/** Split a data URL into the media type and the bare base64 the API wants. */
function splitDataUrl(url: string): { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url)
  if (!m) return null
  return { mediaType: m[1] as 'image/jpeg' | 'image/png' | 'image/webp', data: m[2] }
}

/** True when Supabase recognises the bearer token as a live session. */
async function sessionIsValid(authorization: string | null): Promise<boolean> {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || !authorization?.startsWith('Bearer ')) return false
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, authorization },
  })
  return res.ok
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  if (!process.env.ANTHROPIC_API_KEY) {
    return json(503, { error: 'Meal scan is not set up on the server yet.' })
  }

  if (!(await sessionIsValid(req.headers.get('authorization')))) {
    return json(401, { error: 'Sign in to use meal scan.' })
  }

  let body: { image?: string; hand?: string; handSpanCm?: number; description?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json(400, { error: 'Bad request body' })
  }

  const image = typeof body.image === 'string' ? splitDataUrl(body.image) : null
  if (!image) return json(400, { error: 'image must be a JPEG, PNG or WebP data URL' })
  if (image.data.length > MAX_IMAGE_CHARS) return json(413, { error: 'Photo too large' })

  const hand = typeof body.hand === 'string' ? splitDataUrl(body.hand) : null
  const handSpanCm =
    typeof body.handSpanCm === 'number' && body.handSpanCm > 5 && body.handSpanCm < 13
      ? body.handSpanCm
      : null
  const description = (body.description ?? '').toString().trim().slice(0, 1200)

  const content: Anthropic.ContentBlockParam[] = []
  if (hand && handSpanCm) {
    content.push(
      { type: 'text', text: `Reference photo of the user's hand. Palm width across the knuckles: ${handSpanCm} cm.` },
      { type: 'image', source: { type: 'base64', media_type: hand.mediaType, data: hand.data } },
    )
  }
  content.push(
    { type: 'text', text: 'The plate:' },
    { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
    {
      type: 'text',
      text: [
        description
          ? `The user's description of the plate: "${description}"`
          : 'The user gave no description. Identify the foods from the photo alone and keep confidence honest.',
        handSpanCm && !hand
          ? `If a hand is in the photo, it is the user's; palm width across the knuckles is ${handSpanCm} cm.`
          : '',
        'Return the items and sizing.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  )

  const client = new Anthropic()
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'high', format: zodOutputFormat(Result) },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
    })

    if (response.stop_reason === 'refusal') {
      return json(422, { error: 'The model declined to read this photo.' })
    }
    const parsed = response.parsed_output
    if (!parsed) return json(502, { error: 'The model returned something unreadable. Try again.' })

    // Round so the diary does not show 13 decimal places.
    const items = parsed.items.map((it) => ({
      ...it,
      grams: Math.max(0, Math.round(it.grams)),
      calories: Math.max(0, Math.round(it.calories)),
      protein: round1(it.protein),
      carbs: round1(it.carbs),
      fat: round1(it.fat),
      fiber: round1(it.fiber),
      sugar: round1(it.sugar),
      sodium: Math.max(0, Math.round(it.sodium)),
    }))
    return json(200, { items, sizing: parsed.sizing, model: response.model })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json(429, { error: 'Meal scan is busy. Try again in a moment.' })
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return json(503, { error: 'Meal scan is misconfigured on the server.' })
    }
    if (err instanceof Anthropic.APIError) {
      return json(502, { error: `The model could not be reached (${err.status}).` })
    }
    return json(500, { error: 'Something went wrong reading the photo.' })
  }
}

function round1(n: number): number {
  return Math.max(0, Math.round(n * 10) / 10)
}
