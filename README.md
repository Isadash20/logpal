# FitLog

A calorie and nutrition tracker for the web, built as a functional replica of a
mainstream mobile calorie counter. React 19 + Vite + TypeScript, no UI or chart
dependencies, all data in `localStorage`.

```bash
npm install
npm run dev
```

## What's here

**Today** — calorie ring (`Goal − Food + Exercise`), macro bars, per-meal
summary, water, weight trend, exercise.

**Diary** — the core screen. Date navigator with a calendar that dots logged
days. The `Goal − Food + Exercise = Remaining` equation rendered literally.
Four meals, each with entries, per-meal totals, and an overflow menu (Add Food,
Quick Add, Copy to Date, Save as Meal). Exercise split into Cardio and Strength.
Water, notes, and **Complete This Entry** — which produces the five-week
projection ("if every day were like today, you'd weigh…").

**Nutrition** — three tabs. *Calories* (donut by meal), *Nutrients* (full
Total / Goal / Left table across 17 nutrients), *Macros* (donut by macro,
grams vs goal, per-meal breakdown).

**Food search** — tabs for All / My Meals / My Recipes / My Foods. Recents and
favorites when idle. Searches the built-in database and Open Food Facts
simultaneously. Every row has a one-tap quick-add.

**Food detail** — serving picker, serving count, meal picker, macro donut, and
a full FDA-style Nutrition Facts panel that recalculates live.

**Four ways to log** — from the `+` button:

- **Barcode scan** — live camera decode via ZXing, then an Open Food Facts
  lookup. Not `BarcodeDetector`: that API only exists in Chromium, so on Safari
  and Firefox the camera opens and silently never decodes. Unknown barcodes
  route to Create Food with the number pre-filled.
- **Voice log** — Web Speech API. "two eggs and a cup of oatmeal" is parsed into
  quantity + food pairs, matched against the database, and shown for review
  before anything is logged. Typed fallback where speech isn't available.
- **Meal scan** — photograph the plate, describe it, get an estimate. The
  estimate comes from the description, not the image: there is no vision model
  connected, and the screen says so. Size words (*large*, *small*) scale
  portions.
- **Quick add** — calories, optionally with macros.

Camera features need a secure context (https, or localhost in dev) and report
the actual reason on failure rather than sitting there looking broken.

**Create food** — two-step wizard (identity + serving, then the nutrition
panel), with a sanity check when the macros don't add up to the stated calories.

**Meals & recipes** — bundle foods into a named meal; build a recipe from
ingredients, set servings made, log it per serving.

**Exercise** — 70+ cardio activities with MET values (calories derived from
MET × body weight × duration, so estimates track your current weight) and 60+
strength movements with sets/reps/weight.

**Progress** — weight chart over 30/90/180/365 days with a goal line,
current/change/to-goal metrics, BMI, six body measurements each with their own
history and chart, plus a calories tab with a 14-day bar chart and averages.

**Goals** — calorie goal, macro split (enforced to total 100%), weight goals,
weekly rate, activity level, fitness goals — and a panel showing the actual
arithmetic behind the calorie target rather than hiding it.

**Settings** — profile, units (lb/kg, ft-in/cm, cups/fl oz/ml), meal renaming,
whether exercise adds calories back, theme, data export, reset.

**Onboarding** — six-step first-run flow ending in the computed plan.

## How the numbers work

Calorie goals use **Mifflin-St Jeor** for BMR:

```
men:   10·kg + 6.25·cm − 5·age + 5
women: 10·kg + 6.25·cm − 5·age − 161
```

BMR × an activity factor (1.2 / 1.375 / 1.55 / 1.725) gives maintenance. The
activity factor covers **everyday movement only** — workouts are logged
separately and added back to the day's budget, which is why the factors are
lower than an all-in TDEE multiplier. The weekly goal is then applied at
3,500 kcal per pound, floored at 1,500 (men) / 1,200 (women).

Macros default to 50% carbs / 20% protein / 30% fat at 4/4/9 kcal per gram.

None of this is medical advice.

## Food data

Three layers behind one search:

- **Built-in** — 324 curated foods in `src/data/seedFoods.ts`, a pipe-delimited
  table. Whole foods from USDA FoodData Central, branded and restaurant items
  from published panels. The parser asserts the column count, so a stray pipe
  fails loudly instead of silently shifting every value in a row. These rank
  first, because they're the only ones anybody checked by hand.
- **Bulk database** — 25,000 products in `public/food-db.json`, generated from
  Open Food Facts. Shipped as a static file, not a bundled module, so nothing
  downloads it until the first search (~0.9 MB gzipped, ~76 ms to parse). Rows
  are stored positionally; object keys would be most of the file at this size.
- **Open Food Facts live** — search and barcode lookup for anything the offline
  layers miss. A successful scan is saved to the device and becomes searchable
  offline from then on.

### Rebuilding the bulk database

```bash
node scripts/build-food-db.mjs --pages 4        # ~15 min, writes ~120k foods
node scripts/trim-food-db.mjs --max 25000       # filter + dedupe down to ship size
```

The builder uses `search.openfoodfacts.org` (Search-a-licious). The legacy
`world.openfoodfacts.org/cgi/search.pl` returns 503s on roughly a third of
requests under load — ten terms in twenty-five minutes versus the whole run in
fifteen. Search-a-licious sends no CORS headers, so it is usable **only** from
Node; the browser code paths still use the legacy host. Sorting by
`-unique_scans_n` is what makes the result a database of things people eat
rather than obscure regional SKUs.

The trim step is not optional. The raw pull is 16 MB, and it is full of records
whose "name" is just the brand repeated — eight rows called *Chobani* tell you
nothing about which yoghurt you're logging. Trimming drops those, plus entries
whose macros can't account for their calories, then de-duplicates on name+brand
keeping the most-scanned.

Rate limits: the live API allows roughly 10 searches and 15 barcode lookups per
minute per IP, and punishes overuse by dropping CORS headers rather than
returning 429 — which surfaces in the browser as an indistinguishable "Failed to
fetch". `src/services/openFoodFacts.ts` therefore caches per query and enforces
a client-side token budget.

OFF rate-limits to roughly 10 searches and 15 lookups per minute per IP, and
punishes overuse by dropping CORS headers rather than returning 429. Searching
per keystroke exhausts that in seconds, so `src/services/openFoodFacts.ts`
caches results and enforces a client-side token budget, and the UI debounces at
700 ms and reports throttling honestly.

## Structure

```
src/
  types.ts              domain types
  lib/                  nutrition math, dates, units, formatting, persistence
  data/                 seed foods, exercise/MET table, nutrient definitions
  services/             Open Food Facts adapter, unified local search
  state/store.tsx       app state + navigation stack
  components/           icons, charts, shared UI, nutrition widgets
  screens/              one file per screen
```

Nutrition is stored **per serving as logged** on each diary entry, never
recomputed from the food record — so editing or deleting a food never rewrites
history.

## Persistence

Everything is in `localStorage` under `fitlog.v1`, behind the
`PersistenceAdapter` interface in `src/lib/storage.ts`. Moving to Supabase means
making `load`/`save` async, adding a `user_id`, and awaiting them in the store —
no screen changes. A `migrate()` step fills in fields added after a user's data
was first written.

Settings → Export Data writes a JSON snapshot; Reset All Data clears everything
and returns to onboarding.

## Not included

No account system, no social feed, no premium tier, no Apple Health / Google Fit
sync, no meal-photo recognition. Step counting is absent because the web has no
pedometer API.
