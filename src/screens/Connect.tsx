import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { useT } from '../i18n'
import { fetchConnections, pendingRequestCount } from '../services/social'
import { fetchMyCrews, type CrewCard } from '../services/crews'

/**
 * The Connect tab: a fork. Friends is following, one person at a time;
 * Crews is a group with a feed and a scoreboard. Each is its own screen, so
 * this one is only the two doors, with enough on each to know whether there
 * is something waiting behind it.
 */
export function Connect() {
  const { push, session } = useApp()
  const t = useT()
  const me = session?.user.id ?? null
  const [pending, setPending] = useState(0)
  const [following, setFollowing] = useState<number | null>(null)
  const [crews, setCrews] = useState<CrewCard[] | null>(null)

  useEffect(() => {
    if (!me) return
    let live = true
    pendingRequestCount(me).then((n) => live && setPending(n)).catch(() => {})
    fetchConnections(me).then((c) => live && setFollowing(c.following.length)).catch(() => {})
    fetchMyCrews(me).then((c) => live && setCrews(c)).catch(() => live && setCrews([]))
    return () => {
      live = false
    }
  }, [me])

  const friendsSub = !me
    ? 'Sign in to follow people'
    : following === null
      ? 'Follow people and see what they share'
      : following === 0
        ? 'Find someone by username'
        : `Following ${following} · see what they share`
  const crewsSub = !me
    ? 'Sign in to start or join one'
    : crews === null
      ? 'Challenges, a feed and a leaderboard'
      : crews.length === 0
        ? 'Start one and invite with a link'
        : crews.map((c) => c.name).slice(0, 3).join(' · ') + (crews.length > 3 ? ` +${crews.length - 3}` : '')

  return (
    <div className="scroll">
      <div className="pagetitle">{t('tabs.friends')}</div>

      <button className="door" onClick={() => push({ name: 'friends' })}>
        <span className="door__icon">
          <Icon name="user" size={26} strokeWidth={2.1} />
        </span>
        <span className="door__main">
          <span className="door__title">Friends</span>
          <span className="door__sub">{friendsSub}</span>
        </span>
        {pending > 0 && <span className="badge">{pending} waiting</span>}
        <Icon name="forward" size={18} />
      </button>

      <button className="door door--crew" onClick={() => push({ name: 'crews' })}>
        <span className="door__icon door__icon--emoji">🏁</span>
        <span className="door__main">
          <span className="door__title">Crews</span>
          <span className="door__sub">{crewsSub}</span>
        </span>
        {crews && crews.some((c) => c.challenge) && <span className="badge">challenge on</span>}
        <Icon name="forward" size={18} />
      </button>

      <div className="hint">
        Friends is one person at a time: follow, be followed, send a nudge. A crew is everyone at
        once: a shared feed, challenges, kudos and a leaderboard, joined by one link.
      </div>
    </div>
  )
}
