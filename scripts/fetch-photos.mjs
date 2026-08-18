#!/usr/bin/env node
/**
 * Finds a photograph for each authored recipe on Openverse.
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
const API = 'https://api.openverse.org/v1/images/'
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
    q: query,
    /* CC0 and public domain ask nothing; CC BY asks for credit, which the
       recipe shows anyway. Share-alike stays out — its reciprocity clause is
       arguable once an image sits inside a larger work. */
    license: 'cc0,pdm,by',
    page_size: '20',
    mature: 'false',
  })
  const res = await fetch(`${API}?${params}`, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(String(res.status))
  const data = await res.json()

  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  /* The dish itself, not its adjectives. "beef barbacoa tacos" must return
     tacos; matching any word let it return beef, or a house in Puerto Rico for
     "pina colada". The head noun is the last substantial word of the query. */
  const head = words[words.length - 1]
  const candidates = []

  for (const item of data?.results ?? []) {
    const url = item.url
    if (!url) continue

    /* Small images look like thumbnails on a full-width card. */
    if ((item.width ?? 0) < 600) continue

    const title = String(item.title ?? '').toLowerCase()

    /* Openverse ranks on more than the title, so it will return something for
       any query. Requiring a query word in the title is what stops a recipe
       getting a photograph of an unrelated subject that merely ranked well. */
    if (head && !title.includes(head)) continue

    /* Categories that match food words and never look like dinner. */
    if (/logo|icon|diagram|chart|\bmap\b|label|menu|sign|poster|packaging/.test(title)) continue
    if (/virus|bacteri|microscop|specimen|herbarium|disease|pathogen/.test(title)) continue
    if (/portrait|painting|statue|coat of arms|tattoo/.test(title)) continue
    /* Words that match a dish but describe an object, a place or a person:
       "lassi" pulled a Calico Lassie doll, "pina colada" a photograph of the
       house where it was invented. */
    if (/\bdoll\b|\btoy\b|figurine|costume|\bhouse\b|museum|clipart|illustration|vector|drawing|cartoon|\bsign\b|festival|parade|cactus|aircraft|plane|stand\b/.test(title)) continue

    candidates.push({
      url,
      page: item.foreign_landing_url ?? url,
      licence: `${String(item.license ?? '').toUpperCase()} ${item.license_version ?? ''}`.trim(),
      author: item.creator || 'Unknown',
      title: item.title ?? query,
      width: item.width ?? 0,
    })
  }

  /* Bigger first: on a phone the card is full-bleed, and upscaling shows. */
  candidates.sort((a, b) => b.width - a.width)
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
