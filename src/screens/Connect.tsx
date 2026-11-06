import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from '../components/Icon'
import { useT } from '../i18n'
import { pendingRequestCount } from '../services/social'

/** The Connect tab: two doors, Friends and Crews. */
export function Connect() {
  const { push, session } = useApp()
  const t = useT()
  const me = session?.user.id ?? null
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!me) return
    let live = true
    pendingRequestCount(me).then((n) => live && setPending(n)).catch(() => {})
    return () => {
      live = false
    }
  }, [me])

  return (
    <div className="scroll">
      <div className="pagetitle">{t('tabs.friends')}</div>

      <button className="door" onClick={() => push({ name: 'friends' })}>
        <span className="door__icon">
          <Icon name="user" size={26} strokeWidth={2.1} />
        </span>
        <span className="door__main">
          <span className="door__title">Friends</span>
        </span>
        {pending > 0 && <span className="badge">{pending} waiting</span>}
        <Icon name="forward" size={18} />
      </button>

      <button className="door door--crew" onClick={() => push({ name: 'crews' })}>
        <span className="door__icon door__icon--emoji">🏁</span>
        <span className="door__main">
          <span className="door__title">Crews</span>
        </span>
        <Icon name="forward" size={18} />
      </button>
    </div>
  )
}
