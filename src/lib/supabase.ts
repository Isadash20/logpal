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
          /* Off on purpose. Left on, the client reads the OAuth fragment during
             its own initialisation while `consumeAuthFragment` reads the same
             fragment from the store — two owners of a one-shot value, and
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
 * read it — so the tokens were valid, the user was authenticated, and they
 * landed back on the sign-in screen looking rejected, with a bearer token
 * sitting in the address bar.
 *
 * This is now the only thing that touches the URL. `detectSessionInUrl` is off,
 * so there is no second reader competing for a one-shot value — that contest is
 * what made the previous attempt pass locally and fail on Vercel.
 *
 * Returns true when a session was established.
 */
export async function consumeAuthFragment(): Promise<boolean> {
  // TEMPORARY diagnostic breadcrumbs. Production behaves differently from dev
  // and three rounds of inference have been wrong, so record what actually
  // happens. Removed once the cause is known.
  const trail: string[] = []
  const note = (m: string) => {
    trail.push(m)
    try { window.localStorage.setItem(`logpal.authTrace`, JSON.stringify(trail)) } catch { /* ignore */ }
  }
  note(`enter hash=${window.location.hash.length} search=${window.location.search.length}`)
  note(`client=${supabase ? 'yes' : 'no'}`)
  if (!supabase) return false

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const access_token = hash.get('access_token')
  const refresh_token = hash.get('refresh_token')
  const code = query.get('code')
  note(`parsed at=${!!access_token} rt=${!!refresh_token} code=${!!code}`)
  if (!access_token && !code) { note('early-return'); return false }

  const clear = () => window.history.replaceState({}, '', window.location.pathname)

  try {
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token })
      if (error) throw error
      note('setSession ok')
      return true
    }
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) throw error
      return true
    }
    return false
  } catch (e) {
    note(`threw ${(e as Error)?.message ?? String(e)}`)
    return false
  } finally {
    // Cleared either way, so a reload cannot replay a spent token and the
    // address bar stops displaying a credential.
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
