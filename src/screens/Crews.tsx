import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { Empty, Row, SegmentedField, Sheet, Spinner, Tabs, TextField, TopBar } from '../components/ui'
import { addDays, friendlyDate, today } from '../lib/dates'
import { AvatarCropper } from '../components/AvatarCropper'
import { challengeState, inviteLink, inviteMessage, parseInvite, standings, type MemberWeek } from '../lib/crews'
import { kindOf, type ChallengeKind } from '../lib/challenges'
import { ChallengeCard, NewChallengeSheet } from './Challenges'
import { catalogRecipes, loadCatalog } from '../services/recipeDb'
import { searchRecipes } from '../services/recipes'
import type { Person } from '../services/social'
import {
  createCrew,
  deleteCrew,
  deletePost,
  discoverCrews,
  fetchCrew,
  fetchMyCrews,
  giveKudos,
  joinCrew,
  joinPublicCrew,
  leaveCrew,
  postToCrew,
  previewCrew,
  shareRecipe,
  takeBackKudos,
  unshareRecipe,
  updateCrew,
  type Challenge,
  type CrewCard,
  type CrewDetail,
  type CrewPreview,
  type Member,
  type Post,
  type Visibility,
} from '../services/crews'

/**
 * Crews: a named group with a feed, challenges, a leaderboard and a shared
 * cookbook, joined by one link.
 *
 * Three screens. `Crews` lists yours and the public ones; `CrewDashboard` is
 * one crew, tabbed; `InviteLanding` is what a link opens for someone who has
 * not signed up yet, and is rendered by the shell ahead of the sign-in
 * screen. The join itself happens in the store once a session and a handle
 * exist, so the person taps one link, signs up, and lands in the crew.
 */

const KUDOS = ['👏', '🔥', '💪', '🎉'] as const
const EMOJIS = ['🏁', '🔥', '💪', '🥦', '🏃', '🚴', '🧘', '🥗', '🏋️', '🌞', '🐢', '🦁']

/** The crew's face: its photo when it has one, otherwise the emoji. */
function CrewFace({ emoji, photo, className }: { emoji: string; photo: string | null; className: string }) {
  return photo ? (
    <span className={`${className} crew-face--photo`}>
      <img src={photo} alt="" />
    </span>
  ) : (
    <span className={className}>{emoji}</span>
  )
}

function initialOf(p: Person): string {
  return (p.name || p.username).slice(0, 1).toUpperCase()
}

function displayName(p: Person): string {
  return p.name ?? `@${p.username}`
}

function weekOf(m: Member, posts: Post[]): MemberWeek {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const id = m.person.userId
  let mine = 0
  let kudos = 0
  for (const p of posts) {
    if (p.createdAt < since) continue
    if (p.userId === id && p.kind === 'chat') mine++
    for (const ids of Object.values(p.kudos)) if (ids.includes(id)) kudos++
  }
  return {
    userId: id,
    loggedDays: m.person.weekLoggedDays,
    calorieDays: m.person.weekCalorieDays,
    waterDays: m.person.weekWaterDays,
    stepDays: m.person.weekStepDays,
    steps: m.person.weekSteps,
    streak: m.person.streak,
    posts: mine,
    kudos,
  }
}

async function shareInvite(crewName: string, code: string, challenge: string | null): Promise<'shared' | 'copied' | 'failed'> {
  const text = inviteMessage(crewName, code, challenge)
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
  if (nav.share) {
    try {
      await nav.share({ text })
      return 'shared'
    } catch {
      /* Cancelled, or the sheet is not available here. Fall through. */
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/* ============================================================ the list == */

export function Crews({ asTab }: { asTab?: boolean } = {}) {
  const { pop, push, session, setLocalOnly } = useApp()
  const me = session?.user.id ?? null
  const [mine, setMine] = useState<CrewCard[] | null>(null)
  const [open, setOpen] = useState<CrewCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!me) return
    try {
      const [a, b] = await Promise.all([fetchMyCrews(me), discoverCrews(me)])
      setMine(a)
      setOpen(b)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [me])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!session) {
    return (
      <>
        <TopBar title="Crews" onBack={asTab ? undefined : pop} solid />
        <div className="scroll">
          <Empty title="Crews need an account">
            <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
              A crew is a group of accounts that can see each other, so it only works signed in.
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

  const join = async (card: CrewCard) => {
    setBusy(card.id)
    try {
      await joinPublicCrew(card.id)
      await refresh()
      push({ name: 'crew', id: card.id })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <TopBar
        title="Crews"
        onBack={asTab ? undefined : pop}
        solid
        right={
          <button className="iconbtn" onClick={() => setCreating(true)} aria-label="Start a crew">
            <Icon name="plus" size={22} strokeWidth={2.4} />
          </button>
        }
      />
      <div className="scroll">
        {error && (
          <div className="hint" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {mine === null ? (
          <Spinner />
        ) : mine.length ? (
          <div className="card" style={{ marginTop: 12 }}>
            {mine.map((c) => (
              <CrewRow key={c.id} crew={c} onClick={() => push({ name: 'crew', id: c.id })} />
            ))}
          </div>
        ) : (
          <div className="crew-intro">
            <div className="crew-intro__emoji">🏁</div>
            <div className="crew-intro__title">Start a crew</div>
            <div className="crew-intro__text">
              Friends, family, the office. One link gets everyone in, and then it is steps,
              water, logged days and kudos until someone wins.
            </div>
          </div>
        )}

        <div className="btn-wrap" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="btn" onClick={() => setCreating(true)}>
            Start a crew
          </button>
          <button className="btn btn--ghost" onClick={() => setJoining(true)}>
            I have a link
          </button>
        </div>

        {open && open.length > 0 && (
          <>
            <div className="section-head">Open crews</div>
            <div className="card">
              {open.map((c) => (
                <CrewRow
                  key={c.id}
                  crew={c}
                  right={
                    <button className="logpill" disabled={busy === c.id} onClick={() => void join(c)}>
                      Join
                    </button>
                  }
                />
              ))}
            </div>
            <div className="hint">Public crews can be joined by anyone. Private ones need the link.</div>
          </>
        )}
      </div>

      {creating && (
        <CrewSheet
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false)
            void refresh()
            push({ name: 'crew', id })
          }}
        />
      )}
      {joining && (
        <JoinSheet
          onClose={() => setJoining(false)}
          onDone={(id) => {
            setJoining(false)
            void refresh()
            push({ name: 'crew', id })
          }}
        />
      )}
    </>
  )
}

function CrewRow({ crew, right, onClick }: { crew: CrewCard; right?: React.ReactNode; onClick?(): void }) {
  const sub = [
    `${crew.members} member${crew.members === 1 ? '' : 's'}`,
    crew.challenge ?? (crew.visibility === 'public' ? 'Public' : 'Private'),
  ].join(' · ')
  return (
    <Row
      left={<CrewFace emoji={crew.emoji} photo={crew.photo} className="crew-badge" />}
      title={crew.name}
      sub={sub}
      right={right}
      chevron={!right}
      onClick={onClick}
    />
  )
}

/* The one Crews card on the Friends tab: your crews, and the way in. */
export function CrewsCard() {
  const { push, session } = useApp()
  const me = session?.user.id ?? null
  const [mine, setMine] = useState<CrewCard[] | null>(null)

  useEffect(() => {
    if (!me) return
    fetchMyCrews(me)
      .then(setMine)
      .catch(() => setMine([]))
  }, [me])

  if (!me) return null
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card__head">
        <div className="card__title">Crews</div>
        <button className="chip" onClick={() => push({ name: 'crews' })}>
          {mine && mine.length ? 'All' : 'Start one'}
        </button>
      </div>
      {mine === null ? (
        <Spinner />
      ) : mine.length ? (
        mine.slice(0, 3).map((c) => <CrewRow key={c.id} crew={c} onClick={() => push({ name: 'crew', id: c.id })} />)
      ) : (
        <div className="hint" style={{ paddingTop: 0 }}>
          A group with a feed, challenges and a leaderboard. One link gets everyone in.
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- sheets -- */

function CrewSheet({
  existing,
  onClose,
  onDone,
}: {
  existing?: { id: string; name: string; emoji: string; photo: string | null; visibility: Visibility }
  onClose(): void
  onDone(id: string): void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🏁')
  const [photo, setPhoto] = useState<string | null>(existing?.photo ?? null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [visibility, setVisibility] = useState<Visibility>(existing?.visibility ?? 'private')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ok = name.trim().length >= 2 && name.trim().length <= 40

  const save = async () => {
    setBusy(true)
    try {
      if (existing) {
        await updateCrew(existing.id, { name: name.trim(), emoji, photo, visibility })
        onDone(existing.id)
      } else {
        const crew = await createCrew({ name, emoji, photo, visibility })
        onDone(crew.id)
      }
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Sheet title={existing ? 'Edit crew' : 'Start a crew'} onClose={onClose}>
      <TextField label="Name" value={name} onChange={setName} placeholder="Morning Walkers" autoFocus />
      <div className="field field--stack">
        <span className="field__label">Icon</span>
        <div className="crew-pick">
          <CrewFace emoji={emoji} photo={photo} className="crew-pick__face" />
          <div className="avatarpick__actions">
            <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}>
              {photo ? 'Change photo' : 'Upload a photo'}
            </button>
            {photo && (
              <button className="btn btn--ghost btn--sm" onClick={() => setPhoto(null)}>
                Use an emoji instead
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setCropFile(f)
            }}
          />
          {cropFile && (
            <AvatarCropper
              file={cropFile}
              shape="rounded"
              title="Choose the crew photo"
              onClose={() => setCropFile(null)}
              onDone={(url) => {
                setPhoto(url)
                setCropFile(null)
              }}
            />
          )}
        </div>
        {!photo && (
          <div className="chips chips--wrap">
            {EMOJIS.map((e) => (
              <button key={e} className={`chip crew-emoji ${emoji === e ? 'chip--active' : ''}`} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      <SegmentedField<Visibility>
        label="Who can join"
        sub={visibility === 'private' ? 'Only people with the link.' : 'Anyone on LogPal can find and join it.'}
        value={visibility}
        options={[
          { value: 'private', label: 'Invite only' },
          { value: 'public', label: 'Public' },
        ]}
        onChange={setVisibility}
      />
      {error && (
        <div className="hint" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      <div className="btn-wrap">
        <button className="btn" disabled={!ok || busy} onClick={() => void save()}>
          {existing ? 'Save' : 'Create crew'}
        </button>
      </div>
    </Sheet>
  )
}

function JoinSheet({ onClose, onDone }: { onClose(): void; onDone(id: string): void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const code = parseInvite(text)

  const join = async () => {
    if (!code) return
    setBusy(true)
    try {
      onDone(await joinCrew(code))
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Sheet title="Join with a link" onClose={onClose}>
      <TextField label="Link or code" value={text} onChange={setText} placeholder="logpal…/join/ABCD2345" autoFocus />
      <div className="hint">Paste the link someone sent you, or just the eight-letter code at the end of it.</div>
      {error && (
        <div className="hint" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      )}
      <div className="btn-wrap">
        <button className="btn" disabled={!code || busy} onClick={() => void join()}>
          Join crew
        </button>
      </div>
    </Sheet>
  )
}

/* ======================================================== the dashboard == */

type CrewTab = 'feed' | 'compete' | 'recipes' | 'members'

export function CrewDashboard({ id }: { id: string }) {
  const { pop, push, session, username } = useApp()
  const me = session?.user.id ?? ''
  const [detail, setDetail] = useState<CrewDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<CrewTab>('feed')
  const [editing, setEditing] = useState(false)
  const [inviteNote, setInviteNote] = useState<string | null>(null)
  const [gone, setGone] = useState(false)

  const refresh = useCallback(async () => {
    try {
      if (import.meta.env.DEV && new URLSearchParams(location.search).has('crewdemo')) {
        const { demoCrew } = await import('../dev/demoCrew')
        setDetail(demoCrew(me))
        return
      }
      setDetail(await fetchCrew(id))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [id, me])

  useEffect(() => {
    void refresh()
    /* The chat has no push channel; a poll while the screen is open is enough
       for a group that talks a few times a day. */
    const t = window.setInterval(() => void refresh(), 20_000)
    return () => window.clearInterval(t)
  }, [refresh])

  useEffect(() => {
    if (gone) pop()
  }, [gone, pop])

  const weeks = useMemo(() => (detail ? detail.members.map((m) => weekOf(m, detail.posts)) : []), [detail])
  const people = useMemo(() => {
    const map = new Map<string, Person>()
    for (const m of detail?.members ?? []) map.set(m.person.userId, m.person)
    return map
  }, [detail])

  if (error && !detail) {
    return (
      <>
        <TopBar title="Crew" onBack={pop} solid />
        <div className="scroll">
          <div className="hint" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        </div>
      </>
    )
  }
  if (!detail) {
    return (
      <>
        <TopBar title="Crew" onBack={pop} solid />
        <Spinner />
      </>
    )
  }

  const { crew, members, challenges, posts, recipes } = detail
  const isOwner = crew.owner === me
  const current = challenges.find((c) => challengeState(c.starts, c.ends) !== 'ended') ?? null

  const invite = async () => {
    const r = await shareInvite(crew.name, crew.inviteCode, current?.title ?? null)
    setInviteNote(r === 'copied' ? 'Invite copied. Paste it anywhere.' : r === 'failed' ? `Send this link: ${inviteLink(crew.inviteCode)}` : null)
    if (r === 'copied') window.setTimeout(() => setInviteNote(null), 2500)
  }

  const leave = async () => {
    if (!window.confirm(isOwner ? 'Delete this crew for everyone?' : 'Leave this crew?')) return
    try {
      if (isOwner) await deleteCrew(crew.id)
      else await leaveCrew(crew.id, me)
      setGone(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <>
      <TopBar
        title={crew.name}
        onBack={pop}
        solid
        right={
          <button className="iconbtn" onClick={() => void invite()} aria-label="Invite">
            <Icon name="share" size={21} />
          </button>
        }
      />
      <div className="scroll">
        <div className="crew-hero">
          <CrewFace emoji={crew.emoji} photo={crew.photo} className="crew-hero__emoji" />
          <div className="crew-hero__main">
            <div className="crew-hero__name">{crew.name}</div>
            <div className="crew-hero__sub">
              {members.length} member{members.length === 1 ? '' : 's'} ·{' '}
              {crew.visibility === 'public' ? 'public' : 'invite only'}
              {current ? ` · ${current.title}` : ''}
            </div>
            <div className="crew-hero__faces">
              {members.slice(0, 6).map((m) => (
                <span key={m.person.userId} className="avatar avatar--sm" title={displayName(m.person)}>
                  {initialOf(m.person)}
                </span>
              ))}
              {members.length > 6 && <span className="crew-hero__more">+{members.length - 6}</span>}
            </div>
          </div>
          <button className="logpill" onClick={() => void invite()}>
            Invite
          </button>
        </div>
        {inviteNote && <div className="hint crew-note">{inviteNote}</div>}
        {error && (
          <div className="hint" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <Tabs
          tabs={[
            { key: 'feed' as CrewTab, label: 'Feed' },
            { key: 'compete' as CrewTab, label: 'Challenges' },
            { key: 'recipes' as CrewTab, label: `Recipes ${recipes.length || ''}`.trim() },
            { key: 'members' as CrewTab, label: 'Members' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'feed' && (
          <Feed crewId={crew.id} me={me} myName={username ?? 'you'} posts={posts} people={people} isOwner={isOwner} onChange={refresh} />
        )}
        {tab === 'compete' && (
          <Compete
            crewId={crew.id}
            me={me}
            weeks={weeks}
            people={people}
            challenges={challenges}
            onChange={refresh}
          />
        )}
        {tab === 'recipes' && (
          <SharedRecipes
            crewId={crew.id}
            me={me}
            recipes={recipes}
            people={people}
            isOwner={isOwner}
            onOpen={(rid) => push({ name: 'recipeView', recipeId: rid })}
            onChange={refresh}
          />
        )}
        {tab === 'members' && (
          <>
            <div className="card" style={{ marginTop: 12 }}>
              {members.map((m) => (
                <Row
                  key={m.person.userId}
                  left={<span className="avatar">{initialOf(m.person)}</span>}
                  title={
                    <>
                      {displayName(m.person)}
                      {m.person.userId === me ? <span className="crew-you"> you</span> : null}
                    </>
                  }
                  sub={`${m.role === 'owner' ? 'Started the crew' : `Joined ${friendlyDate(m.joinedAt.slice(0, 10))}`}${
                    m.person.streak ? ` · ${m.person.streak} day streak` : ''
                  }`}
                  chevron={m.person.userId !== me}
                  onClick={
                    m.person.userId !== me
                      ? () => push({ name: 'friendProfile', userId: m.person.userId, username: m.person.username })
                      : undefined
                  }
                />
              ))}
            </div>
            <div className="hint">
              Crew mates see what you share with followers: the same toggles, under Friends → What you share.
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row row--sub">
                <span className="row__title">Invite link</span>
                <span className="row__sub" style={{ wordBreak: 'break-all' }}>
                  {inviteLink(crew.inviteCode)}
                </span>
              </div>
              {isOwner && (
                <Row title="Edit name, badge, who can join" chevron onClick={() => setEditing(true)} />
              )}
              <Row
                title={<span style={{ color: 'var(--danger)' }}>{isOwner ? 'Delete crew' : 'Leave crew'}</span>}
                onClick={() => void leave()}
              />
            </div>
          </>
        )}
      </div>

      {editing && (
        <CrewSheet
          existing={{ id: crew.id, name: crew.name, emoji: crew.emoji, photo: crew.photo, visibility: crew.visibility }}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false)
            void refresh()
          }}
        />
      )}
    </>
  )
}

/* ---------------------------------------------------------------- feed -- */

function when(iso: string): string {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  return friendlyDate(iso.slice(0, 10))
}

function Feed({
  crewId,
  me,
  myName,
  posts,
  people,
  isOwner,
  onChange,
}: {
  crewId: string
  me: string
  myName: string
  posts: Post[]
  people: Map<string, Person>
  isOwner: boolean
  onChange(): Promise<void>
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const count = posts.length

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [count])

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setSending(true)
    try {
      await postToCrew(crewId, body)
      setText('')
      await onChange()
    } finally {
      setSending(false)
    }
  }

  const react = async (p: Post, emoji: string) => {
    const mineNow = Object.entries(p.kudos).find(([, ids]) => ids.includes(me))?.[0]
    if (mineNow === emoji) await takeBackKudos(p.id, me)
    else await giveKudos(p.id, emoji)
    await onChange()
  }

  const nameOf = (id: string) => (id === me ? myName : people.get(id) ? displayName(people.get(id)!) : 'Someone')

  return (
    <>
      <div className="crew-feed">
        {posts.length === 0 && (
          <div className="crew-feed__empty">
            Nothing here yet. Say hi, or log something: PRs and streaks post themselves.
          </div>
        )}
        {posts.map((p) => {
          const mine = p.userId === me
          const myKudos = Object.entries(p.kudos).find(([, ids]) => ids.includes(me))?.[0]
          const total = Object.values(p.kudos).reduce((s, ids) => s + ids.length, 0)
          return (
            <div key={p.id} className={`crew-post ${p.kind !== 'chat' ? 'crew-post--milestone' : ''} ${mine ? 'crew-post--mine' : ''}`}>
              {!mine && <span className="avatar avatar--sm">{nameOf(p.userId).slice(0, 1).toUpperCase()}</span>}
              <div className="crew-post__bubble">
                <div className="crew-post__meta">
                  <span className="crew-post__name">{mine ? 'You' : nameOf(p.userId)}</span>
                  <span className="crew-post__time">{when(p.createdAt)}</span>
                  {(mine || isOwner) && (
                    <button
                      className="crew-post__del"
                      aria-label="Delete"
                      onClick={() => void deletePost(p.id).then(onChange)}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  )}
                </div>
                <div className="crew-post__body">
                  {p.kind === 'milestone' && <span className="crew-post__star">★ </span>}
                  {p.body}
                </div>
                <div className="crew-post__kudos">
                  {KUDOS.map((k) => {
                    const n = p.kudos[k]?.length ?? 0
                    return (
                      <button
                        key={k}
                        className={`crew-kudo ${myKudos === k ? 'crew-kudo--on' : ''} ${n ? '' : 'crew-kudo--empty'}`}
                        onClick={() => void react(p, k)}
                      >
                        {k}
                        {n > 0 && <span>{n}</span>}
                      </button>
                    )
                  })}
                  {total > 0 && <span className="crew-post__count">{total}</span>}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      <div className="crew-composer">
        <input
          className="searchbar__input crew-composer__input"
          placeholder="Say something to the crew"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button className="logpill" disabled={!text.trim() || sending} onClick={() => void send()}>
          Send
        </button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------- compete -- */

function Compete({
  crewId,
  me,
  weeks,
  people,
  challenges,
  onChange,
}: {
  crewId: string
  me: string
  weeks: MemberWeek[]
  people: Map<string, Person>
  challenges: Challenge[]
  onChange(): Promise<void>
}) {
  const { push } = useApp()
  const [adding, setAdding] = useState(false)
  const nameOf = (id: string) => (id === me ? 'You' : people.get(id) ? displayName(people.get(id)!) : 'Someone')
  const board = standings(weeks)
  const live = challenges.filter((c) => challengeState(c.starts, c.ends) !== 'ended')
  const past = challenges.filter((c) => challengeState(c.starts, c.ends) === 'ended').slice(0, 3)

  return (
    <>
      {live.length ? (
        live.map((c) => <ChallengeCard key={c.id} challenge={c} me={me} people={people} onOpen={() => push({ name: 'challenge', id: c.id })} onChange={() => void onChange()} />)
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card__head">
            <div className="card__title">Challenge</div>
          </div>
          <div className="hint" style={{ paddingTop: 0 }}>
            No challenge running. Most steps or most water by the end wins, and everyone in the crew is in.
          </div>
        </div>
      )}
      <div className="btn-wrap" style={{ paddingTop: 0 }}>
        <button className="btn btn--ghost" onClick={() => setAdding(true)}>
          {live.length ? 'Add another challenge' : 'Start a challenge'}
        </button>
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">Leaderboard</div>
          <span className="card__meta">this week</span>
        </div>
        <div className="race">
          {board.map((s, i) => (
            <div key={s.userId} className={`race__row ${s.userId === me ? 'race__row--you' : ''}`}>
              <span className="race__rank">{i + 1}</span>
              <span className="avatar avatar--sm">{nameOf(s.userId).slice(0, 1).toUpperCase()}</span>
              <span className="race__main">
                <span className="race__name">
                  {nameOf(s.userId)}
                  {i === 0 && s.points > 0 && <span className="race__crown">👑</span>}
                </span>
                <span className="race__sub">{s.detail}</span>
              </span>
              <span className="race__value">
                {s.points}
                <small>pts</small>
              </span>
            </div>
          ))}
        </div>
        <div className="hint" style={{ paddingTop: 8 }}>
          Two points per day logged, one per goal hit, one per message or kudos (five a week at most).
        </div>
      </div>


      {past.length > 0 && (
        <div className="card">
          <div className="card__head">
            <div className="card__title">Past challenges</div>
          </div>
          {past.map((c) => (
            <Row key={c.id} title={c.title} sub={`${friendlyDate(c.starts)} – ${friendlyDate(c.ends)}`} />
          ))}
        </div>
      )}

      {adding && (
        <NewChallengeSheet
          crewId={crewId}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            void onChange()
          }}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------- recipes -- */

function SharedRecipes({
  crewId,
  me,
  recipes,
  people,
  isOwner,
  onOpen,
  onChange,
}: {
  crewId: string
  me: string
  recipes: CrewDetail['recipes']
  people: Map<string, Person>
  isOwner: boolean
  onOpen(recipeId: string): void
  onChange(): Promise<void>
}) {
  const [picking, setPicking] = useState(false)
  const nameOf = (id: string) => (id === me ? 'you' : people.get(id) ? displayName(people.get(id)!) : 'someone')
  return (
    <>
      {recipes.length ? (
        <div className="card" style={{ marginTop: 12 }}>
          {recipes.map((r) => (
            <Row
              key={r.recipeId}
              title={r.title}
              sub={`${r.note ? `“${r.note}” · ` : ''}shared by ${nameOf(r.userId)}`}
              right={
                r.userId === me || isOwner ? (
                  <button className="iconbtn" aria-label="Remove" onClick={() => void unshareRecipe(crewId, r.recipeId).then(onChange)}>
                    <Icon name="trash" size={18} />
                  </button>
                ) : undefined
              }
              chevron
              onClick={() => onOpen(r.recipeId)}
            />
          ))}
        </div>
      ) : (
        <Empty title="No recipes yet">
          <div style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 8px' }}>
            Share a recipe from the catalogue and the crew sees it here, with your note.
          </div>
        </Empty>
      )}
      <div className="btn-wrap">
        <button className="btn btn--ghost" onClick={() => setPicking(true)}>
          Share a recipe
        </button>
      </div>
      {picking && (
        <RecipePicker
          onClose={() => setPicking(false)}
          onPick={async (rid, title, note) => {
            await shareRecipe(crewId, rid, title, note)
            setPicking(false)
            await onChange()
          }}
        />
      )}
    </>
  )
}

function RecipePicker({ onClose, onPick }: { onClose(): void; onPick(id: string, title: string, note: string): Promise<void> }) {
  const { data } = useApp()
  const [q, setQ] = useState('')
  const [ready, setReady] = useState(false)
  const [chosen, setChosen] = useState<{ id: string; name: string } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadCatalog().then(() => setReady(true))
  }, [])

  const results = useMemo(() => {
    if (!ready) return []
    const all = catalogRecipes()
    const saved = new Set(data.savedRecipeIds)
    const list = q.trim() ? searchRecipes(all, q) : all.filter((r) => saved.has(r.id))
    return list.slice(0, 30)
  }, [ready, q, data.savedRecipeIds])

  if (chosen) {
    return (
      <Sheet title="Share a recipe" onClose={onClose}>
        <div className="row row--sub" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <span className="row__title">{chosen.name}</span>
        </div>
        <TextField label="Why you like it" value={note} onChange={setNote} placeholder="Ten minutes, and the kids eat it" autoFocus />
        <div className="btn-wrap">
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void onPick(chosen.id, chosen.name, note).finally(() => setBusy(false))
            }}
          >
            Share
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title="Share a recipe" onClose={onClose}>
      <div className="searchbar" style={{ padding: '0 0 8px' }}>
        <div className="searchbar__box">
          <Icon name="search" size={17} />
          <input className="searchbar__input" placeholder="Search the catalogue" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {!ready ? (
        <Spinner />
      ) : results.length ? (
        <div className="card card--flush">
          {results.map((r) => (
            <Row key={r.id} title={r.name} chevron onClick={() => setChosen({ id: r.id, name: r.name })} />
          ))}
        </div>
      ) : (
        <div className="hint">{q.trim() ? 'Nothing by that name.' : 'Your saved recipes show here. Or search the catalogue.'}</div>
      )}
    </Sheet>
  )
}

/* ================================================================ landing == */

/**
 * What an invite link opens for someone without an account. Rendered by the
 * shell in place of the sign-in screen while an invite is pending, so the
 * benefits come before the form. "Join" goes to sign-up; the store finishes
 * the join once there is a session and a handle.
 */
export function InviteLanding({ code, onContinue, onDismiss }: { code: string; onContinue(): void; onDismiss(): void }) {
  const [preview, setPreview] = useState<CrewPreview | null | undefined>(undefined)

  useEffect(() => {
    if (import.meta.env.DEV && code === 'DEMODEMO') {
      setPreview({ id: 'demo', name: 'Morning Walkers', emoji: '🏃', photo: null, visibility: 'private', members: 4, challengeTitle: '7-Day Steps Challenge', challengeKind: 'steps', challengeEnds: addDays(today(), 3) })
      return
    }
    previewCrew(code)
      .then(setPreview)
      .catch(() => setPreview(null))
  }, [code])

  const kind = preview?.challengeKind ? kindOf(preview.challengeKind as ChallengeKind) : null

  return (
    <div className="landing">
      <div className="landing__card">
        {preview === undefined ? (
          <Spinner />
        ) : preview === null ? (
          <>
            <div className="landing__emoji">🤔</div>
            <div className="landing__title">That link has expired</div>
            <div className="landing__text">Ask whoever sent it for a fresh one, or start a crew of your own.</div>
            <button className="btn" onClick={onDismiss}>
              Open LogPal
            </button>
          </>
        ) : (
          <>
            <CrewFace emoji={preview.emoji} photo={preview.photo} className="landing__emoji" />
            <div className="landing__kicker">You’re invited to</div>
            <div className="landing__title">{preview.name}</div>
            <div className="landing__sub">
              {preview.members} member{preview.members === 1 ? '' : 's'} on LogPal
              {preview.challengeTitle ? ` · ${preview.challengeTitle}` : ''}
            </div>
            <ul className="landing__list">
              <li>
                <span>🏁</span>
                {kind ? `${kind.blurb.replace(/\.$/, '')}, ${preview.challengeEnds ? `until ${friendlyDate(preview.challengeEnds)}` : 'this week'}.` : 'Step and water challenges with the crew.'}
              </li>
              <li>
                <span>👏</span>Kudos, a crew feed, and a leaderboard that counts showing up.
              </li>
              <li>
                <span>🥗</span>Log food by photo, barcode or voice. Free, no card.
              </li>
            </ul>
            <button className="btn" onClick={onContinue}>
              Join the crew
            </button>
            <button className="btn btn--ghost" onClick={onDismiss}>
              Not now
            </button>
            <div className="landing__fine">
              Joining shares with the crew only what you choose to share with followers. Nothing else.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
