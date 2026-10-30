// Generates the client secret Supabase needs for the Apple provider.
// Usage: node scripts/apple-secret.mjs  → writes secrets/apple-client-secret.txt
// Re-run every ~6 months (Apple caps the secret's lifetime at 6 months).
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const TEAM_ID = 'BEVVQ898R9'
const KEY_ID = '75XV537V74'
const SERVICES_ID = 'com.logpal.app.signin'
const KEY_PATH = new URL('../secrets/AuthKey_75XV537V74.p8', import.meta.url)
const OUT_PATH = new URL('../secrets/apple-client-secret.txt', import.meta.url)

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' }
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + 180 * 24 * 60 * 60, // 180 days (< Apple's 6-month max)
  aud: 'https://appleid.apple.com',
  sub: SERVICES_ID,
}
const input = `${b64(header)}.${b64(payload)}`
const key = createPrivateKey(readFileSync(KEY_PATH))
const sig = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
const jwt = `${input}.${sig.toString('base64url')}`
writeFileSync(OUT_PATH, jwt + '\n')
console.log(`wrote ${OUT_PATH.pathname} (expires ${new Date(payload.exp * 1000).toISOString().slice(0, 10)})`)
