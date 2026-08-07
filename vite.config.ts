import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The commit this bundle was built from, baked in at build time.
 *
 * Without it there is no way to tell from the outside which code a deployment
 * is actually running, and guessing costs real time: a fix verified locally
 * and "verified" in production by reading the symptom rather than the build
 * sent us chasing a bug that had already been fixed but not yet shipped.
 *
 * Vercel exposes the SHA as an environment variable; locally it comes from git.
 */
function buildSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  }
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha()),
  },
})
