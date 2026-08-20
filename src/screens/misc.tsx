import { useEffect, useRef, useState } from 'react'
import type { Food } from '../types'
import { useApp } from '../state/store'
import { Icon, type IconName } from '../components/Icon'
import { Row, TopBar } from '../components/ui'
import { emptyNutrients } from '../lib/nutrition'
import { uid } from '../lib/id'
import { cal } from '../lib/format'
import { ML_PER_CUP, displayToMl, mlToDisplay, waterUnitLabel } from '../lib/units'
import { barcodeScanSupported, getBarcodeDetector, lookupBarcode } from '../services/openFoodFacts'

/* ------------------------------------------------------------- quick add -- */

export function QuickAdd({ date }: { date: string }) {
  const { pop, logFood } = useApp()
  const [calories, setCalories] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [protein, setProtein] = useState('')

  function save() {
    const kcal = parseFloat(calories)
    if (!Number.isFinite(kcal) || kcal <= 0) return
    const n = {
      ...emptyNutrients(),
      calories: kcal,
      carbs: parseFloat(carbs) || 0,
      fat: parseFloat(fat) || 0,
      protein: parseFloat(protein) || 0,
    }
    const food: Food = {
      id: uid('q'),
      name: 'Quick Add',
      nutrients: n,
      servings: [{ label: 'entry', multiplier: 1 }],
      source: 'quick',
    }
    logFood({ food, date, servings: 1, servingLabel: 'entry', nutrients: n })
    pop()
  }

  return (
    <>
      <TopBar
        title="Quick Add"
        onBack={pop}
        right={
          <button className="textbtn" disabled={!parseFloat(calories)} onClick={save}>
            Add
          </button>
        }
      />
      <div className="scroll">
        <div className="hint" style={{ paddingTop: 14 }}>
          Log calories without picking a food. Macros are optional.
        </div>
        <div className="card">
          <label className="field">
            <span className="field__label">Calories</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="numeric"
                autoFocus
                placeholder="0"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
              />
            </span>
          </label>
          <label className="field">
            <span className="field__label">Carbohydrates</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
              />
              <span className="unit">g</span>
            </span>
          </label>
          <label className="field">
            <span className="field__label">Fat</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
              />
              <span className="unit">g</span>
            </span>
          </label>
          <label className="field">
            <span className="field__label">Protein</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
              />
              <span className="unit">g</span>
            </span>
          </label>
        </div>
        <div className="btn-wrap">
          <button className="btn" disabled={!parseFloat(calories)} onClick={save}>
            Add to today
          </button>
        </div>
      </div>
    </>
  )
}

/* ----------------------------------------------------------------- water -- */

export function WaterScreen({ date }: { date: string }) {
  const { pop, dayLog, setWater, settings, profile, waterTarget, latestWeight, age, totalsFor } =
    useApp()
  const log = dayLog(date)
  const unit = settings.waterUnit
  const shown = mlToDisplay(log.water, unit)
  const goal = mlToDisplay(waterTarget, unit)
  const pctFull = waterTarget > 0 ? Math.min(1, log.water / waterTarget) : 0
  const glasses = Math.ceil(waterTarget / ML_PER_CUP)
  const filled = Math.round(log.water / ML_PER_CUP)
  const exMin = totalsFor(date).exerciseMinutes

  const quickAmounts = unit === 'ml' ? [250, 500, 750] : [1, 2, 3]
  const fmt = (v: number) => (unit === 'ml' ? Math.round(v) : Math.round(v * 10) / 10)

  return (
    <>
      <TopBar title="Water" onBack={pop} />
      <div className="scroll">
        {/* A bottle that actually fills, far more motivating than a number. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            padding: '24px 20px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <svg width="86" height="150" viewBox="0 0 86 150" aria-hidden="true">
            <defs>
              <clipPath id="bottleClip">
                <path d="M28 20 h30 v10 a16 16 0 0 1 10 15 v90 a12 12 0 0 1 -12 12 h-26 a12 12 0 0 1 -12 -12 v-90 a16 16 0 0 1 10 -15 z" />
              </clipPath>
            </defs>
            <rect
              x="0"
              y={30 + (1 - pctFull) * 117}
              width="86"
              height={pctFull * 117 + 3}
              fill="var(--water)"
              clipPath="url(#bottleClip)"
              opacity="0.9"
              style={{ transition: 'y .45s ease, height .45s ease' }}
            />
            <path
              d="M28 20 h30 v10 a16 16 0 0 1 10 15 v90 a12 12 0 0 1 -12 12 h-26 a12 12 0 0 1 -12 -12 v-90 a16 16 0 0 1 10 -15 z"
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth="2.5"
            />
            <rect x="32" y="8" width="22" height="12" rx="3" fill="var(--border-strong)" />
          </svg>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="num"
              style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.05 }}
            >
              {fmt(shown)}
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-2)' }}>
                {' '}
                / {fmt(goal)} {waterUnitLabel(unit)}
              </span>
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: 13.5, marginTop: 4 }}>
              {log.water >= waterTarget
                ? "Goal reached, nice."
                : `${fmt(mlToDisplay(waterTarget - log.water, unit))} ${waterUnitLabel(unit)} to go`}
            </div>
            <div className="progress" style={{ marginTop: 12 }}>
              <div
                className="progress__fill"
                style={{ width: `${pctFull * 100}%`, background: 'var(--water)' }}
              />
            </div>
          </div>
        </div>

        {/* Tap the glass you're on, sets the total, rather than nudging it. */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
            padding: '18px 16px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {Array.from({ length: Math.max(8, glasses) }).map((_, i) => (
            <button
              key={i}
              onClick={() =>
                setWater(date, filled === i + 1 ? i * ML_PER_CUP : (i + 1) * ML_PER_CUP)
              }
              style={{ color: i < filled ? 'var(--water)' : 'var(--border-strong)', display: 'flex' }}
              aria-label={`Set to ${i + 1} glasses`}
            >
              <Icon name="water" size={30} strokeWidth={i < filled ? 0 : 1.8} />
            </button>
          ))}
        </div>

        <div className="chips" style={{ justifyContent: 'center' }}>
          {quickAmounts.map((a) => (
            <button
              key={a}
              className="chip"
              onClick={() => setWater(date, log.water + displayToMl(a, unit))}
            >
              +{a} {waterUnitLabel(unit, a)}
            </button>
          ))}
          <button className="chip" onClick={() => setWater(date, 0)}>
            Reset
          </button>
        </div>

        <div className="card">
          <label className="field">
            <span className="field__label">Set exact amount</span>
            <span className="field__control">
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={fmt(shown)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setWater(date, Number.isFinite(v) ? displayToMl(v, unit) : 0)
                }}
              />
              <span className="unit">{waterUnitLabel(unit)}</span>
            </span>
          </label>
        </div>

        <div className="section-label">How your goal is set</div>
        <div className="card">
          <Row title="Body weight" value={`${Math.round(latestWeight)} lb`} />
          <Row title="Age" value={age} />
          <Row title="Activity level" value={profile.activityLevel.replace(/-/g, ' ')} />
          <Row title="Exercise today" value={`${exMin} min`} />
          <Row
            title="Daily target"
            value={`${fmt(goal)} ${waterUnitLabel(unit)}`}
          />
        </div>
        <div className="hint">
          Your target scales with body mass, then adds an allowance for how active you
          are, your height, and about 12 ml for every minute of logged exercise. Override
          it any time in Settings.
        </div>
      </div>
    </>
  )
}

/* --------------------------------------------------------------- scanner -- */

export function BarcodeScanner({ date }: { date: string }) {
  const { pop, push } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'looking' | 'error'>(
    'starting'
  )
  const [message, setMessage] = useState('')
  const [manual, setManual] = useState('')
  const supported = barcodeScanSupported()
  const handled = useRef(false)

  useEffect(() => {
    if (!supported) {
      setStatus('error')
      setMessage(
        'Live scanning needs a camera and the Barcode Detection API, available in Chrome, Edge and Android. Enter the number below instead.'
      )
      return
    }

    let stream: MediaStream | null = null
    let raf = 0
    const detector = getBarcodeDetector()

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setStatus('scanning')
        tick()
      } catch {
        setStatus('error')
        setMessage('Camera access was blocked. Enter the barcode number below instead.')
      }
    }

    async function tick() {
      const video = videoRef.current
      if (!video || !detector || handled.current) return
      try {
        const codes = await detector.detect(video)
        if (codes.length > 0 && codes[0].rawValue) {
          handled.current = true
          void resolve(codes[0].rawValue)
          return
        }
      } catch {
        /* transient decode failures are expected between frames */
      }
      raf = requestAnimationFrame(tick)
    }

    void start()
    return () => {
      handled.current = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [supported])

  async function resolve(code: string) {
    setStatus('looking')
    try {
      const food = await lookupBarcode(code)
      if (food) {
        pop()
        push({ name: 'foodDetail', food, date })
      } else {
        pop()
        push({ name: 'createFood', barcode: code, returnTo: { date } })
      }
    } catch {
      setStatus('error')
      setMessage('Lookup failed. Check your connection and try again.')
      handled.current = false
    }
  }

  return (
    <>
      <TopBar title="Scan a Barcode" onBack={pop} />
      <div className="scroll">
        {supported && status !== 'error' && (
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
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div
              style={{
                position: 'absolute',
                inset: '22% 10%',
                border: '2px solid rgba(255,255,255,.85)',
                borderRadius: 12,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '10%',
                right: '10%',
                top: '50%',
                height: 2,
                background: 'var(--danger)',
                boxShadow: '0 0 8px var(--danger)',
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
                textShadow: '0 1px 3px rgba(0,0,0,.8)',
              }}
            >
              {status === 'looking' ? 'Looking up product…' : 'Center the barcode in the frame'}
            </div>
          </div>
        )}

        {message && <div className="hint">{message}</div>}

        <div className="section-label">Enter Barcode Manually</div>
        <div className="card">
          <label className="field">
            <span className="field__label">UPC / EAN</span>
            <span className="field__control">
              <input
                className="input"
                inputMode="numeric"
                placeholder="0123456789012"
                value={manual}
                onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
              />
            </span>
          </label>
        </div>
        <div className="btn-wrap">
          <button
            className="btn"
            disabled={manual.length < 8 || status === 'looking'}
            onClick={() => void resolve(manual)}
          >
            {status === 'looking' ? 'Looking up…' : 'Look Up'}
          </button>
        </div>
        <div className="hint">
          Barcodes resolve against Open Food Facts, a community food database. If a
          product isn&apos;t there you&apos;ll be taken straight to Create Food with the
          number filled in.
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------- FAB sheet -- */

export function AddSheetContent({
  date,
  onClose,
}: {
  date: string
  onClose(): void
}) {
  const { push } = useApp()
  const go = (fn: () => void) => () => {
    onClose()
    fn()
  }

  /* The four ways in, as tiles rather than a list, they're peers, and a grid
     says that better than stacked rows do. */
  const tiles: { icon: IconName; label: string; sub: string; onClick(): void }[] = [
    {
      icon: 'barcode',
      label: 'Barcode scan',
      sub: 'Point at a package',
      onClick: go(() => push({ name: 'scan', date })),
    },
    {
      icon: 'mic',
      label: 'Voice log',
      sub: 'Say what you ate',
      onClick: go(() => push({ name: 'voiceLog', date })),
    },
    {
      icon: 'mealscan',
      label: 'Meal scan',
      sub: 'Photograph a plate',
      onClick: go(() => push({ name: 'mealScan', date })),
    },
    {
      icon: 'plus',
      label: 'Quick add',
      sub: 'Calories only',
      onClick: go(() => push({ name: 'quickAdd', date })),
    },
  ]

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          padding: '4px 14px 14px',
        }}
      >
        {tiles.map((t) => (
          <button
            key={t.label}
            onClick={t.onClick}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 8,
              padding: '16px 14px',
              borderRadius: 14,
              background: 'var(--surface-3)',
              textAlign: 'left',
            }}
          >
            <span style={{ color: 'var(--accent)', display: 'flex' }}>
              <Icon name={t.icon} size={24} />
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 15 }}>{t.label}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-2)' }}>
                {t.sub}
              </span>
            </span>
          </button>
        ))}
      </div>

      <Row
        title="Search the food database"
        left={
          <span style={{ color: 'var(--accent)', display: 'flex' }}>
            <Icon name="search" size={20} />
          </span>
        }
        onClick={go(() => push({ name: 'foodSearch', date }))}
      />
      <Row
        title="Exercise"
        left={
          <span style={{ color: 'var(--accent)', display: 'flex' }}>
            <Icon name="dumbbell" size={20} />
          </span>
        }
        onClick={go(() => push({ name: 'exerciseSearch', date, kind: 'cardio' }))}
      />
      <Row
        title="Weight"
        left={
          <span style={{ color: 'var(--accent)', display: 'flex' }}>
            <Icon name="scale" size={20} />
          </span>
        }
        onClick={go(() => push({ name: 'weightEntry' }))}
      />
      <Row
        title="Water"
        left={
          <span style={{ color: 'var(--accent)', display: 'flex' }}>
            <Icon name="water" size={20} />
          </span>
        }
        onClick={go(() => push({ name: 'water', date }))}
      />
    </>
  )
}

export { cal }
