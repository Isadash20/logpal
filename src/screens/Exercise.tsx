import { useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { Empty, Row, Tabs, TopBar } from '../components/ui'
import { Icon } from '../components/Icon'
import { EXERCISE_BY_ID, searchExercises } from '../data/exercises'
import { caloriesBurned } from '../lib/nutrition'
import { estimate, paceLabel, type Tier } from '../lib/exercise'
import { cal } from '../lib/format'
import type { ExerciseKind } from '../types'

type Kind = ExerciseKind

const TABS: { key: Kind; label: string }[] = [
  { key: 'cardio', label: 'Cardio' },
  { key: 'strength', label: 'Strength' },
  { key: 'sports', label: 'Sports' },
]

const MI_PER_KM = 0.621371
const FT_PER_M = 3.2808

export function ExerciseSearch({ date, kind: initialKind }: { date: string; kind: Kind }) {
  const { pop, push, data, latestWeight } = useApp()
  const [kind, setKind] = useState<Kind>(initialKind)
  const [query, setQuery] = useState('')

  const results = useMemo(() => searchExercises(query, kind), [query, kind])

  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: { id?: string; name: string }[] = []
    for (const e of [...data.exerciseEntries].reverse()) {
      if (e.kind !== kind || seen.has(e.name)) continue
      seen.add(e.name)
      out.push({ id: e.exerciseId, name: e.name })
      if (out.length >= 8) break
    }
    return out
  }, [data.exerciseEntries, kind])

  const open = (exerciseId: string | undefined, name: string) => {
    const def = exerciseId ? EXERCISE_BY_ID.get(exerciseId) : undefined
    push({ name: 'exerciseDetail', date, kind: def?.kind === 'strength' ? 'strength' : kind, exerciseId, name_: name })
  }

  return (
    <>
      <TopBar title="Add Exercise" onBack={pop} />
      <Tabs<Kind> active={kind} onChange={setKind} tabs={TABS} />

      <div className="searchbar">
        <div className="searchbar__box">
          <Icon name="search" size={17} />
          <input
            className="searchbar__input"
            placeholder={kind === 'sports' ? 'Search sports' : `Search ${kind} exercises`}
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="scroll">
        {!query && recent.length > 0 && (
          <>
            <div className="section-label">Recent</div>
            {recent.map((r) => (
              <Row key={r.name} title={r.name} chevron onClick={() => open(r.id, r.name)} />
            ))}
          </>
        )}

        <div className="section-label">{query ? 'Results' : kind === 'sports' ? 'All sports' : 'All exercises'}</div>
        {results.length === 0 ? (
          <>
            <Empty title="No matches" />
            <div className="btn-wrap">
              <button className="btn btn--ghost" onClick={() => push({ name: 'exerciseDetail', date, kind, name_: query.trim() })}>
                Log &ldquo;{query.trim()}&rdquo; anyway
              </button>
            </div>
          </>
        ) : (
          results.map((e) => (
            <Row
              key={e.id}
              title={e.name}
              sub={e.met ? `~${cal(caloriesBurned(e.met, latestWeight, 30))} cal / 30 min${e.curve ? ' · takes distance' : ''}` : undefined}
              chevron
              onClick={() => open(e.id, e.name)}
            />
          ))
        )}
      </div>
    </>
  )
}

const TIER_LABEL: Record<Tier, string> = { rough: 'Rough estimate', closer: 'Closer estimate', best: 'Best estimate' }

export function ExerciseDetail({ date, kind, exerciseId, name, entryId }: { date: string; kind: Kind; exerciseId?: string; name: string; entryId?: string }) {
  const { pop, logExercise, deleteExercise, latestWeight, data } = useApp()
  const existing = entryId ? data.exerciseEntries.find((e) => e.id === entryId) : undefined
  const def = exerciseId ? EXERCISE_BY_ID.get(exerciseId) : undefined
  const metric = data.settings.weightUnit === 'kg'
  const distUnit = metric ? 'km' : 'mi'
  const gainUnit = metric ? 'm' : 'ft'
  const toDisplayDist = (mi: number) => (metric ? mi / MI_PER_KM : mi)
  const toMi = (v: number) => (metric ? v * MI_PER_KM : v)
  const toDisplayGain = (ft: number) => (metric ? ft / FT_PER_M : ft)
  const toFt = (v: number) => (metric ? v * FT_PER_M : v)

  const [minutes, setMinutes] = useState(String(existing?.minutes ?? 30))
  const [distance, setDistance] = useState(existing?.distanceMi ? String(Math.round(toDisplayDist(existing.distanceMi) * 100) / 100) : '')
  const [gain, setGain] = useState(existing?.elevationFt ? String(Math.round(toDisplayGain(existing.elevationFt))) : '')
  const [sets, setSets] = useState(String(existing?.sets ?? 3))
  const [reps, setReps] = useState(String(existing?.reps ?? 10))
  const [weight, setWeight] = useState(String(existing?.weight ?? ''))
  const [manualCals, setManualCals] = useState(existing?.caloriesBurned !== undefined && !def?.met ? String(existing.caloriesBurned) : '')

  const timed = kind !== 'strength'
  const mins = parseFloat(minutes) || 0
  const dist = parseFloat(distance) || 0
  const distMi = dist > 0 ? toMi(dist) : null
  const gainFt = (parseFloat(gain) || 0) > 0 ? toFt(parseFloat(gain)) : null
  const est = def?.met ? estimate(def, { minutes: mins, distanceMi: distMi, elevationFt: gainFt, weightLb: latestWeight }) : null
  const burned = est ? est.kcal : parseFloat(manualCals) || 0
  const takesDistance = !!def && (def.kind === 'sports' || !!def.curve || def.also?.includes('sports'))
  const takesGain = !!def?.climbs
  const pace = distMi && mins ? paceLabel(dist, mins, distUnit) : null
  const mph = distMi && mins ? Math.round((distMi / (mins / 60)) * 10) / 10 : null

  function save() {
    logExercise({
      id: entryId,
      date,
      kind,
      name,
      exerciseId,
      minutes: timed ? mins : undefined,
      distanceMi: timed && distMi ? Math.round(distMi * 1000) / 1000 : undefined,
      elevationFt: timed && gainFt && takesGain ? Math.round(gainFt) : undefined,
      caloriesBurned: timed ? burned : undefined,
      sets: !timed ? parseFloat(sets) || 0 : undefined,
      reps: !timed ? parseFloat(reps) || 0 : undefined,
      weight: !timed && weight ? parseFloat(weight) : undefined,
    })
    pop()
  }

  const numberField = (label: string, value: string, set: (v: string) => void, unit: string, opts: { autoFocus?: boolean; decimal?: boolean; placeholder?: string } = {}) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="field__control">
        <input
          className="input"
          type="number"
          inputMode={opts.decimal ? 'decimal' : 'numeric'}
          placeholder={opts.placeholder ?? '0'}
          value={value}
          autoFocus={opts.autoFocus}
          onChange={(e) => set(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  )

  return (
    <>
      <TopBar
        title={entryId ? 'Edit Exercise' : 'Add Exercise'}
        onBack={pop}
        right={
          <button className="iconbtn iconbtn--accent" onClick={save} aria-label="Save">
            <Icon name="check" size={24} strokeWidth={2.6} />
          </button>
        }
      />
      <div className="scroll">
        <div style={{ padding: '18px 16px 14px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{name}</div>
          {def?.met && (
            <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 3 }}>
              {kind === 'sports' ? 'Sport' : 'Cardio'} · estimate scales with your current weight
            </div>
          )}
        </div>

        <div className="card">
          {timed ? (
            <>
              {numberField('How long', minutes, setMinutes, 'min', { autoFocus: true })}
              {takesDistance &&
                numberField(kind === 'sports' ? 'Distance covered' : 'Distance', distance, setDistance, distUnit, {
                  decimal: true,
                  placeholder: kind === 'sports' ? 'from a watch' : 'optional',
                })}
              {takesGain && numberField('Elevation gain', gain, setGain, gainUnit, { placeholder: 'optional' })}
              {!est && (
                <label className="field">
                  <span className="field__label">Calories burned</span>
                  <span className="field__control">
                    <input className="input" type="number" inputMode="numeric" placeholder="0" value={manualCals} onChange={(e) => setManualCals(e.target.value)} />
                  </span>
                </label>
              )}
            </>
          ) : (
            <>
              {numberField('Sets', sets, setSets, '', { autoFocus: true })}
              {numberField('Reps / Set', reps, setReps, '')}
              {numberField('Weight per Set', weight, setWeight, 'lb', { decimal: true, placeholder: '-' })}
            </>
          )}
        </div>

        {timed && (
          <div className="chips">
            {[15, 20, 30, 45, 60, 90].map((m) => (
              <button key={m} className={`chip ${mins === m ? 'chip--active' : ''}`} onClick={() => setMinutes(String(m))}>
                {m} min
              </button>
            ))}
          </div>
        )}

        {est && (
          <div className={`card burn burn--${est.tier}`}>
            <div className="burn__top">
              <span className="burn__label">{TIER_LABEL[est.tier]}</span>
              <span className="burn__dots" aria-hidden>
                <i className="on" />
                <i className={est.tier !== 'rough' ? 'on' : ''} />
                <i className={est.tier === 'best' ? 'on' : ''} />
              </span>
            </div>
            <div className="burn__kcal">
              {cal(est.kcal)} <small>cal</small>
            </div>
            <div className="burn__meta">
              {est.met} METs
              {pace ? ` · ${pace}` : ''}
              {mph ? ` · ${mph} mph` : ''}
              {gainFt && takesGain ? ` · ${Math.round(toDisplayGain(gainFt))} ${gainUnit} up` : ''}
            </div>
            <div className="burn__next">{est.next}</div>
          </div>
        )}

        <div className="btn-wrap" style={{ display: 'grid', gap: 10 }}>
          <button className="btn" onClick={save}>
            {entryId ? 'Save Changes' : 'Add Exercise'}
          </button>
          {entryId && (
            <button
              className="btn btn--danger"
              onClick={() => {
                deleteExercise(entryId)
                pop()
              }}
            >
              Delete Exercise
            </button>
          )}
        </div>

        {!timed && (
          <div className="hint">
            Strength entries are logged for the record and don&apos;t add calories back to your budget, resistance training burn is already reflected in
            your activity level.
          </div>
        )}
      </div>
    </>
  )
}
