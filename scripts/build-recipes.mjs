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
 * Writes public/recipes.json — an asset rather than a module, the same way the
 * food database ships. Five hundred recipes with their methods is most of a
 * megabyte, and a megabyte compiled into the bundle is a megabyte every visitor
 * downloads before the app paints, whether or not they open the Plan tab. As an
 * asset it is fetched on demand and cached by the browser for a week.
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
  /* USDA's footnote asterisks mean nothing once the note they point at has
     been folded into the sentence, and they leave ".." behind. */
  return out.map((s) =>
    s.replace(/\*+/g, '').replace(/\s*\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim(),
  )
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
  const kept = out.filter(
    (s) => s && !/^wash hands with soap and water\.?$/i.test(s),
  )
  return joinFragments(kept)
}

/**
 * USDA publishes one instruction per sentence, which turns asides into steps.
 *
 * The peach sorbet ended with three numbered steps reading "Serve immediately.",
 * "Freeze any leftovers…", and "They will not explode." — the last being the
 * back half of the sentence before it. A numbered step should be something you
 * do, so a sentence that only continues the previous one is folded back into it.
 *
 * Two things get folded: anything opening with a back-reference or a note
 * marker, which cannot stand alone by definition; and very short tails like
 * "Mix well." or "Serve hot.", which read better attached to the instruction
 * they qualify than as a step of their own.
 */
function joinFragments(steps) {
  const CONTINUES = /^(they|it|these|this|those|them|he|she|and|or|but|then|also|\*)\b/i
  /* Declarative asides — "Banana does not need to be frozen." — are notes on
     the previous instruction, not instructions. Matched narrowly: a verb-list
     test for "is this an instruction" folded 1039 real steps, because plenty
     open with "While the squash bakes" or "In a large bowl". */
  const ASIDE = /\b(does not|doesn't|do not need|is ok|it's okay|it's ok|will not|won't|may be|can be) \b/i
  const out = []
  for (const step of steps) {
    const isFragment =
      CONTINUES.test(step) || step.length < 30 || (ASIDE.test(step) && step.length < 70)
    if (isFragment && out.length) {
      out[out.length - 1] = `${out[out.length - 1].replace(/\s*$/, '')} ${step}`
    } else {
      out.push(step)
    }
  }
  return out
}

function imageFrom(image) {
  if (!image) return undefined
  if (typeof image === 'string') return image
  if (Array.isArray(image)) return typeof image[0] === 'string' ? image[0] : image[0]?.url
  return image.url
}

/** Pulls a number out of "3.41 g" / "132 calories". */
function amount(v) {
  if (v == null) return 0
  const m = String(v).match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 0
}

/**
 * USDA's own per-serving nutrition, captured at build time.
 *
 * This is the whole reason the catalogue can be five hundred recipes rather
 * than a hundred. Deriving nutrition by parsing every ingredient of every
 * recipe means thousands of searches across a quarter of a million foods, which
 * locked the main thread solid the moment the catalogue grew. These numbers
 * come from the people who wrote the recipes, they are already on the page, and
 * they are more accurate than anything the parser produces — so the lists,
 * cards and filters read them, and the parser is kept for the recipe detail
 * screen, the shopping list and logging, where per-ingredient answers are the
 * actual point.
 */
function nutritionFrom(n) {
  if (!n) return undefined
  const out = {
    calories: amount(n.calories),
    protein: amount(n.proteinContent),
    fat: amount(n.fatContent),
    satFat: amount(n.saturatedFatContent),
    carbs: amount(n.carbohydrateContent),
    fiber: amount(n.fiberContent),
    sugar: amount(n.sugarContent),
    sodium: amount(n.sodiumContent),
    cholesterol: amount(n.cholesterolContent),
  }
  return out.calories > 0 ? out : undefined
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

/**
 * How much of a recipe a recipe is.
 *
 * "Microwave Baked Potato" tells you to put a potato in a microwave. "Frozen
 * Banana Pops" is a banana, a stick and some foil. Both are real entries and
 * neither is worth a card on a browse screen, so the catalogue is chosen on
 * whether there is a dish here rather than on where it falls in the alphabet.
 *
 * Length of method matters more than count of steps: a recipe can be three
 * long paragraphs or eight words split over three lines, and only the first is
 * something you would cook.
 */
function substance(r) {
  const ingredients = r.ingredients.length
  const method = r.steps.join(' ')
  let score = 0

  score += Math.min(10, ingredients) * 3
  score += Math.min(8, r.steps.length) * 2
  score += Math.min(600, method.length) / 40

  if (r.imageUrl) score += 8
  // A dish, rather than a dip or a dressing to put on one.
  if (/main dish|main course|entree|dinner/i.test((r.tags ?? []).join(' '))) score += 10

  const n = r.nutritionPerServing
  if (n) {
    // Enough to be a meal, and enough protein to be worth eating as one.
    if (n.calories >= 300) score += 8
    if (n.calories >= 450) score += 8
    if (n.protein >= 15) score += 6
    if (n.protein >= 25) score += 6
  }

  // The floor: three things and a sentence is an instruction, not a recipe.
  if (ingredients <= 3) score -= 25
  if (r.steps.length <= 1) score -= 20
  if (method.length < 160) score -= 15

  return score
}

/**
 * Picks the catalogue, keeping the calorie range wide.
 *
 * Taking the top N by substance alone would still under-serve anyone bulking,
 * because USDA simply publishes few calorie-dense recipes and they would be
 * outnumbered however the list is sorted. So the substantial ones are chosen
 * within calorie bands, and the sparse upper bands are taken as fully as they
 * can be. A catalogue where the biggest meal is 500 calories is not a
 * catalogue for everybody.
 */
function chooseRecipes(all, limit) {
  const scored = all
    .map((r) => ({ r, s: substance(r), cal: r.nutritionPerServing?.calories ?? 0 }))
    // Never ship the ones that are barely recipes, whatever the quota.
    .filter((x) => x.s > 0)

  const BANDS = [
    { min: 450, max: Infinity, share: 0.3 },
    { min: 300, max: 450, share: 0.3 },
    { min: 150, max: 300, share: 0.25 },
    { min: 0, max: 150, share: 0.15 },
  ]

  const out = []
  const taken = new Set()
  for (const band of BANDS) {
    const quota = Math.round(limit * band.share)
    const pool = scored
      .filter((x) => x.cal >= band.min && x.cal < band.max && !taken.has(x.r.id))
      .sort((a, b) => b.s - a.s)
    for (const x of pool.slice(0, quota)) {
      taken.add(x.r.id)
      out.push(x.r)
    }
  }

  /* Bands that could not fill their quota — the top one always falls short —
     give their remainder back to whatever else scored well, so the catalogue
     still reaches its size. */
  if (out.length < limit) {
    for (const x of scored.filter((y) => !taken.has(y.r.id)).sort((a, b) => b.s - a.s)) {
      if (out.length >= limit) break
      taken.add(x.r.id)
      out.push(x.r)
    }
  }

  return out
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

  /* Everything, then chosen on merit.
   *
   * Sampling evenly across the alphabet avoided the truncation bug but
   * faithfully reproduced USDA's own mix, which is mostly dips, sides and
   * vegetable preparations: the median recipe came out at 186 calories, only
   * twenty of five hundred cleared 400, and none cleared 600. That is a fine
   * public-health library and a poor one to cook dinner from, and useless to
   * anyone eating to gain.
   *
   * So the whole index is fetched and the catalogue is selected afterwards —
   * see `chooseRecipes` — on how substantial each recipe actually is. */
  const picked = slugs
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

      const nutrition = nutritionFrom(item.nutrition)
      if (nutrition) {
        recipes[recipes.length - 1].nutritionPerServing = nutrition
        checks.push({ id: slugToId(slug), name: item.name, published: Math.round(nutrition.calories) })
      }

      process.stdout.write(`  ${String(i + 1).padStart(3)}/${picked.length} ${slug}\n`)
    } catch (err) {
      process.stdout.write(`  ! ${slug}: ${err.message}\n`)
    }
    await sleep(DELAY_MS)
  }

  const chosen = chooseRecipes(recipes, limit)
  process.stdout.write(
    `\nSelected ${chosen.length} of ${recipes.length} on substance\n`,
  )

  const payload = {
    /* Provenance travels with the data rather than living only in a comment,
       so anything that reads this file knows where it came from and under what
       licence, including tooling that never sees the build script. */
    source: 'USDA MyPlate Kitchen, via myplate.food',
    license: 'https://creativecommons.org/publicdomain/mark/1.0/',
    generatedBy: 'scripts/build-recipes.mjs',
    count: chosen.length,
    /** Per-serving calories as USDA published them, for checking our parser. */
    publishedCalories: Object.fromEntries(
      checks.filter((c) => chosen.some((r) => r.id === c.id)).map((c) => [c.id, c.published]),
    ),
    recipes: chosen,
  }

  const out = join(ROOT, 'public/recipes.json')
  writeFileSync(out, JSON.stringify(payload))
  const mb = (JSON.stringify(payload).length / 1024 / 1024).toFixed(2)
  process.stdout.write(
    `\nWrote ${chosen.length} recipes to public/recipes.json (${mb} MB)\n` +
      `  with published calories for ${checks.length} of them\n`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
