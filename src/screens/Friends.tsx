import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/store'
import type { ShareLevel } from '../types'
import { Icon } from '../components/Icon'
import {
  Empty,
  Row,
  SaveBar,
  SegmentedField,
  Sheet,
  Spinner,
  Tabs,
  Toggle,
  TopBar,
} from '../components/ui'
import { friendlyDate } from '../lib/dates'
import { NUDGES, fetchNudges, markNudgesSeen, sendNudge, type Nudge } from '../services/nudges'
import {
  acceptFollower,
  fetchConnections,
  fetchPrivate,
  follow,
  removeFollower,
  searchPeople,
  setPrivate,
  unfollow,
  type Connections,
  type FollowState,
  type Person,
} from '../services/social'

/**
 * Friends, finding people, following them, and what they see of you.
 *
 * ## Following, not friendship
 *
 * Edges are one-way. Following someone public takes effect immediately; a
 * private account holds it as a request until they accept. That asymmetry is
 * why the lists are "Following" and "Followers" rather than one "Friends" list:
 * the two genuinely differ, and collapsing them would misreport who can see
 * what.
 *
 * ## Nothing here reads anyone's diary
 *
 * Every number on another person's screen is one *they* published, filtered by
 * their own sharing settings before it left their device. There is no query in
 * this file that could return someone else's entries, weight or goals, because
 * there is no policy that would allow one.
 */

/* ------------------------------------------------------------- fragments -- */

function initialOf(p: Person): string {
  return (p.name || p.username).slice(0, 1).toUpperCase()
}

/** The one-line summary under a name: whatever they publish, in a fixed order. */
function describe(p: Person): string {
  const bits: string[] = []
  // Only when the name is the title, otherwise the handle is already shown.
  if (p.name) bits.push(`@${p.username}`)
  if (p.streak) bits.push(`${p.streak} day streak`)
  /* Whatever they chose to publish, at the level they chose. An account on
     percentages has no figures here to show. They were never written. */
  if (p.calories !== null && p.calorieGoal) bits.push(`${p.calories} / ${p.calorieGoal} cal`)
  else if (p.caloriePct !== null) bits.push(`${p.caloriePct}% calories`)
  if (p.steps !== null) bits.push(`${p.steps.toLocaleString()} steps`)
  else if (p.stepPct !== null) bits.push(`${p.stepPct}% steps`)
  if (p.waterPct !== null && p.waterMl === null) bits.push(`${p.waterPct}% water`)
  if (bits.length) return bits.join(' · ')
  /* Deliberately the same sentence for "shares nothing" and "private, and you
     cannot see in". A different one for each would turn the profile into a
     detector for whether a private account has anything worth following for. */
  return 'Nothing shared'
}



/* ------------------------------------------------------ sharing prompt -- */

/** The three rungs, for anything with a goal behind it. */
const FIGURE_LEVELS: { value: ShareLevel; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'percent', label: '% of goal' },
  { value: 'exact', label: 'Exact' },
]

/** Workouts have no percentage, so the middle rung is the names alone. */
const WORKOUT_LEVELS: { value: ShareLevel; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'percent', label: 'Exercises' },
  { value: 'exact', label: '+ calories' },
]


/**
 * Asked once, the first time this account follows someone.
 *
 * Following is the moment sharing starts to mean something, and it is the only
 * moment where the question is obviously relevant rather than an interruption.
 * The defaults are the percentages, enough for a friend to cheer you on,
 * with workouts off, since that one carries what you did and when.
 */
function SharingPrompt({ onClose }: { onClose(): void }) {
  const { saveSettings } = useApp()
  const [calories, setCalories] = useState<ShareLevel>('percent')
  const [water, setWater] = useState<ShareLevel>('percent')
  const [steps, setSteps] = useState<ShareLevel>('percent')
  const [macros, setMacros] = useState<ShareLevel>('percent')
  const [workouts, setWorkouts] = useState<ShareLevel>('off')

  return (
    <Sheet title="What can they see?" onClose={onClose}>
      <div className="card" style={{ margin: 0 }}>
        <SegmentedField<ShareLevel>
          label="Calories"
          value={calories}
          options={FIGURE_LEVELS}
          onChange={setCalories}
        />
        <SegmentedField<ShareLevel> label="Water" value={water} options={FIGURE_LEVELS} onChange={setWater} />
        <SegmentedField<ShareLevel> label="Steps" value={steps} options={FIGURE_LEVELS} onChange={setSteps} />
        <SegmentedField<ShareLevel>
          label="Macros"
          value={macros}
          options={FIGURE_LEVELS}
          onChange={setMacros}
        />
        <SegmentedField<ShareLevel>
          label="Workouts"
          sub="No percentage to give here, so the middle is the exercises alone and the last adds what they burned."
          value={workouts}
          options={WORKOUT_LEVELS}
          onChange={setWorkouts}
        />
      </div>
      <div style={{ padding: '14px 4px 6px' }}>
        <button
          className="btn btn--primary"
          style={{ width: '100%' }}
          onClick={() => {
            saveSettings({
              shareCalories: calories,
              shareWater: water,
              shareSteps: steps,
              shareMacros: macros,
              shareWorkouts: workouts,
              sharingAsked: true,
            })
            onClose()
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------ goal bars -- */

/**
 * Someone else's day, as progress and nothing else.
 *
 * Every figure here is a percentage of a goal they set themselves. That is
 * deliberate and it is the whole design of this screen: it is enough to know
 * whether to cheer someone on, and it never says what they ate, drank or weigh.
 */
function GoalBars({ person }: { person: Person }) {
  /* The bar is always the percentage. That is what a bar is for, and the
     figure appears beside it only when they chose to publish one. An account
     sharing exact numbers publishes the percentage too, so the row never has
     to be drawn twice. */
  const rows: { label: string; pct: number | null; detail: string | null; color: string }[] = [
    {
      label: 'Calories',
      pct: person.caloriePct,
      detail:
        person.calories !== null && person.calorieGoal
          ? `${person.calories.toLocaleString()} / ${person.calorieGoal.toLocaleString()} cal`
          : null,
      color: 'var(--accent)',
    },
    {
      label: 'Water',
      pct: person.waterPct,
      detail:
        person.waterMl !== null && person.waterGoalMl
          ? `${(person.waterMl / 1000).toFixed(1)} / ${(person.waterGoalMl / 1000).toFixed(1)} L`
          : null,
      color: 'var(--water)',
    },
    {
      label: 'Steps',
      pct: person.stepPct,
      detail:
        person.steps !== null && person.stepGoal
          ? `${person.steps.toLocaleString()} / ${person.stepGoal.toLocaleString()}`
          : null,
      color: 'var(--steps)',
    },
    {
      label: 'Protein',
      pct: person.proteinPct,
      detail: person.proteinG !== null ? `${person.proteinG} g` : null,
      color: 'var(--protein)',
    },
    {
      label: 'Carbs',
      pct: person.carbsPct,
      detail: person.carbsG !== null ? `${person.carbsG} g` : null,
      color: 'var(--carbs)',
    },
    {
      label: 'Fat',
      pct: person.fatPct,
      detail: person.fatG !== null ? `${person.fatG} g` : null,
      color: 'var(--fat)',
    },
  ].filter((r) => r.pct !== null || r.detail !== null)

  if (!rows.length) return null

  return (
    <>
      <div className="section-label">Today, against their goals</div>
      <div className="card" style={{ padding: '12px 16px 14px' }}>
        {rows.map((b) => (
          <div key={b.label} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                fontSize: 13.5,
                marginBottom: 5,
              }}
            >
              <span style={{ color: 'var(--text-2)' }}>{b.label}</span>
              <span className="num" style={{ fontWeight: 700 }}>
                {b.detail ?? `${b.pct}%`}
                {b.detail && b.pct !== null && (
                  <span style={{ color: 'var(--text-3)', fontWeight: 600 }}> · {b.pct}%</span>
                )}
              </span>
            </div>
            <div className="progress" style={{ height: 8 }}>
              <div
                className="progress__fill"
                style={{ width: `${Math.min(100, b.pct ?? 0)}%`, background: b.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/* --------------------------------------------------------------- nudges -- */

/**
 * Five emoji and a tap.
 *
 * Which one leads depends on how their day is going. A clap for someone
 * already past their goals reads as congratulations, and the same clap for
 * someone at 20% reads as sarcasm, so the list is ordered by where they are
 * rather than fixed.
 */
function NudgeBar({ person, onSend }: { person: Person; onSend(emoji: string): void }) {
  const [count, setCount] = useState(0)
  const done = (person.caloriePct ?? 0) >= 90 || (person.stepPct ?? 0) >= 100
  const order = done ? NUDGES : [...NUDGES].reverse()

  return (
    <>
      <div className="section-label">Send a nudge</div>
      <div className="card" style={{ padding: '12px 12px 14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {order.map((n) => (
            <button
              key={n.emoji}
              className="fpill"
              style={{ fontSize: 15 }}
              /* Every tap sends one. Nothing stays selected: these are
                 messages, not a setting, so there is no state for a pressed
                 one to be in. */
              onClick={() => {
                onSend(n.emoji)
                setCount((c) => c + 1)
              }}
            >
              <span style={{ fontSize: 17 }}>{n.emoji}</span> {n.label}
            </button>
          ))}
        </div>
        {count > 0 && (
          <div className="hint" style={{ padding: '10px 4px 0' }}>
            {count === 1 ? 'Sent' : `Sent ${count}`}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * What arrived while you were away.
 *
 * Marked seen once it has actually been on screen, not when it was fetched,
 * the two differ by exactly the case that matters, which is opening the app and
 * closing it again.
 */
function NudgeInbox({ me }: { me: string }) {
  const [nudges, setNudges] = useState<Nudge[]>([])

  useEffect(() => {
    let live = true
    void fetchNudges(me)
      .then((rows) => {
        if (live) setNudges(rows)
      })
      .catch(() => {
        /* An inbox that will not load is not worth an error on this screen. */
      })
    return () => {
      live = false
    }
  }, [me])

  const unseen = nudges.filter((n) => !n.seen)
  useEffect(() => {
    if (!unseen.length) return
    const ids = unseen.map((n) => n.id)
    const t = window.setTimeout(() => void markNudgesSeen(ids).catch(() => {}), 1200)
    return () => window.clearTimeout(t)
  }, [unseen.length])

  if (!nudges.length) return null

  return (
    <>
      <div className="section-label">
        Nudges for you{unseen.length ? ` · ${unseen.length} new` : ''}
      </div>
      <div className="card">
        {nudges.slice(0, 8).map((n) => (
          <Row
            key={n.id}
            left={<span className="avatar" style={{ fontSize: 18 }}>{n.emoji}</span>}
            title={n.from ? `@${n.from}` : 'Someone'}
            sub={new Date(n.createdAt).toLocaleString(undefined, {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
            right={!n.seen ? <span className="chip">New</span> : undefined}
          />
        ))}
      </div>
    </>
  )
}

function PersonRow({
  person,
  sub,
  right,
  onClick,
}: {
  person: Person
  sub?: string
  right?: React.ReactNode
  onClick(): void
}) {
  return (
    <Row
      left={<span className="avatar">{initialOf(person)}</span>}
      title={person.name ?? `@${person.username}`}
      sub={sub ?? describe(person)}
      right={right}
      chevron={!right}
      onClick={onClick}
    />
  )
}

/**
 * Follow / Requested / Following.
 *
 * Accent-filled only when there is something to do. Once connected it drops to
 * the neutral chip, because "Following" is a state being reported, not a button
 * anyone should be nudged toward pressing, pressing it unfollows.
 */
function FollowButton({
  state,
  busy,
  onFollow,
  onUnfollow,
}: {
  state: FollowState
  busy?: boolean
  onFollow(): void
  onUnfollow(): void
}) {
  if (state === 'none') {
    return (
      <button className="logpill" disabled={busy} onClick={onFollow}>
        Follow
      </button>
    )
  }
  return (
    <button className="chip" disabled={busy} onClick={onUnfollow}>
      {state === 'pending' ? 'Requested' : 'Following'}
    </button>
  )
}

/* ------------------------------------------------------------------ hub -- */

type Tab = 'following' | 'followers' | 'requests'

export function Friends({ asTab }: { asTab?: boolean } = {}) {
  const { pop, push, session, setLocalOnly, settings } = useApp()
  /* Shown once, the first time this account follows anyone. */
  const [askShare, setAskShare] = useState(false)
  const me = session?.user.id ?? null

  const [tab, setTab] = useState<Tab>('following')
  const [conn, setConn] = useState<Connections | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [searching, setSearching] = useState(false)
  /** Ids with a request in flight, so one row's button cannot be double-fired. */
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    if (!me) return
    try {
      setConn(await fetchConnections(me))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [me])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /* Debounced, though this is our own database rather than a rate-limited third
     party. A query per keystroke would still be a round trip per keystroke. */
  useEffect(() => {
    if (!me) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const t = window.setTimeout(async () => {
      try {
        setResults(await searchPeople(q, me))
        setError(null)
      } catch (err) {
        setResults([])
        setError((err as Error).message)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => window.clearTimeout(t)
  }, [query, me])

  /* Follow state comes from the connection lists already loaded rather than a
     query per result row. The answer is a set membership test against data
     that is on screen anyway. */
  const stateOf = useCallback(
    (id: string): FollowState => {
      if (!conn) return 'none'
      if (conn.following.some((p) => p.userId === id)) return 'following'
      if (conn.sent.some((p) => p.userId === id)) return 'pending'
      return 'none'
    },
    [conn],
  )

  const act = useCallback(
    async (id: string, fn: () => Promise<unknown>) => {
      setBusy((s) => new Set(s).add(id))
      try {
        await fn()
        await refresh()
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy((s) => {
          const next = new Set(s)
          next.delete(id)
          return next
        })
      }
    },
    [refresh],
  )

  /* Your own outstanding requests sit in Following, marked, rather than in a
     list of their own: from your side "asked to follow" and "following" are the
     same intent at two stages, and a fourth list for the waiting half of it
     would be a screen nobody opens twice. */
  const followingList = useMemo(() => {
    if (!conn) return []
    return [
      ...conn.following.map((p) => ({ person: p, sub: undefined as string | undefined })),
      ...conn.sent.map((p) => ({ person: p, sub: 'Requested, waiting for them to accept' })),
    ]
  }, [conn])

  const openProfile = (p: Person) =>
    push({ name: 'friendProfile', userId: p.userId, username: p.username })

  if (!session) {
    return (
      <>
        <TopBar title="Friends" onBack={pop} solid />
        <div className="scroll">
          <Empty title="Friends need an account">
            <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
              Following someone means your account and theirs have to be able to find
              each other, which only works when you are signed in.
            </div>
          </Empty>
          <div className="btn-wrap">
            <button className="btn" onClick={() => setLocalOnly(false)}>
              Sign in
            </button>
          </div>
        </div>
      </>
    )
  }

  const requestCount = conn?.requests.length ?? 0

  return (
    <>
      <TopBar
        title="Friends"
        /* No back arrow when this *is* the tab. There is nothing behind it. */
        onBack={asTab ? undefined : pop}
        solid
        right={
          <button
            className="iconbtn"
            onClick={() => push({ name: 'friendsSharing' })}
            aria-label="What you share"
          >
            <Icon name="settings" size={21} />
          </button>
        }
      />

      <div className="searchbar">
        <div className="searchbar__box">
          <Icon name="search" size={17} />
          <input
            className="searchbar__input"
            placeholder="Find someone by username"
            autoCapitalize="none"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear">
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
      </div>

      {!query.trim() && (
        <Tabs
          tabs={[
            { key: 'following' as Tab, label: `Following ${followingList.length || ''}`.trim() },
            {
              key: 'followers' as Tab,
              label: `Followers ${conn?.followers.length || ''}`.trim(),
            },
            { key: 'requests' as Tab, label: `Requests ${requestCount || ''}`.trim() },
          ]}
          active={tab}
          onChange={setTab}
        />
      )}

      <div className="scroll">
        {error && (
          <div className="hint" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {/* What came in while you were away, before the lists. It is the one
            thing on this screen that is addressed to you. */}
        {me && !query.trim() && tab === 'following' && <NudgeInbox me={me} />}

        {query.trim() ? (
          <SearchResults
            query={query}
            results={results}
            searching={searching}
            busy={busy}
            stateOf={stateOf}
            onOpen={openProfile}
            onFollow={(p) =>
              void act(p.userId, async () => {
                await follow(me!, p.userId)
                if (!settings.sharingAsked) setAskShare(true)
              })
            }
            onUnfollow={(p) => void act(p.userId, () => unfollow(me!, p.userId))}
          />
        ) : !conn ? (
          <Spinner />
        ) : tab === 'following' ? (
          followingList.length ? (
            <div className="card" style={{ marginTop: 12 }}>
              {followingList.map(({ person, sub }) => (
                <PersonRow
                  key={person.userId}
                  person={person}
                  sub={sub}
                  onClick={() => openProfile(person)}
                />
              ))}
            </div>
          ) : (
            <Empty title="Not following anyone yet">
              <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
                Search a username above to find someone. Handles are unique, so the one
                they gave you is the one that finds them.
              </div>
            </Empty>
          )
        ) : tab === 'followers' ? (
          conn.followers.length ? (
            <div className="card" style={{ marginTop: 12 }}>
              {conn.followers.map((p) => (
                <PersonRow
                  key={p.userId}
                  person={p}
                  right={
                    <button
                      className="chip"
                      disabled={busy.has(p.userId)}
                      onClick={() => void act(p.userId, () => removeFollower(me!, p.userId))}
                    >
                      Remove
                    </button>
                  }
                  onClick={() => openProfile(p)}
                />
              ))}
            </div>
          ) : (
            <Empty title="No followers yet">
              <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
                Give someone your username and they can follow you from here.
              </div>
            </Empty>
          )
        ) : conn.requests.length ? (
          <>
            <div className="card" style={{ marginTop: 12 }}>
              {conn.requests.map((p) => (
                <PersonRow
                  key={p.userId}
                  person={p}
                  sub={`@${p.username} · wants to follow you`}
                  right={
                    <span className="stack-h" style={{ gap: 6 }}>
                      <button
                        className="logpill"
                        disabled={busy.has(p.userId)}
                        onClick={() => void act(p.userId, () => acceptFollower(me!, p.userId))}
                      >
                        Accept
                      </button>
                      <button
                        className="chip"
                        disabled={busy.has(p.userId)}
                        onClick={() => void act(p.userId, () => removeFollower(me!, p.userId))}
                      >
                        Decline
                      </button>
                    </span>
                  }
                  onClick={() => openProfile(p)}
                />
              ))}
            </div>
            <div className="hint">
              Accepting lets them see what you share. Declining removes the request
              without telling them.
            </div>
          </>
        ) : (
          <Empty title="No requests">
            <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
              Requests only happen while your account is private. Public accounts are
              followed without being asked.
            </div>
          </Empty>
        )}
      </div>

      {askShare && <SharingPrompt onClose={() => setAskShare(false)} />}
    </>
  )
}

function SearchResults({
  query,
  results,
  searching,
  busy,
  stateOf,
  onOpen,
  onFollow,
  onUnfollow,
}: {
  query: string
  results: Person[]
  searching: boolean
  busy: Set<string>
  stateOf(id: string): FollowState
  onOpen(p: Person): void
  onFollow(p: Person): void
  onUnfollow(p: Person): void
}) {
  if (query.trim().length < 2) {
    return (
      <Empty title="Keep typing">
        <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
          Two letters or more. Search matches the start of a username.
        </div>
      </Empty>
    )
  }
  if (searching && !results.length) return <Spinner />
  if (!results.length) {
    return (
      <Empty title="Nobody found">
        <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
          No username starts with “{query.trim()}”. Handles are exact, check the
          spelling with them.
        </div>
      </Empty>
    )
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      {results.map((p) => (
        <PersonRow
          key={p.userId}
          person={p}
          right={
            <FollowButton
              state={stateOf(p.userId)}
              busy={busy.has(p.userId)}
              onFollow={() => onFollow(p)}
              onUnfollow={() => onUnfollow(p)}
            />
          }
          onClick={() => onOpen(p)}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------- profile -- */

/**
 * Someone else's profile.
 *
 * The handle is passed in from whichever list was tapped so the header can
 * render immediately. The fetch behind it only fills in what they publish, and
 * for a private account it will fill in nothing.
 */
export function FriendProfile({ userId, username }: { userId: string; username: string }) {
  const { pop, session, settings } = useApp()
  const [askShare, setAskShare] = useState(false)
  const me = session?.user.id ?? null

  const [person, setPerson] = useState<Person | null>(null)
  const [state, setState] = useState<FollowState>('none')
  const [followsMe, setFollowsMe] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!me) return
    try {
      /* One connections read rather than three targeted queries: it is the same
         handful of rows, and it answers "do I follow them", "do they follow me"
         and "what can I see" together, so the screen cannot render a button
         that disagrees with the body under it. */
      const conn = await fetchConnections(me)
      const found =
        conn.following.find((p) => p.userId === userId) ??
        conn.sent.find((p) => p.userId === userId) ??
        conn.followers.find((p) => p.userId === userId) ??
        conn.requests.find((p) => p.userId === userId) ??
        (await searchPeople(username, me)).find((p) => p.userId === userId) ??
        null

      setPerson(found)
      setState(
        conn.following.some((p) => p.userId === userId)
          ? 'following'
          : conn.sent.some((p) => p.userId === userId)
            ? 'pending'
            : 'none',
      )
      setFollowsMe(conn.followers.some((p) => p.userId === userId))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [me, userId, username])

  useEffect(() => {
    void load()
  }, [load])

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    try {
      await fn()
      await load()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const shown = person
  const name = shown?.name ?? `@${username}`

  return (
    <>
      <TopBar title="Profile" onBack={pop} solid />
      <div className="scroll">
        <div className="personhead">
          <span className="avatar avatar--lg">
            {(shown?.name || username).slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div className="personhead__name">{name}</div>
            {shown?.name && <div className="personhead__handle">@{username}</div>}
          </div>
          {me && (
            <FollowButton
              state={state}
              busy={busy}
              onFollow={() =>
                void act(async () => {
                  await follow(me, userId)
                  if (!settings.sharingAsked) setAskShare(true)
                })
              }
              onUnfollow={() => void act(() => unfollow(me, userId))}
            />
          )}
        </div>

        {error && (
          <div className="hint" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : !shown || shown.empty ? (
          <>
            <div className="card">
              <Row
                title="Nothing shared"
                sub={
                  state === 'pending'
                    ? 'This account approves its followers. You will see what they share once they accept.'
                    : 'This account has not shared a name, a streak or anything else.'
                }
              />
            </div>
          </>
        ) : (
          <>
            <GoalBars person={shown} />

            {shown.exercise && (
              <>
                <div className="section-label">Today's workout</div>
                <div className="card">
                  <Row
                    title={shown.exercise}
                    sub={
                      shown.exerciseCalories !== null
                        ? `${shown.exerciseCalories.toLocaleString()} cal burned`
                        : 'Shared by them'
                    }
                  />
                </div>
              </>
            )}

            <div className="card">
              {/* A streak of zero is left out rather than shown as "0 days",
                  the same rule Home uses for its own badge. It is not a
                  statistic anyone wants reported back at them. */}
              {!!shown.streak && (
                <Row
                  title="Logging streak"
                  value={shown.streak === 1 ? '1 day' : `${shown.streak} days`}
                />
              )}
              {shown.lastLogged && (
                <Row title="Last logged" value={friendlyDate(shown.lastLogged)} />
              )}
              {!shown.streak && !shown.lastLogged && (
                <Row title="No streak yet" sub="They have not logged a day in a row." />
              )}
            </div>

            {state === 'following' && (
              <NudgeBar person={shown} onSend={(emoji) => void sendNudge(userId, emoji)} />
            )}

          </>
        )}

        {followsMe && (
          <>
            <div className="section-label">Follows you</div>
            <div className="hint" style={{ paddingTop: 0 }}>
              They can see whatever you share. Remove them from the Followers list on
              the previous screen.
            </div>
          </>
        )}
      </div>

      {askShare && <SharingPrompt onClose={() => setAskShare(false)} />}
    </>
  )
}

/* -------------------------------------------------------------- sharing -- */

/**
 * What followers see, and whether they have to ask.
 *
 * Commits through a save bar like every other preferences screen here, so a
 * half-made decision is never live. That matters more on this screen than most:
 * every toggle is a publishing decision, and the old write-on-each-keystroke
 * behaviour would have pushed each intermediate state to the server.
 */
export function FriendsSharing() {
  const { pop, settings, saveSettings, session } = useApp()

  const [shareName, setShareName] = useState(settings.shareName)
  const [shareStreak, setShareStreak] = useState(settings.shareStreak)
  const [shareCalories, setShareCalories] = useState<ShareLevel>(settings.shareCalories)
  const [shareWater, setShareWater] = useState<ShareLevel>(settings.shareWater)
  const [shareSteps, setShareSteps] = useState<ShareLevel>(settings.shareSteps)
  const [shareMacros, setShareMacros] = useState<ShareLevel>(settings.shareMacros)
  const [shareWorkouts, setShareWorkouts] = useState<ShareLevel>(settings.shareWorkouts)

  /* Private lives on the server row rather than in settings: it is the one
     field the database itself reads, when it decides whether a new follow is
     accepted or held. So it loads and saves on its own, like the username. */
  const [priv, setPriv] = useState<boolean | null>(null)
  const [savedPriv, setSavedPriv] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let live = true
    void fetchPrivate(session.user.id)
      .then((v) => {
        if (!live) return
        setSavedPriv(v)
        /* Only when the switch has not been touched yet. A slow lookup landing
           after someone flipped it would otherwise flip it back under them,
           and the second flip is the one they meant. */
        setPriv((current) => (current === null ? v : current))
      })
      .catch((err) => live && setError((err as Error).message))
    return () => {
      live = false
    }
  }, [session])

  const dirty =
    shareName !== settings.shareName ||
    shareStreak !== settings.shareStreak ||
    shareCalories !== settings.shareCalories ||
    shareWater !== settings.shareWater ||
    shareSteps !== settings.shareSteps ||
    shareMacros !== settings.shareMacros ||
    shareWorkouts !== settings.shareWorkouts ||
    (priv !== null && priv !== savedPriv)


  return (
    <>
      <TopBar title="What you share" onBack={pop} solid />
      <div className="scroll">
        <div className="section-label">Your account</div>
        <div className="card">
          <Toggle
            label="Private account"
            sub="People have to ask before they can follow you. Anyone already following stays."
            checked={priv ?? false}
            onChange={setPriv}
          />
        </div>

        <div className="section-label">What followers see</div>
        <div className="card">
          <Toggle
            label="Your name"
            sub="Otherwise you appear as your username alone."
            checked={shareName}
            onChange={setShareName}
          />
          <Toggle
            label="Your logging streak"
            sub="Consecutive days logged, and the last day you logged one."
            checked={shareStreak}
            onChange={setShareStreak}
          />
          {/* Three rungs each, not a switch. "Share my steps" means either the
              percentage or the count, and both are things people want, so both
              are offered, and neither is implied by the other. */}
          <SegmentedField<ShareLevel>
            label="Calorie progress"
            sub="How far through your calorie target you are, or the number itself."
            value={shareCalories}
            options={FIGURE_LEVELS}
            onChange={setShareCalories}
          />
          <SegmentedField<ShareLevel>
            label="Water progress"
            sub="Percentage of your water goal, or the amount you drank."
            value={shareWater}
            options={FIGURE_LEVELS}
            onChange={setShareWater}
          />
          <SegmentedField<ShareLevel>
            label="Step progress"
            sub="Percentage of your step goal, or the step count."
            value={shareSteps}
            options={FIGURE_LEVELS}
            onChange={setShareSteps}
          />
          <SegmentedField<ShareLevel>
            label="Macro progress"
            sub="Protein, carbs and fat as percentages of target, or in grams."
            value={shareMacros}
            options={FIGURE_LEVELS}
            onChange={setShareMacros}
          />
          <SegmentedField<ShareLevel>
            label="Today's workouts"
            sub="No percentage applies here: the middle setting is the exercises you did, and the last adds the calories they burned."
            value={shareWorkouts}
            options={WORKOUT_LEVELS}
            onChange={setShareWorkouts}
          />
        </div>

        {error && (
          <div className="hint" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}
      </div>

      <SaveBar
        disabled={!dirty}
        onSave={() => {
          saveSettings({
            shareName,
            shareStreak,
            shareCalories,
            shareWater,
            shareSteps,
            shareMacros,
            shareWorkouts,
          })
          /* The toggles reach the server through the store's publish, which
             re-runs on the settings change. Only the private flag is written
             from here, and only when it actually moved. */
          if (priv !== null && priv !== savedPriv) {
            setPrivate(priv).catch((err) => setError((err as Error).message))
          }
          pop()
        }}
      />
    </>
  )
}
