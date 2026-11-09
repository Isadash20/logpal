import { useEffect, useState } from 'react'
import { requireClient, takeAuthError } from '../lib/supabase'
import { Browser } from '@capacitor/browser'
import { NATIVE_AUTH_REDIRECT, isNative } from '../lib/native'
import { useT } from '../i18n'

type Mode = 'in' | 'up'


/** Google's mark, drawn inline. An OAuth button without it reads as generic. */
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
 * in. "Continue as guest" is deliberately kept: LogPal was a purely local app
 * before this, and someone who does not want an account should not lose the
 * app. They get exactly the old behaviour, on this device only. It was a quiet
 * link until 2026-11-01; it became a full button so that nobody, App Review
 * included, needs an account to try the app, and Settings → "Sign in to sync"
 * upgrades a guest later.
 */
export function Auth({ onSkip }: { onSkip(): void }) {
  const t = useT()
  const [mode, setMode] = useState<Mode>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /* Creating an account is two screens: the address first, then the password.
     Both on one page read as a sign-in form, and people typed their existing
     password into it. */
  const [upStep, setUpStep] = useState<'email' | 'password'>('email')

  const signingUp = mode === 'up'
  const askingPassword = !signingUp || upStep === 'password'

  /* A failed OAuth round trip comes back as parameters on the return URL and
     nothing else. No exception, no rejected promise, just the user landing
     back on this screen as though they had never left. Without this, a
     misconfigured Google client is indistinguishable from a mis-click. */
  useEffect(() => {
    /* Read from where the bootstrap put it rather than from the URL: the
       parameters are lifted off on startup so they cannot linger in the
       address bar of a device that was already signed in. */
    const held = takeAuthError()
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const fromQuery = new URLSearchParams(window.location.search)
    const code = held?.code ?? fromHash.get('error') ?? fromQuery.get('error')
    if (!code) return

    const description =
      held?.description ??
      fromHash.get('error_description') ??
      fromQuery.get('error_description') ??
      ''

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
    setError(null)
    setNotice(null)
    if (signingUp && upStep === 'email') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        setError(t('auth.badEmail'))
        return
      }
      setUpStep('password')
      return
    }
    setBusy(true)
    try {
      const db = requireClient()
      if (signingUp) {
        const { data, error } = await db.auth.signUp({ email, password })
        if (error) throw error

        // The handle and name are collected by AccountSetup once there is a
        // session to write them under; with email confirmation on there is not
        // one yet, so that happens after the first sign-in instead.
        if (!data.session) {
          setNotice(t('auth.checkEmail'))
        }
      } else {
        /* Either identifier works. Anything without an "@" is treated as a
           handle and resolved to its address first, because Supabase only ever
           authenticates on email. */
        let address = email.trim()
        if (!address.includes('@')) {
          const { data: resolved, error: rpcError } = await db.rpc('email_for_username', {
            handle: address,
          })
          if (rpcError) throw rpcError
          if (!resolved) throw new Error(t('auth.noUsername'))
          address = resolved as string
        }
        const { error } = await db.auth.signInWithPassword({ email: address, password })
        if (error) throw error
      }
    } catch (err) {
      const m = (err as Error).message
      setError(
        /invalid login/i.test(m)
          ? t('auth.badLogin')
          : /already registered/i.test(m)
            ? t('auth.exists')
            : /password/i.test(m) && /6/.test(m)
              ? t('auth.shortPassword')
              : m,
      )
    } finally {
      setBusy(false)
    }
  }

  async function google() {
    await oauth('google')
  }

  /* On the web the page itself goes to the provider and comes back. In the
     app the system browser does, because Google refuses to run inside an
     embedded web view, and the return is a deep link (see lib/native.ts). */
  async function oauth(provider: 'google' | 'apple') {
    setError(null)
    try {
      const native = isNative()
      /* Google signs the person straight in as whichever account the system
         browser already holds, with no chooser. `select_account` asks for the
         chooser every time, so a phone with a personal account can still sign
         in to a second one. Apple shows its own sheet regardless. */
      const queryParams = provider === 'google' ? { prompt: 'select_account' } : undefined
      const { data, error } = await requireClient().auth.signInWithOAuth({
        provider,
        options: native
          ? { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true, queryParams }
          : { redirectTo: window.location.origin, queryParams },
      })
      if (error) throw error
      if (native && data.url) await Browser.open({ url: data.url })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function swapMode() {
    setMode(signingUp ? 'in' : 'up')
    setUpStep('email')
    setPassword('')
    setError(null)
    setNotice(null)
  }

  return (
    <div className="scroll">
      <div className="auth">
        <div className="auth__head">
          {signingUp ? (upStep === 'email' ? t('auth.createAccount') : t('auth.choosePassword')) : t('auth.title')}
        </div>
        <div className="auth__sub">
          {signingUp ? (upStep === 'email' ? t('auth.subUp') : t('auth.subPassword', { email: email.trim() })) : t('auth.subIn')}
        </div>

        <form onSubmit={submit}>
          {askingPassword && signingUp ? null : (
          <label className="authfield">
            <span className="authfield__label">
              {signingUp ? t('auth.email') : t('auth.emailOrUsername')}
            </span>
            <input
              className="authinput"
              // Not type="email" when signing in. A username would fail the
              // browser's own validation before the form ever submits.
              type={signingUp ? 'email' : 'text'}
              autoComplete={signingUp ? 'email' : 'username'}
              inputMode={signingUp ? 'email' : 'text'}
              autoCapitalize="none"
              spellCheck={false}
              placeholder={signingUp ? t('auth.emailPlaceholder') : t('auth.emailOrUsernamePlaceholder')}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          )}

          {askingPassword && (
            <label className="authfield">
              <span className="authfield__label">{t('auth.password')}</span>
              <input
                className="authinput"
                type="password"
                autoComplete={signingUp ? 'new-password' : 'current-password'}
                placeholder={signingUp ? t('auth.atLeast6') : ''}
                required
                minLength={6}
                autoFocus={signingUp}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}

          {error && <div className="auth__error">{error}</div>}
          {notice && <div className="auth__notice">{notice}</div>}

          <div className="btn-wrap" style={{ paddingTop: 4 }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy
                ? t('auth.oneMoment')
                : signingUp
                  ? upStep === 'email'
                    ? t('auth.continue')
                    : t('auth.createAccount')
                  : t('auth.signIn')}
            </button>
          </div>
        </form>

        {signingUp && upStep === 'password' ? (
          <button
            className="linkbtn"
            onClick={() => {
              setUpStep('email')
              setError(null)
            }}
          >
            {t('auth.back')}
          </button>
        ) : (
          <button className="linkbtn" onClick={swapMode}>
            {signingUp ? t('auth.haveAccount') : t('auth.createAnAccount')}
          </button>
        )}

        <div className="auth__or">{t('auth.or')}</div>

        <div className="btn-wrap" style={{ paddingTop: 0 }}>
          <button className="btn btn--ghost" onClick={google} disabled={busy}>
            <GoogleMark />
            {t('auth.google')}
          </button>
        </div>

        {/* App Store Review Guideline 4.8: an app that offers a third-party
            sign-in has to offer Apple's too. Native only: on the web it would
            be a third button for a provider most people there do not use. */}
        {isNative() && (
          <div className="btn-wrap" style={{ paddingTop: 0 }}>
            <button className="btn btn--ink" onClick={() => void oauth('apple')} disabled={busy}>
              <AppleMark />
              {t('auth.apple')}
            </button>
          </div>
        )}

        <div className="btn-wrap" style={{ paddingTop: 0 }}>
          <button className="btn btn--ghost" onClick={onSkip} disabled={busy}>
            {t('auth.guest')}
          </button>
        </div>
        <div className="auth__foot">{t('auth.guestFoot')}</div>
      </div>
    </div>
  )
}

/** Apple's mark, white on the black button their guidelines ask for. */
function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
    </svg>
  )
}
