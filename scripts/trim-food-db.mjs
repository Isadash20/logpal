/**
 * Trims `public/food-db.json` to a size that's sane to ship.
 *
 *     node scripts/trim-food-db.mjs [--max 40000] [--in public/food-db.json]
 *
 * The builder writes everything it finds, which runs to six figures. That is a
 * ~20 MB download for a phone — worse than useless. Entries arrive in
 * popularity order per search term, so keeping the earliest occurrences keeps
 * the products people actually scan and drops the long tail of regional SKUs.
 *
 * Also drops records that survived the builder's checks but are still junk:
 * no name, no calories, or nonsense macro totals.
 */

import { readFile, writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const argVal = (f, d) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const MAX = Number(argVal('--max', '40000'))
const FILE = argVal('--in', 'public/food-db.json')

const db = JSON.parse(await readFile(FILE, 'utf8'))
const before = db.foods.length

/** Crowd-sourced names arrive with leading punctuation and stray separators. */
function cleanName(s) {
  return s
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[-–,;|]\s*$/, '')
    .trim()
}

// v = [kcal, carbs, fat, protein, ...]
const usable = []
const seen = new Set()

for (const f of db.foods) {
  const n = cleanName(f.n || '')
  const b = cleanName(f.b || '')
  if (n.length < 3) continue
  // A name that is mostly punctuation or digits is a code, not a food.
  if (!/\p{L}{3}/u.test(n)) continue

  /* Reject records whose "name" is just the brand again. Open Food Facts is
     full of these and they arrive as a wall of identical rows — eight entries
     called "Chobani" tells you nothing about which yoghurt you're logging. */
  const nk = n.toLowerCase()
  const bk = b.toLowerCase()
  if (bk && (nk === bk || nk.replace(bk, '').trim().length < 3)) continue

  const [kcal, c, fat, p] = f.v
  if (kcal <= 0) continue

  // Macros should roughly account for the calories; a wild mismatch means the
  // upstream record has a unit error somewhere.
  const implied = c * 4 + fat * 9 + p * 4
  if (implied > 0 && (implied > kcal * 2.5 || implied < kcal * 0.35)) continue

  // One row per name+brand; the first is the most-scanned.
  const key = `${nk}|${bk}`
  if (seen.has(key)) continue
  seen.add(key)

  usable.push({ ...f, n, b })
}

// Preserve insertion order (popularity) rather than the alphabetical sort the
// builder applied on the way out.
const kept = usable.slice(0, MAX).sort((a, b) => a.n.localeCompare(b.n))

await writeFile(FILE, JSON.stringify({ version: 1, count: kept.length, foods: kept }))

const mb = (JSON.stringify(kept).length / 1e6).toFixed(1)
console.log(
  `${before} → ${usable.length} usable → kept ${kept.length} (${mb} MB uncompressed)`
)
