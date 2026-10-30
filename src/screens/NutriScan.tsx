import { useState } from 'react'
import type { NutrientKey } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Row, TopBar } from '../components/ui'
import { NUTRIENTS, SHORT_LABELS } from '../data/nutrients'
import { useRearCamera } from '../lib/useCamera'
import { ocrSupported, prepareForOcr, recogniseText } from '../services/ocr'
import { parseNutritionLabel, type LabelReading } from '../lib/nutritionLabel'

/**
 * Label scan (screen file kept as NutriScan): photograph the Nutrition Facts panel and the figures are read
 * off it, on the phone, with no server.
 *
 * The reading is never logged straight away. It lands in the create-food
 * form with every field filled in, so the user names the food and checks
 * the numbers against the packet before anything is saved; OCR on a curved,
 * glossy label gets a digit wrong often enough that a look is worth it.
 */
type Phase = 'camera' | 'reading' | 'result' | 'failed'

const STAGE_LABEL: Record<string, string> = {
  'loading tesseract core': 'Loading the reader',
  'initializing tesseract': 'Starting the reader',
  'loading language traineddata': 'Loading the reader',
  'initializing api': 'Starting the reader',
  'recognizing text': 'Reading the label',
}

export function NutriScan({ date }: { date: string }) {
  const { pop, push } = useApp()
  const [phase, setPhase] = useState<Phase>('camera')
  const [photo, setPhoto] = useState<string | null>(null)
  const [stage, setStage] = useState('Reading the label')
  const [progress, setProgress] = useState(0)
  const [reading, setReading] = useState<LabelReading | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const cam = useRearCamera(phase === 'camera')

  async function read(image: string) {
    setPhoto(image)
    setPhase('reading')
    setProgress(0)
    setStage('Preparing the photo')
    try {
      const prepared = await prepareForOcr(image)
      const text = await recogniseText(prepared, (p) => {
        setStage(STAGE_LABEL[p.status] ?? 'Reading the label')
        setProgress(p.status === 'recognizing text' ? p.progress : 0)
      })
      const r = parseNutritionLabel(text)
      setReading(r)
      if (r.found < 2) {
        setProblem(null)
        setPhase('failed')
      } else {
        setPhase('result')
      }
    } catch (err) {
      setProblem((err as Error).message || 'The reader could not start.')
      setPhase('failed')
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const fr = new FileReader()
    fr.onload = () => void read(String(fr.result))
    fr.readAsDataURL(f)
    cam.stop()
  }

  function retake() {
    setPhoto(null)
    setReading(null)
    setProblem(null)
    setPhase('camera')
  }

  function useReading() {
    if (!reading) return
    pop()
    push({
      name: 'createFood',
      returnTo: { date },
      prefill: {
        values: reading.values,
        servingLabel: reading.servingLabel,
        servingGrams: reading.servingGrams,
      },
    })
  }

  const shown = reading
    ? NUTRIENTS.filter((d) => reading.values[d.key as NutrientKey] != null)
    : []

  return (
    <>
      <TopBar title="Label scan" onBack={pop} solid />
      <div className="scroll">
        {phase === 'camera' && (
          <>
            <div
              style={{
                position: 'relative',
                background: '#000',
                aspectRatio: '3 / 4',
                overflow: 'hidden',
              }}
            >
              <video
                ref={cam.videoRef}
                playsInline
                muted
                autoPlay
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '8% 12%',
                  border: '2px solid rgba(255,255,255,.85)',
                  borderRadius: 14,
                  boxShadow: '0 0 0 999px rgba(0,0,0,.28)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 14,
                  textAlign: 'center',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  textShadow: '0 1px 2px rgba(0,0,0,.6)',
                }}
              >
                {cam.error ? '' : 'Fill the frame with the Nutrition Facts panel'}
              </div>
            </div>
            {cam.error && <div className="hint">{cam.error}</div>}

            <div className="btn-wrap" style={{ gap: 10 }}>
              {!cam.error && (
                <button
                  className="btn"
                  onClick={() => {
                    const shot = cam.capture()
                    if (shot) void read(shot)
                  }}
                >
                  Take photo
                </button>
              )}
              <label className="btn btn--ghost" style={{ cursor: 'pointer' }}>
                Choose a photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onFile}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            <div className="hint">
              Hold the phone square to the panel, in good light, close enough that the
              text is sharp. The figures are read on this device; nothing is uploaded.
            </div>
            {!ocrSupported() && (
              <div className="hint" style={{ color: 'var(--warning)' }}>
                This browser cannot run the reader. Use the app on your phone.
              </div>
            )}
          </>
        )}

        {phase === 'reading' && (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            {photo && (
              <img
                src={photo}
                alt=""
                style={{ width: 160, borderRadius: 12, boxShadow: 'var(--shadow-card)' }}
              />
            )}
            <div style={{ fontWeight: 700, fontSize: 16, marginTop: 18 }}>{stage}…</div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: 'var(--surface-3)',
                overflow: 'hidden',
                margin: '12px auto 0',
                maxWidth: 240,
              }}
            >
              <div
                style={{
                  width: `${Math.round(progress * 100)}%`,
                  height: '100%',
                  background: 'var(--accent)',
                  transition: 'width .2s',
                }}
              />
            </div>
            <div className="hint">The first scan takes a few seconds longer while the reader loads.</div>
          </div>
        )}

        {phase === 'result' && reading && (
          <>
            <div className="hint" style={{ paddingTop: 14 }}>
              Read {reading.found} figure{reading.found === 1 ? '' : 's'}
              {reading.servingLabel ? ` for ${reading.servingLabel}` : ''}
              {reading.per100g ? ' (per 100 g)' : ''}. Check them against the packet; you
              can fix any of them on the next screen.
            </div>
            <div className="card">
              {shown.map((d) => (
                <Row
                  key={d.key}
                  title={SHORT_LABELS[d.key] ?? d.label}
                  value={`${reading.values[d.key as NutrientKey]} ${d.unit === 'cal' ? 'cal' : d.unit}`}
                />
              ))}
            </div>
            <div className="btn-wrap" style={{ gap: 10 }}>
              <button className="btn" onClick={useReading}>
                Looks right, name the food
              </button>
              <button className="btn btn--ghost" onClick={retake}>
                Retake
              </button>
            </div>
          </>
        )}

        {phase === 'failed' && (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <span style={{ color: 'var(--text-3)', display: 'inline-flex' }}>
              <Icon name="nutriscan" size={40} />
            </span>
            <div style={{ fontWeight: 700, fontSize: 17, marginTop: 12 }}>
              {problem ? 'The reader could not start' : "Couldn't read that one"}
            </div>
            <div className="hint">
              {problem ??
                'Try again with the panel flat, filling the frame, and no glare across the numbers.'}
            </div>
            <div className="btn-wrap" style={{ gap: 10 }}>
              <button className="btn" onClick={retake}>
                Try again
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  pop()
                  push({ name: 'createFood', returnTo: { date } })
                }}
              >
                Type it in instead
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
