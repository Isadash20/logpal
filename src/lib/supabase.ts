import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
 * time — setting them in Vercel after a deploy does nothing until the next
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
          detectSessionInUrl: true,
        },
      })
    : null

/**
 * Completes an OAuth return that arrived as a URL fragment.
 *
 * Supabase can hand the session back two ways. The PKCE flow returns
 * `?code=…`, which the client exchanges by itself. The implicit flow returns
 * `#access_token=…&refresh_token=…`, and that is what Google sign-in was
 * actually producing here — the tokens were valid, the client never looked at
 * them, and the user landed back on the sign-in screen already authenticated
 * and apparently rejected.
 *
 * Rather than depend on which flow the server picks, the fragment is handled
 * explicitly. Returns true when a session was established.
 */
export async function consumeAuthFragment(): Promise<boolean> {
  if (!supabase) return false
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.includes('access_token')) return false

  const clear = () =>
    window.history.replaceState({}, '', window.location.pathname + window.location.search)

  /* Ask for the session first, and not just as an optimisation.
     `detectSessionInUrl` means the client may already be reading this very
     fragment, and both paths spend the same single-use refresh token — so
     whichever finishes second fails. Calling getSession() first is what
     resolves it: internally it awaits the client's initialisation, so by the
     time it answers, the built-in handling has either claimed the fragment or
     declined it. Racing it produced a fix that worked locally and failed in
     production, which is the worst possible outcome. */
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    clear()
    return true
  }

  const params = new URLSearchParams(hash)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return false

  try {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token })
    if (error) throw error
    return true
  } catch {
    // A stale or malformed fragment is not worth blocking startup over; the
    // sign-in screen is the right place to land.
    return false
  } finally {
    // Cleared either way, so a reload cannot replay a spent token, and so the
    // address bar stops showing a credential.
    clear()
  }
}

export function cloudEnabled(): boolean {
  return supabase !== null
}

/** Narrowing helper for the many call sites that need a non-null client. */
export function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
