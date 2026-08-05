import { useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { Empty, Row, Tabs, TopBar } from '../components/ui'
import { Icon } from '../components/Icon'
import { EXERCISE_BY_ID, searchExercises } from '../data/exercises'
import { caloriesBurned } from '../lib/nutrition'
import { cal } from '../lib/format'

type Kind = 'cardio' | 'strength'

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
      if (out.length >= 10) break
    }
    return out
  }, [data.exerciseEntries, kind])

  return (
    <>
      <TopBar title="Add Exercise" onBack={pop} />
      <Tabs
        active={kind}
        onChange={setKind}
        tabs={[
          { key: 'cardio', label: 'Cardio' },
          { key: 'strength', label: 'Strength' },
        ]}
      />

      <div className="searchbar">
        <div className="searchbar__box">
          <Icon name="search" size={17} />
          <input
            className="searchbar__input"
            placeholder={`Search ${kind} exercises`}
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
              <Row
                key={r.name}
                title={r.name}
                chevron
                onClick={() =>
                  push({
                    name: 'exerciseDetail',
                    date,
                    kind,
                    exerciseId: r.id,
                    name_: r.name,
                  })
                }
              />
            ))}
          </>
        )}

        <div className="section-label">{query ? 'Results' : 'All Exercises'}</div>
        {results.length === 0 ? (
          <>
            <Empty title="No matches" />
            <div className="btn-wrap">
              <button
                className="btn btn--ghost"
                onClick={() =>
                  push({ name: 'exerciseDetail', date, kind, name_: query.trim() })
                }
              >
                Log &ldquo;{query.trim()}&rdquo; anyway
              </button>
            </div>
          </>
        ) : (
          results.map((e) => (
            <Row
              key={e.id}
              title={e.name}
              sub={
                e.met
                  ? `${cal(caloriesBurned(e.met, latestWeight, 30))} cal / 30 min`
                  : undefined
              }
              chevron
              onClick={() =>
                push({
                  name: 'exerciseDetail',
                  date,
                  kind,
                  exerciseId: e.id,
                  name_: e.name,
                })
              }
            />
          ))
        )}
      </div>
    </>
  )
}

export function ExerciseDetail({
  date,
  kind,
  exerciseId,
  name,
  entryId,
}: {
  date: string
  kind: Kind
  exerciseId?: string
  name: string
  entryId?: string
}) {
  const { pop, logExercise, deleteExercise, latestWeight, data } = useApp()
  const existing = entryId ? data.exerciseEntries.find((e) => e.id === entryId) : undefined
  const def = exerciseId ? EXERCISE_BY_ID.get(exerciseId) : undefined

  const [minutes, setMinutes] = useState(String(existing?.minutes ?? 30))
  const [sets, setSets] = useState(String(existing?.sets ?? 3))
  const [reps, setReps] = useState(String(existing?.reps ?? 10))
  const [weight, setWeight] = useState(String(existing?.weight ?? ''))
  const [manualCals, setManualCals] = useState(
    existing?.caloriesBurned !== undefined && !def ? String(existing.caloriesBurned) : ''
  )

  const mins = parseFloat(minutes) || 0
  const estimated = def?.met ? caloriesBurned(def.met, latestWeight, mins) : 0
  const burned = def?.met ? estimated : parseFloat(manualCals) || 0

  function save() {
    logExercise({
      id: entryId,
      date,
      kind,
      name,
      exerciseId,
      minutes: kind === 'cardio' ? mins : undefined,
      caloriesBurned: kind === 'cardio' ? burned : undefined,
      sets: kind === 'strength' ? parseFloat(sets) || 0 : undefined,
      reps: kind === 'strength' ? parseFloat(reps) || 0 : undefined,
      weight: kind === 'strength' && weight ? parseFloat(weight) : undefined,
    })
    pop()
  }

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
              {def.met} METs · estimate scales with your current weight
            </div>
          )}
        </div>

        <div className="card">
          {kind === 'cardio' ? (
            <>
              <label className="field">
                <span className="field__label">Duration</span>
                <span className="field__control">
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    value={minutes}
                    autoFocus
                    onChange={(e) => setMinutes(e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                  <span className="unit">minutes</span>
                </span>
              </label>

              {def?.met ? (
                <div className="field">
                  <span className="field__label">Calories Burned</span>
                  <span className="field__control">
                    <span className="num" style={{ fontSize: 17, fontWeight: 700 }}>
                      {cal(estimated)}
                    </span>
                  </span>
                </div>
              ) : (
                <label className="field">
                  <span className="field__label">Calories Burned</span>
                  <span className="field__control">
                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={manualCals}
                      onChange={(e) => setManualCals(e.target.value)}
                    />
                  </span>
                </label>
              )}
            </>
          ) : (
            <>
              <label className="field">
                <span className="field__label">Sets</span>
                <span className="field__control">
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    value={sets}
                    autoFocus
                    onChange={(e) => setSets(e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                </span>
              </label>
              <label className="field">
                <span className="field__label">Reps / Set</span>
                <span className="field__control">
                  <input
                    className="input"
                    type="number"
                    inputMode="numeric"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                </span>
              </label>
              <label className="field">
                <span className="field__label">Weight per Set</span>
                <span className="field__control">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    placeholder="—"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                  <span className="unit">lb</span>
                </span>
              </label>
            </>
          )}
        </div>

        {kind === 'cardio' && (
          <div className="chips">
            {[15, 20, 30, 45, 60, 90].map((m) => (
              <button
                key={m}
                className={`chip ${mins === m ? 'chip--active' : ''}`}
                onClick={() => setMinutes(String(m))}
              >
                {m} min
              </button>
            ))}
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

        {kind === 'strength' && (
          <div className="hint">
            Strength entries are logged for the record and don&apos;t add calories back to
            your budget — resistance training burn is already reflected in your activity
            level.
          </div>
        )}
      </div>
    </>
  )
}
