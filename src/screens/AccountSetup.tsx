import { useState } from 'react'
import { useApp } from '../state/store'
import { requireClient } from '../lib/supabase'
import { setUsername as claimUsername } from '../services/cloud'
import { displayNameFrom } from '../lib/storage'
import { setPrivate } from '../services/social'
import { AudienceField, DEFAULT_LEVELS, isPrivateAudience, levelsForAudience, levelsToSettings, type Audience } from '../components/SharingFields'

/**
 * The rest of signing up, once an address is verified.
 *
 * Reached two ways and deliberately identical from here on: after Google hands
 * back a session, and straight after an email sign-up. Google gives an address
 * and nothing else, so without this an account created that way would have no
 * handle at all, and a handle is what other people will search for.
 *
 * Two steps rather than one long form. The username step can fail on something
 * outside the user's control (taken), and putting it on its own page means that
 * failure does not throw away the rest of what they typed.
 */

/** Handles are what other people search for, so keep them plain. */
const USERNAME_RE = /^[a-z0-9_.]{3,20}$/

export function usernameProblem(name: string): string | null {
  const v = name.trim().toLowerCase()
  if (v.length < 3) return 'Usernames need at least three characters.'
  if (v.length > 20) return 'Usernames can be at most twenty characters.'
  if (!USERNAME_RE.test(v)) {
    return 'Usernames can use letters, numbers, full stops and underscores only.'
  }
  return null
}

/**
 * True when the handle is already someone else's.
 *
 * Only an early warning. The database's case-insensitive unique index is what
 * actually guarantees it, and two people racing for the same handle are settled
 * there, not here.
 */
export async function usernameTaken(handle: string): Promise<boolean> {
  const { data, error } = await requireClient()
    .from('logpal_usernames')
    .select('username')
    .ilike('username', handle.trim().toLowerCase())
    .maybeSingle()
  if (error) throw error
  return data !== null
}

export function AccountSetup() {
  const { session, setUsername, saveProfile, saveSettings, signOut } = useApp()
  /* Google and Apple hand back an address and nothing else. Asking for a
     password here means the account can also be opened with the username and
     password on a device without that Google account, and nobody is locked
     into one provider. Email sign-ups already chose one. */
  const needsPassword = !(session?.user.identities ?? []).some((i) => i.provider === 'email')
  const [step, setStep] = useState<'handle' | 'name' | 'password' | 'sharing'>('handle')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [audience, setAudience] = useState<Audience>('private')

  const [handle, setHandle] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function nextFromHandle(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = usernameProblem(handle)
    if (problem) return setError(problem)

    setBusy(true)
    try {
      if (await usernameTaken(handle)) {
        setError('That username is taken. Try another.')
        return
      }
      setStep('name')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function nextFromName(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!firstName.trim()) return setError('A first name is needed.')
    setStep(needsPassword ? 'password' : 'sharing')
  }

  async function nextFromPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) return setError('At least 6 characters.')
    if (password !== password2) return setError('The two passwords do not match.')
    setBusy(true)
    try {
      const { error } = await requireClient().auth.updateUser({ password })
      if (error) throw error
      setStep('sharing')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    setBusy(true)
    try {
      /* Claimed before the profile is saved. This is the step that can still
         fail on the unique index, and failing after writing the name would
         leave the account half set up. */
      await claimUsername(handle)
      /* Friends-only is the private flag on the server row; the levels are
         settings and sync like any other. Answered here, so the first-follow
         prompt never needs to ask. */
      await setPrivate(isPrivateAudience(audience))
      saveSettings({ ...levelsToSettings(levelsForAudience(audience, DEFAULT_LEVELS)), sharingAsked: true })
      setUsername(handle.trim().toLowerCase())
      saveProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        name: displayNameFrom(firstName, lastName),
      })
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      // Lost the race, so send them back to pick another.
      if (/taken/i.test(m)) setStep('handle')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scroll">
      <div className="auth">
        <div className="auth__head">
          {step === 'handle'
            ? 'Pick a username'
            : step === 'name'
              ? 'What should we call you?'
              : step === 'password'
                ? 'Choose a password'
                : 'Your progress and friends'}
        </div>
        <div className="auth__sub">
          {step === 'handle'
            ? `Signed in as ${session?.user.email ?? 'your account'}. Your username is how friends find you, and you can sign in with it.`
            : step === 'name'
              ? 'This is the name shown in the app. Only your first name is required.'
              : step === 'password'
                ? 'So you can also sign in with your username and password, on any device.'
                : 'Decide who can see how your day is going. Private is the default; you can change it any time.'}
        </div>

        {step === 'handle' ? (
          <form onSubmit={nextFromHandle}>
            <label className="authfield">
              <span className="authfield__label">Username</span>
              <input
                className="authinput"
                autoFocus
                autoCapitalize="none"
                spellCheck={false}
                placeholder="yourname"
                required
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
            </label>

            {error && <div className="auth__error">{error}</div>}

            <div className="btn-wrap" style={{ paddingTop: 4 }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
            </div>
          </form>
        ) : step === 'name' ? (
          <form onSubmit={nextFromName}>
            <label className="authfield">
              <span className="authfield__label">First name</span>
              <input
                className="authinput"
                autoFocus
                autoComplete="given-name"
                placeholder="Phillip"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>

            <label className="authfield">
              <span className="authfield__label">Last name (optional)</span>
              <input
                className="authinput"
                autoComplete="family-name"
                placeholder="Leave blank if you prefer"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </label>

            {error && <div className="auth__error">{error}</div>}

            <div className="btn-wrap" style={{ paddingTop: 4 }}>
              <button className="btn" type="submit" disabled={busy}>
                Continue
              </button>
            </div>

            <button className="linkbtn" onClick={() => setStep('handle')} type="button">
              Back
            </button>
          </form>
        ) : step === 'password' ? (
          <form onSubmit={nextFromPassword}>
            <label className="authfield">
              <span className="authfield__label">Password</span>
              <input
                className="authinput"
                type="password"
                autoFocus
                autoComplete="new-password"
                placeholder="At least 6 characters"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="authfield">
              <span className="authfield__label">Confirm password</span>
              <input
                className="authinput"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </label>

            {error && <div className="auth__error">{error}</div>}

            <div className="btn-wrap" style={{ paddingTop: 4 }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Continue'}
              </button>
            </div>

            <button className="linkbtn" onClick={() => setStep('name')} type="button">
              Back
            </button>
          </form>
        ) : (
          <form onSubmit={finish}>
            <div className="card" style={{ margin: 0 }}>
              <AudienceField value={audience} onChange={setAudience} />
            </div>
            <div className="hint" style={{ padding: '10px 4px 0' }}>
              Friends you accept see percentages either way. Fine-tune each figure any time under Settings → Privacy &amp; sharing.
            </div>

            {error && <div className="auth__error">{error}</div>}

            <div className="btn-wrap" style={{ paddingTop: 4 }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Finish'}
              </button>
            </div>

            <button className="linkbtn" onClick={() => setStep(needsPassword ? 'password' : 'name')} type="button">
              Back
            </button>
          </form>
        )}

        {/* Signing out is the only way past this screen. Someone who reached it
            by accident, wrong Google account, say, would otherwise be stuck. */}
        <button className="linkbtn linkbtn--quiet" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}
