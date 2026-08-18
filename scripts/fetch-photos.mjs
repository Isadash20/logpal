#!/usr/bin/env node
/**
 * Finds a photograph for each authored recipe on Pexels.
 *
 * The USDA catalogue arrives with its own pictures; the recipes written for
 * LogPal do not, and a browse screen of grey placeholders is not worth
 * shipping. Commons has a very large amount of food photography under licences
 * a product can actually honour.
 *
 * Re-runnable: recipes that already carry a photograph are skipped, so a
 * throttled run can simply be run again.
 *
 *   node scripts/fetch-photos.mjs
 *
 * Rewrites the imageUrl and photoCredit fields in
 * src/data/authoredRecipes.ts in place.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src/data/authoredRecipes.ts')
const API = 'https://api.pexels.com/v1/search'

/* Read from .env.local rather than requiring it to be exported by hand. */
function pexelsKey() {
  if (process.env.PEXELS_API_KEY) return process.env.PEXELS_API_KEY
  try {
    const env = readFileSync(join(ROOT, '.env.local'), 'utf8')
    return env.match(/^PEXELS_API_KEY=(.+)$/m)?.[1]?.trim()
  } catch {
    return undefined
  }
}
const KEY = pexelsKey()
const UA = 'LogPal/0.1 (recipe photo lookup; contact via github.com/Isadash20/logpal)'

/**
 * Licences we can honour.
 *
 * CC0 and public domain ask for nothing. CC BY asks for credit, which is shown
 * on the recipe anyway, so it is in — and including it roughly quadruples the
 * pool, which is the difference between four recipes with photographs and
 * twenty.
 *
 * Share-alike is deliberately out. Its reciprocity clause is arguable once an
 * image sits inside a larger work, and an arguable licence is not worth a
 * photograph.
 */
const FREE = [/^cc0/i, /^public domain/i, /^pd/i, /^cc by(?!-sa| sa)/i]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function stripHtml(s) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Commons throttles hard; backing off is the difference between 4 and 20. */
async function withRetry(fn, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!String(err.message).includes('429') || attempt === 3) throw err
      const wait = 2000 * (attempt + 1)
      console.log(`      throttled, waiting ${wait / 1000}s — ${label}`)
      await sleep(wait)
    }
  }
}

async function search(query) {
  const params = new URLSearchParams({
    query,
    per_page: '15',
    /* Recipe cards are wider than they are tall. */
    orientation: 'landscape',
  })
  const res = await fetch(`${API}?${params}`, {
    headers: { authorization: KEY, 'user-agent': UA },
  })
  if (!res.ok) throw new Error(String(res.status))
  const data = await res.json()

  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  const head = words[words.length - 1]

  const candidates = []
  for (const photo of data?.photos ?? []) {
    const alt = String(photo.alt ?? '').toLowerCase()

    /* Pexels ranks loosely too — "lassi" will return generic drinks. Where the
       photo carries a description, it must mention the dish; where it carries
       none, it is kept, because a missing alt is common and not a signal. */
    if (alt && head && !alt.includes(head)) continue

    candidates.push({
      url: photo.src.large,
      page: photo.url,
      licence: 'Pexels licence',
      author: photo.photographer ?? 'Unknown',
      title: photo.alt || query,
      width: photo.width ?? 0,
    })
  }
  return candidates
}

async function main() {
  const source = readFileSync(SRC, 'utf8')
  /* Only the ones still without a picture — Commons throttles, so a run that
     gets halfway should be resumable rather than starting over. */
  const queries = [...source.matchAll(/photo: '([^']+)',(\n\s+imageUrl:)?/g)]
    .filter((m) => !m[2])
    .map((m) => m[1])
  console.log(`${queries.length} recipes need a photograph`)

  const used = new Set()
  const found = new Map()

  for (const query of queries) {
    try {
      const candidates = await withRetry(() => search(query), query)
      // Distinct pictures: two recipes sharing one photo reads as a bug.
      const pick = candidates.find((c) => !used.has(c.url)) ?? candidates[0]
      if (pick) {
        used.add(pick.url)
        found.set(query, pick)
        console.log(`  ✓ ${query}\n      ${pick.title} — ${pick.licence}`)
      } else {
        console.log(`  ✗ ${query} — nothing freely licensed`)
      }
    } catch (err) {
      console.log(`  ! ${query}: ${err.message}`)
    }
    await sleep(1100)
  }

  let out = source
  for (const [query, pick] of found) {
    const credit = `${pick.author.slice(0, 60)} · ${pick.licence}`
    out = out.replace(
      `photo: '${query}',`,
      `photo: '${query}',\n    imageUrl: ${JSON.stringify(pick.url)},\n    photoCredit: ${JSON.stringify(credit)},`,
    )
  }
  writeFileSync(SRC, out)
  console.log(`\nWrote ${found.size} photographs into authoredRecipes.ts`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
