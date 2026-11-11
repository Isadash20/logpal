import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { NATIVE_AUTH_REDIRECT, isNative } from './native'

/**
 * Supabase client, or `null` when the app has not been given credentials.
 *
 * Deliberately not a hard failure. LogPal worked entirely out of localStorage
 * before this existed and still does: without env vars it runs signed-out and
 * device-local, which keeps `npm run dev` working on a fresh clone and means a
 * misconfigured deploy degrades to the old behaviour instead of a white screen.
 * Every caller has to handle `null`, and `cloudEnabled()` is the check.
 *
 * Vite only exposes variables prefixed `VITE_`, and it inlines them at BUILD
 * time, setting them in Vercel after a deploy does nothing until the next
 * build. Same trap as the sibling Daily Planner project.
 */
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          /* Off on purpose. Left on, the client reads the OAuth fragment during
             its own initialisation while `consumeAuthFragment` reads the same
             fragment from the store. Two owners of a one-shot value, and
             whichever loses leaves the app signed out holding a spent token.
             That produced a fix that passed locally and failed on Vercel.
             One owner, below. */
          detectSessionInUrl: false,
        },
      })
    : null

/**
 * Completes an OAuth return, whichever shape Supabase sends it in.
 *
 * Two shapes exist. The implicit flow returns `#access_token=…&refresh_token=…`
 * in the fragment; the PKCE flow returns `?code=…` in the query, which has to be
 * exchanged. Google sign-in here was producing the first, and nothing in the app
 * read it, so the tokens were valid, the user was authenticated, and they
 * landed back on the sign-in screen looking rejected, with a bearer token
 * sitting in the address bar.
 *
 * This is now the only thing that touches the URL. `detectSessionInUrl` is off,
 * so there is no second reader competing for a one-shot value. That contest is
 * what made the previous attempt pass locally and fail on Vercel.
 *
 * Returns true when a session was established.
 */
/**
 * A failed OAuth return, held for whoever renders next.
 *
 * Supabase reports these as parameters on the return URL, and the sign-in
 * screen is the natural place to show them. But a device that was already
 * signed in never renders that screen, so the parameters used to sit in the
 * address bar for the rest of the session, error and all. They are lifted off
 * the URL here and kept in memory instead.
 */
let authError: { code: string; description: string } | null = null

export function takeAuthError(): { code: string; description: string } | null {
  return authError
}

/* Fired after every OAuth return has been handled, success or not. The
   sign-in screen is already on screen when a deep link arrives in the app,
   so a one-off read on mount would never see a failure that lands later. */
const AUTH_RETURN_EVENT = 'logpal:auth-return'
export function onAuthReturn(cb: () => void): () => void {
  window.addEventListener(AUTH_RETURN_EVENT, cb)
  return () => window.removeEventListener(AUTH_RETURN_EVENT, cb)
}
function announceAuthReturn() {
  window.dispatchEvent(new Event(AUTH_RETURN_EVENT))
}

export async function consumeAuthFragment(href?: string): Promise<boolean> {
  if (!supabase) return false

  /* On the web the return lands on the page itself. In the app it arrives as
     a deep link, handed in here as a string; `URL` parses the custom scheme
     well enough to give back its query and fragment. */
  let hashText = window.location.hash
  let queryText = window.location.search
  if (href) {
    try {
      const u = new URL(href)
      hashText = u.hash
      queryText = u.search
    } catch {
      return false
    }
  }
  const hash = new URLSearchParams(hashText.replace(/^#/, ''))
  const query = new URLSearchParams(queryText)

  const errorCode = hash.get('error') ?? query.get('error')
  if (errorCode) {
    authError = {
      code: errorCode,
      description: hash.get('error_description') ?? query.get('error_description') ?? '',
    }
    if (!href) window.history.replaceState({}, '', window.location.pathname)
  }

  const access_token = hash.get('access_token')
  const refresh_token = hash.get('refresh_token')
  const code = query.get('code')
  if (!access_token && !code) {
    /* A deep link that carries nothing usable is itself worth reporting:
       it is what a return from a mis-set redirect looks like. */
    if (href && !errorCode) {
      authError = { code: 'empty_return', description: 'The sign-in came back without a token.' }
    }
    if (href) announceAuthReturn()
    return false
  }

  const clear = () => {
    if (!href) window.history.replaceState({}, '', window.location.pathname)
  }

  try {
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token })
      if (error) throw error
      return true
    }
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) throw error
      return true
    }
    return false
  } catch (err) {
    // A stale or half-formed return is not worth blocking startup over; the
    // sign-in screen is the right place to land, and it says why.
    authError = { code: 'exchange_failed', description: (err as Error).message }
    return false
  } finally {
    // Cleared either way, so a reload cannot replay a spent token and the
    // address bar stops displaying a credential.
    clear()
    if (href) announceAuthReturn()
  }
}

/**
 * In the app, finishes a sign-in that went out through the system browser.
 *
 * iOS opens the app with the `logpal://auth…` URL Supabase redirected to;
 * the tokens on it are consumed exactly as a web return would be, and the
 * browser sheet is closed. Does nothing in a browser build. The session
 * then arrives through `onAuthStateChange` like any other.
 */
export function installNativeAuthListener(): void {
  if (!supabase || !isNative()) return
  void CapApp.addListener('appUrlOpen', ({ url }) => {
    if (!url.startsWith(NATIVE_AUTH_REDIRECT)) return
    void consumeAuthFragment(url).finally(() => {
      void Browser.close().catch(() => undefined)
    })
  })
}

export function cloudEnabled(): boolean {
  return supabase !== null
}

/** Narrowing helper for the many call sites that need a non-null client. */
export function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
