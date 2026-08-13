#!/usr/bin/env node
/**
 * Builds the shipped recipe catalogue from USDA MyPlate Kitchen.
 *
 * ## Why this source and not a recipe site
 *
 * Recipe prose is copyrightable and almost every food blog reserves it, so the
 * obvious approach — scrape the sites Samsung Food indexes — cannot ship. These
 * recipes are federal works: MyPlate Kitchen was USDA's, and every page carries
 * `license: creativecommons.org/publicdomain/mark/1.0` with
 * `isAccessibleForFree: true`. Public domain, commercial use included.
 *
 * MyPlate Kitchen itself was retired on 7 January 2026; myplate.food preserves
 * the library. The licence travels with the work, not the host.
 *
 * They also happen to be the best possible fit: USDA wrote them, and the food
 * database this app already ships is USDA FoodData Central, so the ingredient
 * wording lines up with the food names far more often than a blog's would.
 *
 * ## Usage
 *
 *   node scripts/build-recipes.mjs --limit 60
 *
 * Writes src/data/catalogRecipes.ts. Re-runnable; output is deterministic for a
 * given set of slugs, which are taken in the site's own order.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://myplate.food'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const args = process.argv.slice(2)
const limit = Number(args[args.indexOf('--limit') + 1]) || 60

/** Polite: this is a small preservation site, not a CDN with infinite budget. */
const DELAY_MS = 220
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}

function ldRecipes(html) {
  const out = []
  const blocks = html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
  )
  for (const [, body] of blocks) {
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch {
      continue
    }
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      if (item && item['@type'] === 'Recipe') out.push(item)
    }
  }
  return out
}

/** "8 servings" / "Makes 4 servings" / ["6"] -> 8 */
function servingsFrom(y) {
  const text = Array.isArray(y) ? y.join(' ') : String(y ?? '')
  const m = text.match(/(\d+(?:\.\d+)?)/)
  return m ? Math.max(1, Math.round(parseFloat(m[1]))) : 4
}

/** ISO 8601 duration -> minutes. Absent on most of these, so nullable. */
function minutesFrom(iso) {
  if (!iso || typeof iso !== 'string') return null
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/)
  if (!m) return null
  const mins = (parseInt(m[1] ?? '0') * 60) + parseInt(m[2] ?? '0')
  return mins > 0 ? mins : null
}

function stepsFrom(instructions) {
  if (!Array.isArray(instructions)) return []
  const out = []
  for (const step of instructions) {
    if (typeof step === 'string') out.push(step.trim())
    else if (step?.text) out.push(String(step.text).trim())
    else if (step?.itemListElement) {
      for (const sub of step.itemListElement) {
        if (sub?.text) out.push(String(sub.text).trim())
      }
    }
  }
  /* Every USDA recipe opens with "Wash hands with soap and water." It is good
     public-health advice and terrible recipe step one — it pushes the actual
     cooking below the fold on a phone. Dropped, along with the equivalent
     closer, so the method reads as a method. */
  return out.filter(
    (s) => s && !/^wash hands with soap and water\.?$/i.test(s),
  )
}

function imageFrom(image) {
  if (!image) return undefined
  if (typeof image === 'string') return image
  if (Array.isArray(image)) return typeof image[0] === 'string' ? image[0] : image[0]?.url
  return image.url
}

/** Their published per-serving calories, used only to sanity-check our parser. */
function publishedCalories(nutrition) {
  const c = nutrition?.calories
  if (!c) return null
  const m = String(c).match(/(\d+(?:\.\d+)?)/)
  return m ? Math.round(parseFloat(m[1])) : null
}

/**
 * Tags, from their category and keywords.
 *
 * Their keyword lists carry provenance noise ("USDA Recipes", "MyPlate Kitchen")
 * that means nothing to someone filtering recipes, so those are dropped and the
 * food-group terms kept.
 */
const DROP_TAGS = new Set([
  'usda recipes',
  'myplate kitchen',
  'myplate recipes',
  'myplate',
])

function tagsFrom(item) {
  const raw = []
  const cat = item.recipeCategory
  if (cat) raw.push(...(Array.isArray(cat) ? cat : [cat]))
  const kw = item.keywords
  if (kw) raw.push(...String(kw).split(',').map((s) => s.trim()))

  const seen = new Set()
  const out = []
  for (const t of raw) {
    const clean = String(t).trim()
    if (!clean || DROP_TAGS.has(clean.toLowerCase())) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
  }
  return out.slice(0, 5)
}

function slugToId(slug) {
  return `usda_${slug.replace(/[^a-z0-9]+/g, '_')}`
}

async function main() {
  process.stdout.write(`Fetching index…\n`)
  const index = await get(`${BASE}/recipes`)
  const slugs = [
    ...new Set(
      [...index.matchAll(/href="\/recipes\/([a-z0-9-]+)"/g)].map((m) => m[1]),
    ),
  ]
  process.stdout.write(`  ${slugs.length} recipes listed, taking ${limit}\n`)

  /* Spread across the whole list, not the first N.
   *
   * The index is alphabetical, so slicing the head returns sixty ways to cook
   * an avocado and nothing past B. This codebase has been bitten by exactly
   * that once already — the shipped food database was alphabetically truncated
   * at "C" and had thirty-seven foods for D through Z (see §8 of HANDOFF.md).
   * Sampling at an even stride costs nothing and cannot fail the same way. */
  const picked = []
  const want = Math.min(limit, slugs.length)
  for (let i = 0; i < want; i++) {
    // Proportional rather than a fixed stride: a stride of floor(n/limit)
    // stops short of the end and quietly drops the tail of the alphabet.
    picked.push(slugs[Math.floor((i * slugs.length) / want)])
  }
  const recipes = []
  const checks = []

  for (let i = 0; i < picked.length; i++) {
    const slug = picked[i]
    try {
      const html = await get(`${BASE}/recipes/${slug}`)
      const [item] = ldRecipes(html)
      if (!item) {
        process.stdout.write(`  ! no structured data: ${slug}\n`)
        continue
      }

      const ingredients = (item.recipeIngredient ?? [])
        .map((s) => String(s).trim())
        .filter(Boolean)
      const steps = stepsFrom(item.recipeInstructions)
      if (!ingredients.length || !steps.length) {
        process.stdout.write(`  ! incomplete: ${slug}\n`)
        continue
      }

      const total = minutesFrom(item.totalTime)
      const prep = minutesFrom(item.prepTime)
      const cook = minutesFrom(item.cookTime)

      recipes.push({
        id: slugToId(slug),
        name: String(item.name).trim(),
        description: item.description ? String(item.description).trim() : undefined,
        servingsMade: servingsFrom(item.recipeYield),
        ingredients,
        steps,
        imageUrl: imageFrom(item.image),
        prepMin: prep ?? (total && cook ? Math.max(0, total - cook) : undefined),
        cookMin: cook ?? (total && prep ? Math.max(0, total - prep) : total ?? undefined),
        tags: tagsFrom(item),
        sourceUrl: `${BASE}/recipes/${slug}`,
        items: [],
        createdAt: 0,
      })

      const pub = publishedCalories(item.nutrition)
      if (pub) checks.push({ id: slugToId(slug), name: item.name, published: pub })

      process.stdout.write(`  ${String(i + 1).padStart(3)}/${picked.length} ${slug}\n`)
    } catch (err) {
      process.stdout.write(`  ! ${slug}: ${err.message}\n`)
    }
    await sleep(DELAY_MS)
  }

  const header = `// GENERATED by scripts/build-recipes.mjs — do not edit by hand.
//
// USDA MyPlate Kitchen recipes. Federal works, released under the Creative
// Commons Public Domain Mark 1.0 (creativecommons.org/publicdomain/mark/1.0),
// free to use commercially. Credited to USDA in the app because it is true and
// because provenance is worth showing, not because the licence demands it.
//
// Regenerate with: node scripts/build-recipes.mjs --limit ${limit}

import type { Recipe } from '../types'

/** Per-serving calories as USDA published them, for cross-checking our parser. */
export const CATALOG_PUBLISHED_CALORIES: Record<string, number> = ${JSON.stringify(
    Object.fromEntries(checks.map((c) => [c.id, c.published])),
    null,
    2,
  )}

export const CATALOG_RECIPES: Recipe[] = ${JSON.stringify(recipes, null, 2)}

export const CATALOG_BY_ID = new Map(CATALOG_RECIPES.map((r) => [r.id, r]))
`

  const out = join(ROOT, 'src/data/catalogRecipes.ts')
  writeFileSync(out, header)
  process.stdout.write(
    `\nWrote ${recipes.length} recipes to src/data/catalogRecipes.ts\n` +
      `  with published calories for ${checks.length} of them\n`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
