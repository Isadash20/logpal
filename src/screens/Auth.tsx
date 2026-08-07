import { useEffect, useState } from 'react'
import { requireClient } from '../lib/supabase'

type Mode = 'in' | 'up'

/** Google's mark, drawn inline — an OAuth button without it reads as generic. */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

/**
 * Sign in / create account.
 *
 * Shown instead of the app when cloud sync is configured and nobody is signed
 * in. "Continue without an account" is deliberately kept: LogPal was a purely
 * local app before this, and someone who does not want an account should not
 * lose the app — they get exactly the old behaviour, on this device only. It is
 * a quiet link rather than a button, though, because it is the last resort
 * rather than a peer of signing in.
 */
export function Auth({ onSkip }: { onSkip(): void }) {
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const signingUp = mode === 'up'

  /* A failed OAuth round trip comes back as parameters on the return URL and
     nothing else — no exception, no rejected promise, just the user landing
     back on this screen as though they had never left. Without this, a
     misconfigured Google client is indistinguishable from a mis-click. */
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const fromQuery = new URLSearchParams(window.location.search)
    const code = fromHash.get('error') ?? fromQuery.get('error')
    if (!code) return

    const description =
      fromHash.get('error_description') ?? fromQuery.get('error_description') ?? ''

    setError(
      /redirect|redirect_uri/i.test(description)
        ? 'Sign-in came back to an address this project does not allow. Add this page’s URL under Authentication → URL Configuration in Supabase.'
        : /provider is not enabled/i.test(description)
          ? 'Google sign-in is not switched on for this project yet.'
          : description.replace(/\+/g, ' ') || `Sign-in failed (${code}).`,
    )

    // Strip the parameters so a reload does not resurrect a stale error.
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const db = requireClient()
      if (signingUp) {
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

  function swapMode() {
    setMode(signingUp ? 'in' : 'up')
    setError(null)
    setNotice(null)
  }

  return (
    <div className="scroll">
      <div className="auth">
        <div className="auth__head">{signingUp ? 'Create account' : 'LogPal'}</div>
        <div className="auth__sub">
          {signingUp
            ? 'Your diary on this device moves across automatically.'
            : 'Sign in to keep your diary on every device.'}
        </div>

        <form onSubmit={submit}>
          <label className="authfield">
            <span className="authfield__label">Email</span>
            <input
              className="authinput"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="authfield">
            <span className="authfield__label">Password</span>
            <input
              className="authinput"
              type="password"
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              placeholder={signingUp ? 'At least 6 characters' : ''}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <div className="auth__error">{error}</div>}
          {notice && <div className="auth__notice">{notice}</div>}

          <div className="btn-wrap" style={{ paddingTop: 4 }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'One moment…' : signingUp ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </form>

        <button className="linkbtn" onClick={swapMode}>
          {signingUp ? 'I already have an account' : 'Create an account'}
        </button>

        <div className="auth__or">or</div>

        <div className="btn-wrap" style={{ paddingTop: 0 }}>
          <button className="btn btn--ghost" onClick={google} disabled={busy}>
            <GoogleMark />
            Continue with Google
          </button>
        </div>

        <button className="linkbtn linkbtn--quiet" onClick={onSkip}>
          Continue without an account
        </button>
        <div className="auth__foot">
          Your diary stays on this device only, and clearing site data erases it.
        </div>
      </div>
    </div>
  )
}
