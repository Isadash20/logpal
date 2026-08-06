/// <reference types="vite/client" />

/**
 * Typed build-time configuration. Both are optional: without them LogPal runs
 * signed-out and device-local, which is the behaviour it had before sync.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
