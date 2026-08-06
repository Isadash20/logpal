import { useState } from 'react'
import { requireClient } from '../lib/supabase'
import { Icon } from '../components/Icon'

type Mode = 'in' | 'up'

/**
 * Sign in / create account.
 *
 * Shown instead of the app when cloud sync is configured and nobody is signed
 * in. "Continue without an account" is deliberately kept: LogPal was a purely
 * local app before this, and someone who does not want an account should not
 * lose the app — they get exactly the old behaviour, on this device only.
 */
export function Auth({ onSkip }: { onSkip(): void }) {
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const db = requireClient()
      if (mode === 'up') {
        const { data, error } = await db.auth.signUp({ email, password })
        if (error) throw error
        // With email confirmation switched on there is no session yet, and
        // saying nothing looks like the button did nothing.
        if (!data.session) {
          setNotice('Check your email to confirm the address, then sign in.')
        }
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      const m = (err as Error).message
      setError(
        /invalid login/i.test(m)
          ? 'That email and password do not match.'
          : /already registered/i.test(m)
            ? 'That email already has an account. Try signing in.'
            : /password/i.test(m) && /6/.test(m)
              ? 'Passwords need to be at least six characters.'
              : m,
      )
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    setError(null)
    try {
      const { error } = await requireClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) throw error
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="scroll" style={{ paddingTop: 48 }}>
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <div className="pagetitle" style={{ textAlign: 'center' }}>
          LogPal
        </div>
        <div className="hint" style={{ marginTop: -2 }}>
          {mode === 'in'
            ? 'Sign in to sync your diary across devices.'
            : 'Create an account to sync your diary across devices.'}
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="card">
          <label className="field">
            <span className="field__label">Email</span>
            <span className="field__control">
              <input
                className="input"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </span>
          </label>
          <label className="field">
            <span className="field__label">Password</span>
            <span className="field__control">
              <input
                className="input"
                type="password"
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </span>
          </label>
        </div>

        {error && (
          <div className="hint" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}
        {notice && <div className="hint">{notice}</div>}

        <div className="btn-wrap">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </form>

      <div className="btn-wrap">
        <button className="btn btn--ghost" onClick={google} disabled={busy}>
          Continue with Google
        </button>
      </div>

      <div className="btn-wrap">
        <button
          className="btn btn--ghost"
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in')
            setError(null)
            setNotice(null)
          }}
        >
          {mode === 'in' ? 'Create an account instead' : 'I already have an account'}
        </button>
      </div>

      <div style={{ height: 10 }} />

      <div className="btn-wrap">
        <button className="btn btn--ghost" onClick={onSkip}>
          Continue without an account
        </button>
      </div>
      <div className="hint" style={{ color: 'var(--text-3)' }}>
        <Icon name="info" size={13} /> Without an account your diary stays on this
        device only, and clearing site data erases it.
      </div>
    </div>
  )
}
