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
 * Rewrites the imageUrl and photoCredit fields in place, across
 * src/data/authoredRecipes.ts and every themed batch in src/data/authored/.
 * The authored library outgrew one file, and a photo script that only knows
 * about the first one silently leaves the rest grey.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BATCH_DIR = join(ROOT, 'src/data/authored')

/** Every file that can hold authored recipes. */
function sourceFiles() {
  const batches = readdirSync(BATCH_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'recipe.ts')
    .map((f) => join(BATCH_DIR, f))
  return [join(ROOT, 'src/data/authoredRecipes.ts'), ...batches]
}
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

/* Words that describe how something is cooked or served rather than what it
   is. Every food photograph matches these, so requiring them proves nothing. */
const GENERIC = new Set([
  'roasted', 'baked', 'grilled', 'fried', 'seared', 'glazed', 'smoked',
  'braised', 'steamed', 'sliced', 'chopped', 'cooked', 'crispy', 'creamy',
  'homemade', 'fresh', 'plate', 'plated', 'bowl', 'bowls', 'pan', 'skillet',
  'tray', 'dish', 'dishes', 'packet', 'container', 'containers', 'food',
  'meal', 'dinner', 'lunch', 'breakfast', 'served', 'with', 'and', 'the',
  /* Cuts and shapes: "fillet" is true of any fish, "wedges" of any potato, so
     requiring them lets a salmon photograph answer a query for cod. */
  'fillet', 'fillets', 'wedges', 'slices', 'pieces', 'cutlet', 'cutlets',
  'chop', 'chops', 'breast', 'thigh', 'thighs', 'kisses', 'cups', 'jars',
])

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

  /* What the query is actually *about*.
   *
   * Anchoring on one word does not work in either direction: the last word is
   * a qualifier ("pan", "bowl") that every food photograph matches, and the
   * first is often a cooking verb, which is how "roasted okra pan" came back
   * with roasted chestnuts. So drop the words that describe how a thing is
   * cooked or served and require everything that is left — the ingredients and
   * the dish — to appear in the photographer's own description. */
  const required = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !GENERIC.has(w))

  const candidates = []
  for (const photo of data?.photos ?? []) {
    const alt = String(photo.alt ?? '').toLowerCase()

    /* Pexels ranks loosely too — "lassi" will return generic drinks. Where the
       photo carries a description, it must mention the dish; where it carries
       none, it is kept, because a missing alt is common and not a signal. */
    /* The subject has to be there; the rest only rank.
     *
     * Requiring every word found almost nothing — "cod lemon herbs" wants a
     * photograph tagged with all three, and photographers write one line about
     * the dish. Requiring the first word keeps cod photographs only, and the
     * others decide which cod photograph. */
    if (alt && required.length && !alt.includes(required[0])) continue
    const hits = required.filter((w) => alt.includes(w)).length

    /* Ingredient shots keep winning otherwise: a basket of raw okra is a
       perfect match for "okra" and useless as a recipe card. These words are
       how the photographer describes produce rather than a cooked dish. */
    if (/\b(raw|uncooked|ingredient|ingredients|harvest|market|farm|growing|seeds?)\b/.test(alt)) continue

    candidates.push({
      hits,
      url: photo.src.large,
      page: photo.url,
      licence: 'Pexels licence',
      author: photo.photographer ?? 'Unknown',
      title: photo.alt || query,
      width: photo.width ?? 0,
    })
  }
  /* Most of the query matched first, and Pexels' own ranking breaks ties. */
  return candidates.sort((a, b) => b.hits - a.hits)
}

async function main() {
  const files = sourceFiles()
  const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]))

  /* Only the ones still without a picture — Pexels throttles, so a run that
     gets halfway should be resumable rather than starting over. */
  const queries = []
  const owner = new Map()
  for (const [file, source] of sources) {
    for (const m of source.matchAll(/photo: '([^']+)',(\n\s+imageUrl:)?/g)) {
      if (m[2]) continue
      queries.push(m[1])
      owner.set(m[1], file)
    }
  }

  /* Two recipes sharing a photo query would both match the same
     `photo: '...'` string, so the write-back below would stamp one recipe
     twice and leave the other bare — which is exactly what happened once.
     Checked before any network call, and across every file rather than
     within one, now that the library is split up. */
  const seen = new Set()
  for (const q of queries) {
    if (seen.has(q)) throw new Error(`duplicate photo query: "${q}" — give each recipe its own`)
    seen.add(q)
  }

  console.log(`${queries.length} recipes need a photograph, across ${sources.size} files`)

  /* Seeded with every photograph already in the files, not just the ones this
     run picks. Two recipes sharing a picture reads as a bug, and a second run
     filling in the stragglers could not see what the first had used. */
  const used = new Set()
  for (const source of sources.values()) {
    for (const m of source.matchAll(/imageUrl: "([^"]+)"/g)) used.add(m[1])
  }
  const found = new Map()

  for (const query of queries) {
    try {
      const candidates = await withRetry(() => search(query), query)
      // Distinct pictures: two recipes sharing one photo reads as a bug.
      /* No fallback to a photograph already in use. Taking `candidates[0]`
         anyway is how two recipes ended up sharing one picture even with the
         used-set seeded — better to leave it and re-run with a different
         query. */
      const pick = candidates.find((c) => !used.has(c.url))
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

  const written = new Map()
  for (const [query, pick] of found) {
    const file = owner.get(query)
    const credit = `${pick.author.slice(0, 60)} · ${pick.licence}`
    const out = (written.get(file) ?? sources.get(file)).replace(
      `photo: '${query}',`,
      `photo: '${query}',\n    imageUrl: ${JSON.stringify(pick.url)},\n    photoCredit: ${JSON.stringify(credit)},`,
    )
    written.set(file, out)
  }
  for (const [file, out] of written) writeFileSync(file, out)
  console.log(`\nWrote ${found.size} photographs across ${written.size} files`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
