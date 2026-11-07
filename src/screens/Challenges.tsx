import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Empty, SegmentedField, Sheet, Spinner, TextField, TopBar } from '../components/ui'
import { addDays, friendlyDate, shortDate, today } from '../lib/dates'
import { mlToDisplay, waterUnitLabel } from '../lib/units'
import { challengeState, challengeWhen } from '../lib/crews'
import { daysSoFar, dayScore, duel, KINDS, kindOf, margin, scores, suggestedTitle, type ChallengeKind, type DayRow, type Score } from '../lib/challenges'
import { hydrate, fetchConnections, type Person } from '../services/social'
import { fetchMyCrews, type CrewCard } from '../services/crews'
import {
  createChallenge,
  deleteChallenge,
  fetchChallenge,
  fetchDays,
  fetchMyChallenges,
  joinChallenge,
  leaveChallenge,
  respond,
  type Challenge,
} from '../services/challenges'
import type { Settings } from '../types'

/* ---------------------------------------------------------------- helpers -- */

function displayName(p: Person): string {
  return p.name ?? `@${p.username}`
}

/** Names for a set of ids, filled in as they arrive. */
function useNames(ids: string[]): Map<string, Person> {
  const [people, setPeople] = useState<Map<string, Person>>(new Map())
  const key = ids.slice().sort().join(',')
  useEffect(() => {
    const missing = key ? key.split(',').filter((id) => !people.has(id)) : []
    if (missing.length === 0) return
    let live = true
    hydrate(missing)
      .then((m) => live && setPeople((prev) => new Map([...prev, ...m])))
      .catch(() => {})
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return people
}

function formatter(kind: ChallengeKind, settings: Settings): (n: number) => string {
  if (kind === 'steps') return (n) => n.toLocaleString()
  return (n) => {
    const v = mlToDisplay(n, settings.waterUnit)
    const shown = settings.waterUnit === 'ml' ? Math.round(v) : Math.round(v * 10) / 10
    return `${shown.toLocaleString()} ${waterUnitLabel(settings.waterUnit, shown)}`
  }
}

/** Live totals for a challenge, refreshed on a timer. */
function useScores(challenge: Challenge, every = 30000): { list: Score[]; rows: Map<string, DayRow[]>; ready: boolean } {
  const [rows, setRows] = useState<Map<string, DayRow[]>>(new Map())
  const [ready, setReady] = useState(false)
  const members = useMemo(() => challenge.members.filter((m) => m.status === 'in').map((m) => m.userId), [challenge.members])
  const key = members.join(',')
  useEffect(() => {
    if (challengeState(challenge.starts, challenge.ends) === 'upcoming' || !key) {
      setReady(true)
      return
    }
    let live = true
    const load = () =>
      fetchDays(key.split(','), challenge.starts, challenge.ends)
        .then((m) => {
          if (!live) return
          setRows(m)
          setReady(true)
        })
        .catch(() => live && setReady(true))
    void load()
    const t = window.setInterval(() => void load(), every)
    return () => {
      live = false
      window.clearInterval(t)
    }
  }, [key, challenge.starts, challenge.ends, every])
  const list = useMemo(() => scores(challenge.kind, members, rows, challenge.starts, challenge.ends), [challenge.kind, members, rows, challenge.starts, challenge.ends])
  return { list, rows, ready }
}

/* ------------------------------------------------------------------ card -- */

/**
 * One challenge, as it appears in the list, on a crew's Compete tab, and at
 * the top of its own screen. A duel gets the Apple framing, you against
 * them with a bar each; a group gets a ranked list.
 */
export function ChallengeCard({
  challenge,
  me,
  people,
  full,
  onOpen,
  onChange,
}: {
  challenge: Challenge
  me: string
  people: Map<string, Person>
  /** Every row and the actions, for the challenge's own screen. */
  full?: boolean
  onOpen?(): void
  onChange(): void
}) {
  const { data } = useApp()
  const kind = kindOf(challenge.kind)
  const state = challengeState(challenge.starts, challenge.ends)
  const format = formatter(challenge.kind, data.settings)
  const { list, ready } = useScores(challenge)
  const nameOf = (id: string) => (id === me ? 'You' : people.get(id) ? displayName(people.get(id)!) : 'Someone')
  const mine = challenge.members.find((m) => m.userId === me)
  const invited = mine?.status === 'invited'
  const canJoin = !mine && challenge.crewId !== null && state !== 'ended'
  const pair = duel(me, list)
  const top = Math.max(1, ...list.map((s) => s.total ?? 0))
  const shown = full ? list : list.slice(0, 5)
  const [busy, setBusy] = useState(false)

  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      onChange()
    } finally {
      setBusy(false)
    }
  }

  const waiting = challenge.members.filter((m) => m.status === 'invited')
  const sub =
    state === 'upcoming'
      ? `Starts ${friendlyDate(challenge.starts)}`
      : state === 'ended'
        ? `Ended ${friendlyDate(challenge.ends)}`
        : `${friendlyDate(challenge.starts)} to ${friendlyDate(challenge.ends)}`

  return (
    <div className={`card challenge ${onOpen ? 'challenge--tap' : ''}`} onClick={onOpen} role={onOpen ? 'button' : undefined}>
      <div className="card__head">
        <div className="challenge__head">
          <span className="challenge__emoji">{kind.emoji}</span>
          <span>
            <div className="card__title">{challenge.title}</div>
            <div className="challenge__sub">{sub}</div>
          </span>
        </div>
        <span className={`crew-challenge__when ${state === 'upcoming' ? 'crew-challenge__when--soon' : ''} ${state === 'ended' ? 'crew-challenge__when--over' : ''}`}>
          {state === 'ended' ? 'Over' : challengeWhen(challenge.starts, challenge.ends)}
        </span>
      </div>

      {invited && (
        <div className="challenge__invite">
          <div className="hint" style={{ padding: 0 }}>
            {nameOf(mine!.invitedBy ?? challenge.createdBy)} challenged you. {kind.blurb}
          </div>
          <div className="challenge__actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn--sm" disabled={busy} onClick={() => void act(() => respond(challenge.id, me, 'in'))}>
              Accept
            </button>
            <button className="btn btn--sm btn--ghost" disabled={busy} onClick={() => void act(() => respond(challenge.id, me, 'declined'))}>
              Decline
            </button>
          </div>
        </div>
      )}

      {canJoin && (
        <div className="challenge__invite">
          <div className="hint" style={{ padding: 0 }}>Your crew is racing. {kind.blurb}</div>
          <div className="challenge__actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn--sm" disabled={busy} onClick={() => void act(() => joinChallenge(challenge.id, me))}>
              Join in
            </button>
          </div>
        </div>
      )}

      {state !== 'upcoming' && !invited && (
        <div className="challenge__body">
          {!ready ? (
            <div className="hint">Adding it up…</div>
          ) : list.length === 0 ? (
            <div className="hint">Nobody is in yet.</div>
          ) : pair ? (
            <div className="duel">
              <div className="duel__side">
                <span className="duel__name">You</span>
                <span className="duel__n">{pair.you.total === null ? '–' : format(pair.you.total)}</span>
                <span className="duel__bar">
                  <span className="duel__fill duel__fill--you" style={{ width: `${Math.round(((pair.you.total ?? 0) / top) * 100)}%` }} />
                </span>
              </div>
              <div className="duel__side duel__side--them">
                <span className="duel__name">{nameOf(pair.them.userId)}</span>
                <span className="duel__n">{pair.them.total === null ? '–' : format(pair.them.total)}</span>
                <span className="duel__bar">
                  <span className="duel__fill duel__fill--them" style={{ width: `${Math.round(((pair.them.total ?? 0) / top) * 100)}%` }} />
                </span>
              </div>
              <div className={`duel__margin ${pair.you.total !== null && pair.them.total !== null && pair.you.total > pair.them.total ? 'duel__margin--up' : ''}`}>
                {state === 'ended'
                  ? pair.you.total === null || pair.them.total === null
                    ? 'No result'
                    : pair.you.total > pair.them.total
                      ? '🏆 You won'
                      : pair.you.total < pair.them.total
                        ? `${nameOf(pair.them.userId)} won`
                        : 'A draw'
                  : margin(pair.you, pair.them, format)}
              </div>
            </div>
          ) : (
            <div className="crew-challenge__rows" style={{ padding: '2px 0 0' }}>
              {shown.map((s, i) => (
                <div key={s.userId} className={`crew-challenge__row ${s.userId === me ? 'crew-challenge__row--you' : ''}`}>
                  <span className="crew-challenge__name">
                    {i === 0 && (s.total ?? 0) > 0 ? (state === 'ended' ? '🏆 ' : '👑 ') : ''}
                    {nameOf(s.userId)}
                  </span>
                  <span className="tile__bar crew-challenge__bar">
                    <span className="tile__fill" style={{ width: `${Math.round(((s.total ?? 0) / top) * 100)}%` }} />
                  </span>
                  <span className="crew-challenge__n">{s.total === null ? <small>not sharing</small> : format(s.total)}</span>
                </div>
              ))}
              {!full && list.length > shown.length && <div className="hint">and {list.length - shown.length} more</div>}
            </div>
          )}
          {waiting.length > 0 && state === 'active' && (
            <div className="hint" style={{ paddingTop: 4 }}>
              Waiting on {waiting.map((m) => nameOf(m.userId)).join(', ')}.
            </div>
          )}
        </div>
      )}

      {state === 'upcoming' && !invited && (
        <div className="hint" style={{ paddingTop: 0 }}>
          {kind.blurb} {challenge.members.filter((m) => m.status === 'in').length} in
          {waiting.length ? `, ${waiting.length} invited` : ''}.
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ list -- */

export function Challenges() {
  const { pop, push, session } = useApp()
  const me = session?.user.id ?? ''
  const [list, setList] = useState<Challenge[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      setList(await fetchMyChallenges())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
      setList((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 30000)
    return () => window.clearInterval(t)
  }, [load])

  const ids = useMemo(() => Array.from(new Set((list ?? []).flatMap((c) => c.members.map((m) => m.userId)))), [list])
  const people = useNames(ids)

  const mineIn = (c: Challenge) => c.members.some((m) => m.userId === me && m.status === 'in')
  const invites = (list ?? []).filter((c) => c.members.some((m) => m.userId === me && m.status === 'invited') && challengeState(c.starts, c.ends) !== 'ended')
  const visible = (list ?? []).filter((c) => !invites.includes(c) && !c.members.some((m) => m.userId === me && m.status === 'declined'))
  const active = visible.filter((c) => challengeState(c.starts, c.ends) === 'active')
  const upcoming = visible.filter((c) => challengeState(c.starts, c.ends) === 'upcoming')
  const past = visible.filter((c) => challengeState(c.starts, c.ends) === 'ended' && mineIn(c)).slice(0, 10)

  const section = (title: string, items: Challenge[]) =>
    items.length > 0 && (
      <>
        <div className="section-label">{title}</div>
        {items.map((c) => (
          <ChallengeCard key={c.id} challenge={c} me={me} people={people} onOpen={() => push({ name: 'challenge', id: c.id })} onChange={() => void load()} />
        ))}
      </>
    )

  return (
    <>
      <TopBar
        title="Challenges"
        onBack={pop}
        right={
          <button className="iconbtn" onClick={() => setAdding(true)} aria-label="New challenge">
            <Icon name="plus" size={22} strokeWidth={2.2} />
          </button>
        }
      />
      <div className="scroll">
        {list === null ? (
          <Spinner />
        ) : (
          <>
            {error && (
              <div className="hint" style={{ color: 'var(--danger)' }}>
                {error}
              </div>
            )}
            {list.length === 0 && (
              <Empty title="No challenges yet">
                <div className="hint" style={{ padding: 0 }}>
                  Challenge a friend or a whole crew to a week of steps or water. Most by the end wins.
                </div>
              </Empty>
            )}
            {section('Invites', invites)}
            {section('Going on now', active)}
            {section('Coming up', upcoming)}
            <div className="btn-wrap">
              <button className="btn" onClick={() => setAdding(true)}>
                Start a challenge
              </button>
            </div>
            {section('Finished', past)}
          </>
        )}
      </div>
      {adding && (
        <NewChallengeSheet
          onClose={() => setAdding(false)}
          onDone={(id) => {
            setAdding(false)
            void load()
            push({ name: 'challenge', id })
          }}
        />
      )}
    </>
  )
}

/* ---------------------------------------------------------------- screen -- */

export function ChallengeScreen({ id }: { id: string }) {
  const { pop, session, data } = useApp()
  const me = session?.user.id ?? ''
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [gone, setGone] = useState(false)

  const load = useCallback(async () => {
    try {
      setChallenge(await fetchChallenge(id))
    } catch {
      setGone(true)
    }
  }, [id])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 20000)
    return () => window.clearInterval(t)
  }, [load])

  const ids = useMemo(() => challenge?.members.map((m) => m.userId) ?? [], [challenge])
  const people = useNames(ids)

  if (gone) {
    return (
      <>
        <TopBar solid title="Challenge" onBack={pop} />
        <Empty title="That challenge is gone" />
      </>
    )
  }
  if (!challenge) {
    return (
      <>
        <TopBar solid title="Challenge" onBack={pop} />
        <Spinner />
      </>
    )
  }

  const nameOf = (uid: string) => (uid === me ? 'You' : people.get(uid) ? displayName(people.get(uid)!) : 'Someone')
  const mine = challenge.members.find((m) => m.userId === me)
  const isMaker = challenge.createdBy === me
  const state = challengeState(challenge.starts, challenge.ends)

  return (
    <>
      <TopBar solid title={kindOf(challenge.kind).label} onBack={pop} />
      <div className="scroll">
        <ChallengeCard challenge={challenge} me={me} people={people} full onChange={() => void load()} />
        {state !== 'upcoming' && mine?.status === 'in' && <DayTable challenge={challenge} me={me} nameOf={nameOf} settings={data.settings} />}

        <div className="card">
          <div className="card__head">
            <div className="card__title">Who's in</div>
          </div>
          {challenge.members.map((m) => (
            <div key={m.userId} className="row" style={{ cursor: 'default' }}>
              <span className="avatar avatar--sm">{nameOf(m.userId).slice(0, 1).toUpperCase()}</span>
              <span className="row__main">
                <span className="row__title">{nameOf(m.userId)}</span>
                <span className="row__sub">
                  {m.status === 'in' ? (m.userId === challenge.createdBy ? 'Started it' : 'In') : m.status === 'invited' ? 'Invited, not answered' : 'Declined'}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="btn-wrap" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {mine && !isMaker && (
            <button className="btn btn--ghost" onClick={() => void leaveChallenge(challenge.id, me).then(pop)}>
              Leave
            </button>
          )}
          {isMaker && (
            <button className="btn btn--ghost" onClick={() => void deleteChallenge(challenge.id).then(pop)}>
              {state === 'ended' ? 'Delete' : state === 'upcoming' ? 'Cancel' : 'End it'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

/** Day by day, newest first, one column per person in. */
function DayTable({ challenge, me, nameOf, settings }: { challenge: Challenge; me: string; nameOf(id: string): string; settings: Settings }) {
  const { rows, ready } = useScores(challenge, 20000)
  const members = challenge.members.filter((m) => m.status === 'in').map((m) => m.userId)
  const ordered = [me, ...members.filter((m) => m !== me)].filter((m) => members.includes(m)).slice(0, 4)
  const days = daysSoFar(challenge.starts, challenge.ends).reverse()
  const format = formatter(challenge.kind, settings)
  if (!ready || days.length === 0) return null
  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">Day by day</div>
        <span className="card__meta">
          {days.length} of {daysSoFar(challenge.starts, challenge.ends, challenge.ends).length} days
        </span>
      </div>
      <div className="daytable">
        <div className="daytable__row daytable__row--head">
          <span />
          {ordered.map((id) => (
            <span key={id}>{nameOf(id)}</span>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className="daytable__row">
            <span className="daytable__day">{d === today() ? 'Today' : shortDate(d)}</span>
            {ordered.map((id) => {
              const n = dayScore(challenge.kind, rows.get(id)?.find((r) => r.day === d))
              return <span key={id}>{n === null ? <small>–</small> : format(n)}</span>
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- sheet -- */

/**
 * Start one. Against friends (anyone you follow or who follows you, ticked
 * off a list) or a whole crew. When opened from a crew, the crew is fixed.
 */
export function NewChallengeSheet({ crewId, onClose, onDone }: { crewId?: string; onClose(): void; onDone(id: string): void }) {
  const { session } = useApp()
  const me = session?.user.id ?? ''
  const [kind, setKind] = useState<ChallengeKind>('steps')
  const [against, setAgainst] = useState<'friends' | 'crew'>(crewId ? 'crew' : 'friends')
  const [friends, setFriends] = useState<Person[] | null>(null)
  const [crews, setCrews] = useState<CrewCard[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [crew, setCrew] = useState<string | null>(crewId ?? null)
  const [length, setLength] = useState<'7' | '14' | '30'>('7')
  const [starts, setStarts] = useState(today())
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const suggested = suggestedTitle(kind, Number(length))
  const ends = addDays(starts, Number(length) - 1)

  useEffect(() => {
    if (!me) return
    fetchConnections(me)
      .then((c) => {
        const seen = new Set<string>()
        const all = [...c.following, ...c.followers].filter((p) => (seen.has(p.userId) ? false : (seen.add(p.userId), true)))
        setFriends(all)
      })
      .catch(() => setFriends([]))
    if (!crewId) fetchMyCrews(me).then(setCrews).catch(() => setCrews([]))
  }, [me, crewId])

  const ready = against === 'crew' ? crew !== null : picked.size > 0

  const save = async () => {
    setBusy(true)
    try {
      const c = await createChallenge({
        me,
        kind,
        title: title.trim() || suggested,
        starts,
        ends,
        crewId: against === 'crew' ? crew : null,
        invitees: against === 'friends' ? Array.from(picked) : [],
      })
      onDone(c.id)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Sheet title="New challenge" onClose={onClose}>
      <div className="field field--stack">
        <span className="field__label">Contest</span>
        <div className="chips chips--wrap">
          {KINDS.map((k) => (
            <button key={k.kind} className={`chip ${kind === k.kind ? 'chip--active' : ''}`} onClick={() => setKind(k.kind)}>
              {k.emoji} {k.label}
            </button>
          ))}
        </div>
        <div className="hint" style={{ padding: '6px 0 0' }}>{kindOf(kind).blurb}</div>
      </div>

      {!crewId && (
        <SegmentedField<'friends' | 'crew'>
          label="Against"
          value={against}
          options={[
            { value: 'friends', label: 'Friends' },
            { value: 'crew', label: 'A crew' },
          ]}
          onChange={setAgainst}
        />
      )}

      {against === 'friends' && (
        <div className="field field--stack">
          <span className="field__label">Who</span>
          {friends === null ? (
            <Spinner />
          ) : friends.length === 0 ? (
            <div className="hint" style={{ padding: '4px 0 0' }}>
              Nobody to challenge yet. Follow someone on Friends first.
            </div>
          ) : (
            <div className="pick">
              {friends.map((p) => {
                const on = picked.has(p.userId)
                return (
                  <button
                    key={p.userId}
                    className="row"
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev)
                        if (on) next.delete(p.userId)
                        else next.add(p.userId)
                        return next
                      })
                    }
                  >
                    <span className={`tickbox ${on ? 'tickbox--on' : ''}`}>{on && <Icon name="check" size={13} strokeWidth={3} />}</span>
                    <span className="row__main row__title" style={{ fontWeight: 500 }}>
                      {displayName(p)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {against === 'crew' && !crewId && (
        <div className="field field--stack">
          <span className="field__label">Which crew</span>
          {crews === null ? (
            <Spinner />
          ) : crews.length === 0 ? (
            <div className="hint" style={{ padding: '4px 0 0' }}>
              You are not in a crew yet.
            </div>
          ) : (
            <div className="chips chips--wrap">
              {crews.map((c) => (
                <button key={c.id} className={`chip ${crew === c.id ? 'chip--active' : ''}`} onClick={() => setCrew(c.id)}>
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <SegmentedField<'7' | '14' | '30'>
        label="Length"
        value={length}
        options={[
          { value: '7', label: '7 days' },
          { value: '14', label: '14 days' },
          { value: '30', label: '30 days' },
        ]}
        onChange={setLength}
      />
      <label className="field">
        <span className="field__label">Starts</span>
        <span className="field__control">
          <input className="input" type="date" value={starts} min={today()} onChange={(e) => setStarts(e.target.value)} />
        </span>
      </label>
      <TextField label="Name" value={title} onChange={setTitle} placeholder={suggested} />
      <div className="hint">
        Scored from the steps and water each person shares. {against === 'friends' ? 'They get an invite and are in once they accept.' : 'Everyone in the crew is in from the start.'}
      </div>
      {error && (
        <div className="hint" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      <div className="btn-wrap">
        <button className="btn" disabled={busy || !ready} onClick={() => void save()}>
          {against === 'friends' ? 'Send challenge' : 'Start'}
        </button>
      </div>
    </Sheet>
  )
}
