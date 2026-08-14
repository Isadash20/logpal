#!/usr/bin/env node
/**
 * Finds a photograph for each authored recipe on Wikimedia Commons.
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
const API = 'https://commons.wikimedia.org/w/api.php'
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
    action: 'query',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: '20',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '900',
    format: 'json',
  })
  const res = await fetch(`${API}?${params}`, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(String(res.status))
  const data = await res.json()
  const pages = Object.values(data?.query?.pages ?? {})

  const candidates = []
  for (const page of pages) {
    const info = page.imageinfo?.[0]
    if (!info) continue
    const meta = info.extmetadata ?? {}
    const licence = stripHtml(meta.LicenseShortName?.value)
    if (!FREE.some((re) => re.test(licence))) continue

    /* Diagrams, packaging shots and logos all match food searches and none of
       them look like dinner. Width is a decent proxy for a real photograph. */
    if ((info.thumbwidth ?? 0) < 500) continue
    const title = page.title.toLowerCase()
    if (/logo|icon|diagram|chart|map|label|nutrition facts/.test(title)) continue
    /* Commons is full of people, and food words turn up in surnames — a search
       for "dal lentil" returned a portrait of Paolo dal Pozzo Toscanelli. A
       title that reads like a person's name is not a photograph of dinner. */
    if (/portrait|painting|statue|coat of arms|\b(mr|mrs|sir|dr)\b/.test(title)) continue
    if (/^file:[a-z]+ [a-z]+ (de|dal|van|von|di) /.test(title)) continue

    candidates.push({
      url: info.thumburl,
      page: info.descriptionurl,
      licence,
      author: stripHtml(meta.Artist?.value) || 'Unknown',
      title: page.title,
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
