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
  url && key ? createClient(url, key) : null

export function cloudEnabled(): boolean {
  return supabase !== null
}

/** Narrowing helper for the many call sites that need a non-null client. */
export function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
