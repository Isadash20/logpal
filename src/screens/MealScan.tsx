import { useEffect, useRef, useState } from 'react'
import type { Food, Nutrients } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Row, TopBar } from '../components/ui'
import { cal } from '../lib/format'
import { emptyNutrients, scaleNutrients, sumNutrients } from '../lib/nutrition'
import { uid } from '../lib/id'
import { searchLocal } from '../services/foodSearch'
import { loadFoodDb } from '../services/foodDb'
import { parseSpokenFood } from './VoiceLog'

/** Portion words that scale the matched serving up or down. */
const SIZE_WORDS: { re: RegExp; factor: number; label: string }[] = [
  { re: /\b(huge|massive|extra large|xl)\b/, factor: 2, label: 'huge' },
  { re: /\b(large|big|generous)\b/, factor: 1.5, label: 'large' },
  { re: /\b(medium|regular|normal)\b/, factor: 1, label: 'medium' },
  { re: /\b(small|little|light)\b/, factor: 0.7, label: 'small' },
  { re: /\b(tiny|half a|half)\b/, factor: 0.5, label: 'small' },
]

export interface EstimateItem {
  query: string
  qty: number
  food: Food | null
  nutrients: Nutrients
}

export interface Estimate {
  items: EstimateItem[]
  totals: Nutrients
  matched: number
  unmatched: string[]
}

/**
 * Turn a written description into a nutrition estimate.
 *
 * Each phrase is matched against the food database and scaled by any quantity
 * or size word attached to it. This is an estimate from what you typed, not
 * from the photo — no vision model is involved, and the screen says so.
 */
export function estimateFromDescription(text: string, pool: Food[]): Estimate {
  const lower = text.toLowerCase()
  const sizeHit = SIZE_WORDS.find((s) => s.re.test(lower))
  const sizeFactor = sizeHit?.factor ?? 1

  const parsed = parseSpokenFood(text)
  const items: EstimateItem[] = []
  const unmatched: string[] = []

  for (const p of parsed) {
    const cleaned = p.query
      .replace(/\b(huge|massive|extra large|xl|large|big|generous|medium|regular|normal|small|little|light|tiny)\b/g, '')
      .trim()
    if (!cleaned) continue

    const food = searchLocal(cleaned, pool, 1)[0] ?? null
    if (!food) {
      unmatched.push(cleaned)
      items.push({ query: cleaned, qty: p.qty, food: null, nutrients: emptyNutrients() })
      continue
    }
    const serving = food.servings[0]
    const factor = serving.multiplier * p.qty * sizeFactor
    items.push({
      query: cleaned,
      qty: p.qty * sizeFactor,
      food,
      nutrients: scaleNutrients(food.nutrients, factor),
    })
  }

  return {
    items,
    totals: sumNutrients(items.map((i) => i.nutrients)),
    matched: items.filter((i) => i.food).length,
    unmatched,
  }
}

export function MealScan({ date }: { date: string }) {
  const app = useApp()
  const { pop, push, data } = app
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [photo, setPhoto] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setCameraError('Camera needs https (or localhost). You can choose a photo instead.')
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          await videoRef.current.play()
        }
      } catch {
        setCameraError('Camera access was blocked. Choose a photo from your device instead.')
      }
    }
    if (!photo) void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [photo])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  function capture() {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    // Cap the stored image — a full-res frame bloats localStorage fast.
    const scale = Math.min(1, 900 / v.videoWidth)
    canvas.width = v.videoWidth * scale
    canvas.height = v.videoHeight * scale
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height)
    setPhoto(canvas.toDataURL('image/jpeg', 0.75))
    stopCamera()
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(String(reader.result))
    reader.readAsDataURL(f)
    stopCamera()
  }

  async function runEstimate() {
    setWorking(true)
    const bulk = await loadFoodDb()
    setEstimate(estimateFromDescription(description, [...data.customFoods, ...bulk]))
    setWorking(false)
  }

  function logEstimate() {
    if (!estimate) return
    const food: Food = {
      id: uid('scan'),
      name: description.trim().slice(0, 60) || 'Scanned meal',
      nutrients: estimate.totals,
      servings: [{ label: 'meal', multiplier: 1 }],
      source: 'quick',
    }
    app.logFood({
      food,
      date,
      servings: 1,
      servingLabel: 'meal',
      nutrients: estimate.totals,
    })
    pop()
  }

  const t = estimate?.totals

  return (
    <>
      <TopBar title="Meal scan" onBack={pop} solid />
      <div className="scroll">
        {!photo ? (
          <>
            <div
              style={{
                position: 'relative',
                background: '#000',
                aspectRatio: '4 / 3',
                overflow: 'hidden',
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '10%',
                  border: '2px solid rgba(255,255,255,.85)',
                  borderRadius: 18,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  color: '#fff',
                  fontSize: 13,
                  textShadow: '0 1px 3px rgba(0,0,0,.85)',
                }}
              >
                Fit the whole plate in the frame
              </div>
            </div>

            {cameraError && <div className="hint">{cameraError}</div>}

            <div className="btn-wrap" style={{ display: 'grid', gap: 10 }}>
              <button className="btn" onClick={capture} disabled={!!cameraError}>
                <Icon name="camera" size={19} />
                Take photo
              </button>
              <label className="btn btn--ghost" style={{ cursor: 'pointer' }}>
                Choose a photo
                <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
              </label>
            </div>
          </>
        ) : (
          <>
            <img
              src={photo}
              alt="Your meal"
              style={{ width: '100%', display: 'block', aspectRatio: '4 / 3', objectFit: 'cover' }}
            />

            <div className="section-label">Describe the plate</div>
            <div className="card">
              <textarea
                value={description}
                autoFocus
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. grilled chicken breast, a cup of brown rice and a large serving of broccoli"
                style={{
                  width: '100%',
                  minHeight: 92,
                  border: 0,
                  background: 'transparent',
                  padding: 16,
                  resize: 'vertical',
                  outline: 'none',
                  fontSize: 15,
                  lineHeight: 1.5,
                }}
              />
            </div>
            <div className="hint">
              The estimate comes from your description, not the photo — no vision model is
              connected. Size words like <em>large</em> or <em>small</em> scale the portions.
            </div>

            <div className="btn-wrap" style={{ display: 'grid', gap: 10 }}>
              <button
                className="btn"
                disabled={description.trim().length < 3 || working}
                onClick={() => void runEstimate()}
              >
                {working ? 'Estimating…' : 'Estimate calories'}
              </button>
              <button className="btn btn--ghost" onClick={() => { setPhoto(null); setEstimate(null) }}>
                Retake
              </button>
            </div>

            {estimate && (
              <>
                <div className="section-label">Estimate</div>
                <div className="card">
                  <div style={{ padding: '16px 16px 8px', textAlign: 'center' }}>
                    <div
                      className="num"
                      style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.035em' }}
                    >
                      {cal(t!.calories)}
                    </div>
                    <div style={{ color: 'var(--text-2)', fontSize: 13.5 }}>estimated calories</div>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3,1fr)',
                      textAlign: 'center',
                      padding: '4px 16px 16px',
                    }}
                  >
                    {(
                      [
                        ['Carbs', t!.carbs, 'var(--carbs)'],
                        ['Fat', t!.fat, 'var(--fat)'],
                        ['Protein', t!.protein, 'var(--protein)'],
                      ] as [string, number, string][]
                    ).map(([label, v, color]) => (
                      <div key={label}>
                        <div className="num" style={{ fontSize: 18, fontWeight: 700, color }}>
                          {Math.round(v)} g
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  {estimate.items.map((it, i) => (
                    <Row
                      key={i}
                      title={it.food ? it.food.name : it.query}
                      sub={
                        it.food
                          ? `${Math.round(it.qty * 100) / 100} × ${it.food.servings[0].label}`
                          : 'No match — not counted'
                      }
                      value={it.food ? cal(it.nutrients.calories) : '—'}
                      right={
                        <button
                          className="iconbtn"
                          style={{ width: 32, height: 32, color: 'var(--danger)' }}
                          onClick={() =>
                            setEstimate({
                              ...estimate,
                              items: estimate.items.filter((_, k) => k !== i),
                              totals: sumNutrients(
                                estimate.items.filter((_, k) => k !== i).map((x) => x.nutrients)
                              ),
                            })
                          }
                          aria-label={`Remove ${it.query}`}
                        >
                          <Icon name="close" size={18} strokeWidth={2.4} />
                        </button>
                      }
                    />
                  ))}
                </div>

                {estimate.unmatched.length > 0 && (
                  <div className="hint">
                    Couldn&apos;t match: {estimate.unmatched.join(', ')}. Add them by hand from
                    the food search if they matter.
                  </div>
                )}

                <div className="btn-wrap" style={{ display: 'grid', gap: 10 }}>
                  <button className="btn" disabled={t!.calories <= 0} onClick={logEstimate}>
                    Log {cal(t!.calories)} cal
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={() => push({ name: 'foodSearch', date })}
                  >
                    Add items manually instead
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
