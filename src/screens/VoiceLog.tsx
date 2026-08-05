import { useEffect, useRef, useState } from 'react'
import type { Food } from '../types'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Row, TopBar } from '../components/ui'
import { cal } from '../lib/format'
import { scaleNutrients } from '../lib/nutrition'
import { searchLocal } from '../services/foodSearch'

/* ------------------------------------------------------------ speech API -- */

interface SpeechResultAlt {
  transcript: string
}
interface SpeechResult {
  0: SpeechResultAlt
  isFinal: boolean
  length: number
}
interface SpeechEvent {
  results: { length: number; [i: number]: SpeechResult }
  resultIndex: number
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: SpeechEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

function getRecognition(): Recognition | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

/* ---------------------------------------------------------------- parse -- */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25,
}

export interface ParsedItem {
  qty: number
  query: string
}

/**
 * Split a spoken sentence into quantity + food pairs.
 *
 * "two eggs and a cup of oatmeal with coffee" →
 *   [{qty:2, query:"eggs"}, {qty:1, query:"oatmeal"}, {qty:1, query:"coffee"}]
 *
 * Deliberately shallow: it splits on conjunctions, pulls a leading number, and
 * drops filler words. Anything it gets wrong is visible and editable before
 * anything is logged.
 */
/** Words that describe a portion rather than a food. */
const MEASURE_WORDS = new Set([
  'of', 'a', 'an', 'the', 'some', 'my', 'serving', 'servings', 'portion',
  'cup', 'cups', 'glass', 'glasses', 'bowl', 'bowls', 'plate', 'plates',
  'slice', 'slices', 'piece', 'pieces', 'scoop', 'scoops', 'handful',
  'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons',
  'oz', 'ounce', 'ounces', 'gram', 'grams', 'g', 'ml', 'can', 'bottle',
])

/** Size adjectives, stripped here so they never reach the search query. */
const SIZE_WORDS = new Set([
  'huge', 'massive', 'extra', 'xl', 'large', 'big', 'generous',
  'medium', 'regular', 'normal', 'small', 'little', 'light', 'tiny',
])

export function parseSpokenFood(text: string): ParsedItem[] {
  // Commas are separators, so they must survive until after the split.
  const cleaned = text
    .toLowerCase()
    .replace(/[.!?]/g, '')
    .replace(/\bi (had|ate|drank|have)\b/g, '')
    .replace(/\bfor (breakfast|lunch|dinner|a snack)\b/g, '')

  return cleaned
    .split(/\band\b|\bwith\b|\bplus\b|,/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const words = chunk.split(/\s+/).filter(Boolean)
      let qty = 1
      if (words.length && (NUMBER_WORDS[words[0]] !== undefined || parseFloat(words[0]))) {
        qty = NUMBER_WORDS[words[0]] ?? parseFloat(words[0])
        words.shift()
      }
      // Strip measure and size words wherever they sit, not just in front —
      // "small bowl of oatmeal" has to reduce to "oatmeal".
      const kept = words.filter((w) => !MEASURE_WORDS.has(w) && !SIZE_WORDS.has(w))
      return { qty: qty || 1, query: kept.join(' ').trim() }
    })
    .filter((x) => x.query.length > 1)
}

/* --------------------------------------------------------------- screen -- */

interface Match extends ParsedItem {
  food: Food | null
}

export function VoiceLog({ date }: { date: string }) {
  const app = useApp()
  const { pop, data, push } = app
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<Match[] | null>(null)
  const recRef = useRef<Recognition | null>(null)
  const supported = typeof window !== 'undefined' && getRecognition() !== null

  useEffect(() => () => recRef.current?.stop(), [])

  function start() {
    const rec = getRecognition()
    if (!rec) {
      setError('Voice input needs the Web Speech API — available in Chrome, Edge and Safari.')
      return
    }
    recRef.current = rec
    rec.lang = 'en-US'
    rec.continuous = false
    rec.interimResults = true
    setError(null)
    setMatches(null)
    setTranscript('')
    setListening(true)

    rec.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      setTranscript(text)
    }
    rec.onerror = (e) => {
      setError(
        e.error === 'not-allowed'
          ? 'Microphone access was blocked. Allow it, or type what you ate below.'
          : `Could not hear that (${e.error}).`
      )
      setListening(false)
    }
    rec.onend = () => setListening(false)
    rec.start()
  }

  function resolve(text: string) {
    const parsed = parseSpokenFood(text)
    setMatches(
      parsed.map((p) => ({
        ...p,
        food: searchLocal(p.query, data.customFoods, 1)[0] ?? null,
      }))
    )
  }

  function logAll() {
    for (const m of matches ?? []) {
      if (!m.food) continue
      const serving = m.food.servings[0]
      app.logFood({
        food: m.food,
        date,
        servings: m.qty,
        servingLabel: serving.label,
        nutrients: scaleNutrients(m.food.nutrients, serving.multiplier * m.qty),
      })
    }
    pop()
  }

  const resolved = (matches ?? []).filter((m) => m.food)
  const totalCal = resolved.reduce(
    (s, m) => s + m.food!.nutrients.calories * m.food!.servings[0].multiplier * m.qty,
    0
  )

  return (
    <>
      <TopBar title="Voice log" onBack={pop} solid />
      <div className="scroll">
        {/* Mic first: the whole point is speaking, not reading instructions. */}
        <div style={{ textAlign: 'center', padding: '30px 20px 18px' }}>
          <button
            onClick={listening ? () => recRef.current?.stop() : start}
            aria-label={listening ? 'Stop listening' : 'Start listening'}
            style={{
              width: 108,
              height: 108,
              borderRadius: 999,
              background: listening ? 'var(--danger)' : 'var(--accent)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto',
              boxShadow: listening ? '0 0 0 12px rgba(224,47,69,.16)' : 'var(--shadow-2)',
              transition: 'box-shadow .25s, background .２s',
            }}
          >
            <Icon name="mic" size={44} strokeWidth={1.8} />
          </button>
          <div style={{ marginTop: 16, fontSize: 15, color: 'var(--text-2)' }}>
            {listening ? 'Listening — say what you ate' : 'Tap and say what you ate'}
          </div>
          {!listening && !transcript && (
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-3)' }}>
              e.g. &ldquo;two eggs and a cup of oatmeal&rdquo;
            </div>
          )}
        </div>

        {(transcript || !supported) && (
          <div className="card">
            <label className="field" style={{ alignItems: 'flex-start' }}>
              <span className="field__label" style={{ paddingTop: 4 }}>
                Heard
              </span>
              <span className="field__control">
                <input
                  className="input"
                  value={transcript}
                  placeholder="Type what you ate"
                  onChange={(e) => setTranscript(e.target.value)}
                />
              </span>
            </label>
          </div>
        )}

        {error && <div className="hint">{error}</div>}

        {transcript && !matches && (
          <div className="btn-wrap">
            <button className="btn" onClick={() => resolve(transcript)}>
              Find these foods
            </button>
          </div>
        )}

        {matches && (
          <>
            <div className="section-head">
              <span>Found</span>
              <span className="num" style={{ fontSize: 15, color: 'var(--text-2)' }}>
                {cal(totalCal)} cal
              </span>
            </div>
            <div className="card">
              {matches.map((m, i) => (
                <Row
                  key={i}
                  title={m.food ? m.food.name : m.query}
                  sub={
                    m.food
                      ? `${m.qty} × ${m.food.servings[0].label}`
                      : 'No match — tap to search manually'
                  }
                  value={
                    m.food
                      ? cal(m.food.nutrients.calories * m.food.servings[0].multiplier * m.qty)
                      : undefined
                  }
                  right={
                    <button
                      className="iconbtn"
                      style={{ width: 32, height: 32, color: 'var(--danger)' }}
                      onClick={() => setMatches(matches.filter((_, k) => k !== i))}
                      aria-label={`Remove ${m.query}`}
                    >
                      <Icon name="close" size={18} strokeWidth={2.4} />
                    </button>
                  }
                  onClick={
                    m.food ? undefined : () => push({ name: 'foodSearch', date })
                  }
                />
              ))}
            </div>
            <div className="btn-wrap" style={{ display: 'grid', gap: 10 }}>
              <button className="btn" disabled={resolved.length === 0} onClick={logAll}>
                Log {resolved.length} item{resolved.length === 1 ? '' : 's'}
              </button>
              <button className="btn btn--ghost" onClick={() => setMatches(null)}>
                Try again
              </button>
            </div>
          </>
        )}

        <div className="hint">
          Matching runs against the built-in database on this device — nothing is sent
          anywhere. Everything is shown for review before it&apos;s logged.
        </div>
      </div>
    </>
  )
}
