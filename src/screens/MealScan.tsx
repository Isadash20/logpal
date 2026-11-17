import { useState } from 'react'
import type { Food, Nutrients } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { FullCamera } from '../components/FullCamera'
import { Row, TopBar } from '../components/ui'
import { cal } from '../lib/format'
import { ZERO_NUTRIENTS, emptyNutrients, scaleNutrients, sumNutrients } from '../lib/nutrition'
import { uid } from '../lib/id'
import { searchLocal } from '../services/foodSearch'
import { loadFoodDb } from '../services/foodDb'
import { parseSpokenFood } from '../lib/spokenFood'
import { MealScanError, scanMeal, type ScannedItem } from '../services/mealScan'

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
 * Turn a written description into a nutrition estimate, with no model.
 *
 * Each phrase is matched against the food database and scaled by any quantity
 * or size word attached to it. This is the fallback when the user is signed
 * out or offline; the photo is not consulted and the screen says so.
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

/* ------------------------------------------------------------ screen -- */

type Phase = 'camera' | 'describe' | 'result'

/** One line of the result list: the model's item plus the user's edits. */
interface Line {
  id: string
  item: ScannedItem
  /** Grams after the user adjusted them; starts at the model's figure. */
  grams: number
}

function lineNutrients(l: Line): Nutrients {
  const f = l.item.grams > 0 ? l.grams / l.item.grams : 1
  const it = l.item
  return {
    ...ZERO_NUTRIENTS,
    calories: it.calories * f,
    protein: it.protein * f,
    carbs: it.carbs * f,
    fat: it.fat * f,
    fiber: it.fiber * f,
    sugar: it.sugar * f,
    sodium: it.sodium * f,
  }
}

/** The words-only estimate reshaped into result lines so one list renders both. */
function linesFromEstimate(e: Estimate): Line[] {
  return e.items
    .filter((i) => i.food)
    .map((i) => {
      const serving = i.food!.servings[0]
      const grams = Math.round((serving.grams ?? 0) * i.qty)
      return {
        id: uid('ln'),
        grams,
        item: {
          name: i.food!.name,
          portion: `${Math.round(i.qty * 100) / 100} × ${serving.label}`,
          grams,
          calories: i.nutrients.calories,
          protein: i.nutrients.protein,
          carbs: i.nutrients.carbs,
          fat: i.nutrients.fat,
          fiber: i.nutrients.fiber,
          sugar: i.nutrients.sugar,
          sodium: i.nutrients.sodium,
          confidence: 'low',
        },
      }
    })
}

export function MealScan({ date }: { date: string }) {
  const app = useApp()
  const { pop, push, data, profile, session, setLocalOnly } = app

  const [phase, setPhase] = useState<Phase>('camera')
  const [photo, setPhoto] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [working, setWorking] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [sizing, setSizing] = useState('')
  const [source, setSource] = useState<'ai' | 'words'>('ai')
  const [problem, setProblem] = useState<string | null>(null)
  const [needsSignIn, setNeedsSignIn] = useState(false)

  const signedIn = !!session

  async function runWords() {
    await loadFoodDb()
    const e = estimateFromDescription(description, data.customFoods)
    setLines(linesFromEstimate(e))
    setSizing(
      e.unmatched.length
        ? `Estimated from your words, not the photo. Couldn't match: ${e.unmatched.join(', ')}.`
        : 'Estimated from your words, not the photo. Portions are database defaults.'
    )
    setSource('words')
    setPhase('result')
  }

  async function runScan() {
    if (!photo) return
    setWorking(true)
    setProblem(null)
    setNeedsSignIn(false)
    try {
      const r = await scanMeal({ image: photo, description, profile })
      setLines(r.items.map((item) => ({ id: uid('ln'), item, grams: item.grams })))
      setSizing(r.sizing)
      setSource('ai')
      setPhase('result')
    } catch (err) {
      const e = err as MealScanError
      setProblem(e.message || 'Meal scan failed.')
      setNeedsSignIn(!!e.needsSignIn)
    } finally {
      setWorking(false)
    }
  }

  function setGrams(id: string, grams: number) {
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, grams: Math.max(0, grams) } : l)))
  }

  function logAll() {
    for (const l of lines) {
      if (l.grams <= 0) continue
      const nutrients = lineNutrients(l)
      const label = l.grams > 0 ? `${l.grams} g` : l.item.portion
      const food: Food = {
        id: uid('scan'),
        name: l.item.name,
        nutrients,
        servings: [{ label, grams: l.grams || undefined, multiplier: 1 }],
        source: 'quick',
      }
      app.logFood({ food, date, servings: 1, servingLabel: label, nutrients })
    }
    pop()
  }

  const totals = sumNutrients(lines.map(lineNutrients))

  if (phase === 'camera') {
    return (
      <FullCamera
        title="Meal scan"
        hint={
          profile.handSpan
            ? 'Get the whole plate in, with your hand flat beside it for scale'
            : 'Get the whole plate in the frame, from straight above if you can'
        }
        onClose={pop}
        onCapture={(url) => {
          setPhoto(url)
          setPhase('describe')
        }}
      />
    )
  }

  return (
    <>
      <TopBar title="Meal scan" onBack={pop} solid />
      <div className="scroll">
        {photo && (
          <img
            src={photo}
            alt="Your meal"
            style={{
              display: 'block',
              width: 'calc(100% - 2 * var(--gutter))',
              margin: '12px auto 0',
              maxHeight: '38vh',
              objectFit: 'cover',
              borderRadius: 'var(--r-card)',
            }}
          />
        )}

        {phase === 'describe' && (
          <>
            <div className="section-label">What&apos;s on the plate?</div>
            <div className="card">
              <textarea
                value={description}
                autoFocus
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. grilled chicken thigh, about a cup of jasmine rice, steamed broccoli with a little butter"
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
              Name the foods and any amounts you know. Your words decide <em>what</em> it is; the
              photo decides <em>how much</em>
              {profile.handSpan ? ', using your hand for scale' : ''}.
            </div>

            {problem && (
              <div className="hint" style={{ color: 'var(--danger)' }}>
                {problem}
              </div>
            )}

            <div className="btn-wrap" style={{ display: 'grid', gap: 10 }}>
              {signedIn ? (
                <button className="btn" disabled={working} onClick={() => void runScan()}>
                  {working ? 'Reading the plate…' : 'Scan plate'}
                </button>
              ) : (
                <button className="btn" onClick={() => setLocalOnly(false)}>
                  Sign in to scan the photo
                </button>
              )}
              {needsSignIn && signedIn && (
                <button className="btn btn--ghost" onClick={() => setLocalOnly(false)}>
                  Sign in again
                </button>
              )}
              <button
                className="btn btn--ghost"
                disabled={description.trim().length < 3 || working}
                onClick={() => void runWords()}
              >
                Estimate from my words only
              </button>
              <button
                className="btn btn--ghost"
                disabled={working}
                onClick={() => {
                  setPhoto(null)
                  setProblem(null)
                  setPhase('camera')
                }}
              >
                Retake
              </button>
            </div>
            {!signedIn && (
              <div className="hint">
                Reading the photo runs on LogPal&apos;s servers and needs an account. Without one you
                can still estimate from your words.
              </div>
            )}
          </>
        )}

        {phase === 'result' && (
          <>
            <div className="section-label">Estimate</div>
            <div className="card">
              <div style={{ padding: '16px 16px 8px', textAlign: 'center' }}>
                <div className="num" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.035em' }}>
                  {cal(totals.calories)}
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
                    ['Carbs', totals.carbs, 'var(--carbs)'],
                    ['Fat', totals.fat, 'var(--fat)'],
                    ['Protein', totals.protein, 'var(--protein)'],
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

            {lines.length > 0 ? (
              <div className="card">
                {lines.map((l) => (
                  <Row
                    key={l.id}
                    title={l.item.name}
                    sub={
                      <>
                        {l.item.portion}
                        {l.item.confidence === 'low' ? ' · unsure' : ''}
                      </>
                    }
                    value={cal(lineNutrients(l).calories)}
                    right={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <input
                          className="scan-g"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={l.grams}
                          onChange={(e) => setGrams(l.id, Number(e.target.value))}
                          aria-label={`Grams of ${l.item.name}`}
                        />
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>g</span>
                        <button
                          className="iconbtn"
                          style={{ width: 32, height: 32, color: 'var(--danger)' }}
                          onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                          aria-label={`Remove ${l.item.name}`}
                        >
                          <Icon name="close" size={18} strokeWidth={2.4} />
                        </button>
                      </span>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="hint">Nothing recognised. Try again with a description.</div>
            )}

            {sizing && <div className="hint">{sizing}</div>}
            {source === 'ai' && (
              <div className="hint">Change any gram figure and the calories follow. Each item is logged on its own line.</div>
            )}

            <div className="btn-wrap" style={{ display: 'grid', gap: 10 }}>
              <button className="btn" disabled={totals.calories <= 0} onClick={logAll}>
                Log {cal(totals.calories)} cal
              </button>
              <button className="btn btn--ghost" onClick={() => setPhase('describe')}>
                Change the description and rescan
              </button>
              <button className="btn btn--ghost" onClick={() => push({ name: 'foodSearch', date })}>
                Add items manually instead
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
