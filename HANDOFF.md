# LogPal — handoff

Everything needed to pick this up cold in a new session. Started 2026-08-05,
current as of **2026-08-12**, commit `803a5ac`.

**Read this before touching anything.** It is not an overview — it is the set of
things that cost real time to learn, including several where the obvious
approach is wrong and the reason why. In particular: §2's incident note,
§4 on accounts and the OAuth fragment, §8's alphabetical-truncation bug, and
§10's testing notes.

**Fastest orientation:** run it (§2), open Settings → About to see which commit
you are on, then read §3 for what is verified and what is not.

---

## 1. What this is

**LogPal** — a calorie and nutrition tracker for the web, built as a functional
replica of MyFitnessPal and then pushed past it. Originally called *FitLog*,
renamed 2026-08-04.

- **Location:** `~/Documents/Projects/logpal` (was `~/Documents/Projects/fitness_app`)
- **GitHub:** https://github.com/Isadash20/logpal — public, branch `main`
- **Hosting:** Vercel, auto-deploys on every push to `main`. Already live.
- **Sibling project:** `~/Documents/Projects/daily_planner` is a separate app. Unrelated.

### Deliberate constraint

No MyFitnessPal branding, logo, or their licensed food database. The
information architecture, layouts, flows and calculations are replicated; the
assets and data are ours. The blue `#0066EE` and the cool neutrals were sampled
from their live site as reference values, which is fine — colours aren't
protectable — but nothing else was copied.

---

## 2. Running it

```bash
cd ~/Documents/Projects/logpal
npm install
npm run dev          # port 5180
npm run build        # tsc -b && vite build — must pass before committing
```

**Dev server config lives in the *other* project:**
`~/Documents/Projects/daily_planner/.claude/launch.json` has an entry named
`logpal` that runs `npm run dev --prefix ../logpal --port 5180`. This is because
the harness resolves launch configs from the primary working directory, which is
`daily_planner`. If the preview opens Daily Planner instead of LogPal, that's
why — start the preview by the name `logpal`.

**Environment variables.** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`,
in `.env.local` for development and in the Vercel project settings for
production. Copy `.env.example`. Both are safe in a browser bundle — the anon
key only grants what row level security allows.

The `VITE_` trap from Daily Planner **does** apply now: Vite inlines these at
*build* time, so setting them in Vercel does nothing until the next deploy.
Leaving them unset is supported and runs the app device-local.

### The two-hour bug, so nobody repeats it

Google sign-in appeared broken for a long stretch. It was never broken. The
Vercel environment variable `VITE_SUPABASE_ANON_KEY` had been set to the *shell
command that copies the key* rather than the key, so the production bundle
shipped a string beginning `grep VITE_SUPABASE_ANON_KEY ~/…| pbcopy` as its
credential. Supabase answered every authenticated call with **`Invalid API
key`**, which meant OAuth completed, returned a valid session, and the client
refused it.

Three things made it take far longer than it should have:

- The error was caught and swallowed, so nothing surfaced `Invalid API key`.
  **Surface the server's error before theorising about the symptom.**
- It worked locally and failed in production, because `.env.local` held the
  real key. A dev/prod split like that points at configuration, not code.
- There was no way to tell which commit a deployment was running, so a fix was
  twice declared verified against a build that did not contain it.

Hence `__BUILD_SHA__` (see `vite.config.ts`), shown on Settings → About. To
check what production is actually running:

```bash
curl -s https://logpal-two.vercel.app/ | grep -o '/assets/[^"]*\.js' |
  xargs -I{} curl -s https://logpal-two.vercel.app{} | grep -c '<sha>'
```

A sanity check worth keeping: the deployed bundle should contain a JWT whose
payload decodes to `role: anon`. If it contains no JWT at all, the environment
variable is wrong.

**Live project:** `egqetljdvslvfdmnecfk` (org LogPal). Verified end to end on
2026-08-06: sign-up, the localStorage lift, incremental upserts and deletes, a
wipe-and-restore on a simulated second device, and sign-out. Row level security
was checked by attempting an anonymous insert, which Postgres rejected (42501).

**Production URL:** https://logpal-two.vercel.app — the stable one. Vercel also
mints a per-deployment URL with a random hash on every push; never put that in
an OAuth or redirect allow-list, it changes each time.

**Google sign-in.** Google Cloud project `logpal-504803`, OAuth client
"LogPal Web". Scope is `email profile` only — non-sensitive, so Google requires
no app verification. Three places have to agree, and a mismatch in any one of
them is the usual cause of a failure:

| Where | Value |
|---|---|
| Google → Authorised redirect URIs | `https://egqetljdvslvfdmnecfk.supabase.co/auth/v1/callback` |
| Google → Authorised JavaScript origins | the app's own URLs, `https://logpal-two.vercel.app` and `http://localhost:5180` |
| Supabase → URL Configuration → Redirect URLs | the same app URLs, with `/**` |

The redirect URI points at *Supabase*, not at the app — Google returns the user
to Supabase, which then forwards them to whichever allowed app URL they came
from. If `redirect_to` is not on Supabase's list it silently falls back to the
Site URL rather than erroring, which makes a missing entry look like a
successful sign-in that landed on the wrong page.

The consent screen is in **Testing** mode, so only Google accounts listed under
Test users can sign in; everyone else gets `403: access_denied` on Google's own
page before ever reaching the app. Switch to In production before sharing.

Note that database also holds `habits`, `trackers`, `schedules`, `mental` from
an abandoned Daily Planner setup. Unrelated and harmless — everything here is
prefixed `logpal_` — but it is not a clean database, so do not assume a table
without the prefix belongs to this app.

### Supabase setup, from scratch

1. Create a project at supabase.com. Save the database password.
2. SQL Editor → paste all of `supabase/schema.sql` → Run. Idempotent, so it is
   safe to re-run after edits.
3. Authentication → Sign In / Providers → enable **Email**, and enable
   **Google** (needs a Google OAuth client; the callback URL is shown there).
4. Authentication → URL Configuration → set Site URL to the Vercel URL and add
   `http://localhost:5180` to Redirect URLs, or Google sign-in bounces to the
   wrong origin in development.
5. Project Settings → API → copy the Project URL and the **anon public** key
   into `.env.local` and into Vercel. Never the `service_role` key.

---

## 3. Current state

**Everything is pushed and deployed.** 25 commits, working tree clean, HEAD is
`803a5ac`, and production is confirmed running it. 45 TypeScript files in
`src/`, plus 40 MB of food database in `public/`.

Verify what production is actually running — do not infer it from behaviour:

```bash
curl -s https://logpal-two.vercel.app/ | grep -o '/assets/[^"]*\.js' |
  head -1 | xargs -I{} curl -s https://logpal-two.vercel.app{} |
  grep -o 'BUILD[^"]*' | head -1
```

Easier: Settings → About shows the commit. See §2's incident note for why this
exists.

### Working end to end, verified against the live project

Email sign-up, Google sign-in, the three-step account setup, username
uniqueness, cross-device sync, the 233k-food search, and Clear all data. Each
was exercised on production, not just locally.

### Never verified

**The barcode scanner's decode loop on a real device camera.** Everything
around it is proven — permission denial falls back correctly, manual entry
resolves through Open Food Facts and saves to the account — but the in-app
browser blocks camera access, so the ZXing decode itself has still never run
against a real lens. It needs a phone on the https URL.

### Notes — settled 2026-08-06

They said "remove the notes section completely", then later — while describing
Home's ordering — said "your weight, your notes", which left it ambiguous.
**Asked, and confirmed: remove it completely.** Notes is gone from the screens
(Home, Diary, the add sheet, `NoteScreen`) *and* from the data model —
`DayLog.note` and `setNote` are deleted. Saves written before this still carry
a `note` key; nothing reads it, so it is inert.

---

## 4. Stack

React 19 + Vite 6 + TypeScript. Plain CSS with CSS-variable themes. All charts
are hand-written inline SVG.

**Only two runtime dependencies beyond React:** `@zxing/browser` and
`@zxing/library`, for barcode decoding. No UI kit, no chart library, no router.

### Storage — local first, cloud behind it

`localStorage` under key **`logpal.v1`** is still the startup source of truth,
even with an account: it is synchronous, so the app paints real data instead of
a spinner, and it keeps working offline. `load()` migrates from the legacy
`fitlog.v1` key on first run and leaves the old key in place.

`migrate()` in `src/lib/storage.ts` backfills fields added after a user's data
was written — always add new `AppData` fields there or old saves crash.

**Supabase** (`src/services/cloud.ts`) syncs on top. Signing in reconciles:

- Cloud has data → it wins, because it has seen every device.
- Cloud is empty → this device's data is uploaded. That is the upgrade path
  from the localStorage-only version, and it is why an empty server never
  wipes a device.

The original plan in this document was "make `load`/`save` async and add a
`user_id`". That was wrong, and it is worth saying why: a whole-blob save is
last-write-wins, so logging breakfast on a phone and lunch on a laptop loses
one of them. Instead the store is untouched and `pushChanges(prev, next)` diffs
two `AppData` snapshots and writes only the rows that differ. One code path
rather than thirty hand-wired mutations, and a mutation added later syncs
itself as long as it goes through `update()`.

`src/services/cloud.test.ts` covers the differ — `npm test`. It is the code
that can silently lose a diary, so change it with tests rather than by eye.

**Without `VITE_` credentials the app runs exactly as it did before sync** —
signed out, device-local, no auth screen. Deliberate: a misconfigured deploy
degrades instead of showing a white screen.

### Accounts, sign-up and usernames

Three gates in `App.tsx`, in this order. Each returns early, so read them as a
funnel:

1. `!authReady` → blank. The session check reads localStorage and resolves in
   milliseconds; a spinner here reads as jank.
2. `!session && !localOnly` → `<Auth>`. Sign in, or create an account, or
   "Continue without an account" (which sets `logpal.localOnly` and gives the
   old device-local app).
3. `session && username === null` → `<AccountSetup>`. **This is the rest of
   signing up.**

That third gate is the important one. Google hands back an address and nothing
else, so without it a Google account would have no handle — and the handle is
the only thing other people can search on. The gate is phrased as "signed in
with no handle" rather than "just signed up", so it also catches an email
sign-up that waited on confirmation, and any account predating usernames.

`username` is `string | null | undefined` and the three states are load-bearing:
**undefined means still looking up**. Gating on undefined flashes the setup
screen at everyone on a slow lookup.

**The flow, either entry point:**

| Step | Collected | Where |
|---|---|---|
| 1 | Email + password, or Google | `Auth.tsx` |
| 2 | Username | `AccountSetup.tsx` |
| 3 | First name, optional last name | `AccountSetup.tsx` |

Two steps rather than one form, because step 2 can fail on something outside
the user's control (taken) and that should not discard what they typed in 3.

**Uniqueness** is guaranteed by a case-insensitive unique index in Postgres
(`logpal_usernames_lower`), plus `unique (user_id)` for one handle per account.
The check while typing is only an early warning; two people racing for the same
handle are settled by the index. Verified: `ISADASH20` is refused while
`isadash20` exists.

**Display name** is `firstName` + optional `lastName`, composed by
`displayNameFrom()` into `profile.name`, which is what every screen renders.
Profile edits the *parts*; editing the composed value directly would leave it
disagreeing with them.

**`logpal_usernames` is world-readable on purpose** — friend search needs to see
other people's handles. It holds nothing but the handle and a user id: no email,
no display name. Two consequences that have already bitten once:

- Any query against it **must filter by user_id**. An unfiltered
  `.maybeSingle()` returns the whole table and fails on "more than one row".
  That exact bug made the sign-up gate reappear for accounts that already had a
  handle.
- `email_for_username` is `SECURITY DEFINER` and turns a handle into the address
  behind it, because Supabase authenticates on email and username sign-in needs
  the translation. **Anyone who knows a handle can learn its email.** That is
  the price of username sign-in with no server of our own; the function returns
  one column for one row and exposes nothing else.

There is no delete policy on that table, so a handle can be *changed* but never
released. Deleting the account frees it, via the cascade.

**Sign-in accepts either identifier.** Anything without an `@` is treated as a
handle and resolved first. The field stops being `type="email"` in that mode, or
the browser rejects a username before the form submits.

### OAuth returns — one owner, deliberately

`detectSessionInUrl` is **off**. Supabase returns a session either as
`?code=` (PKCE) or `#access_token=…` (implicit), and `consumeAuthFragment()` in
`src/lib/supabase.ts` handles both. With the built-in reader also enabled, two
things read the same one-shot value and whichever lost left the app signed out
holding a spent token — which passed locally and failed on Vercel. One owner.

It runs before the first `getSession()`, or that call resolves as "signed out"
and paints the sign-in screen over a session that exists.

### Navigation

There is **no router**. `src/state/store.tsx` holds a `Route[]` stack with
`push` / `pop` / `setTab`. The browser back button is wired to `pop` via
`popstate`. The URL never changes — every route is `/`.

Tabs: **Home · Plan · Progress · Settings**. The Diary is a *pushed* screen
reached from Home → "View all", not a tab.

---

## 5. Design system

`src/styles/tokens.css` is the single source of colour. Changing a scheme is a
one-file edit.

| Token | Light | Dark |
|---|---|---|
| `--accent` (calories) | `#0066EE` | `#4D94FF` |
| `--carbs` | `#38BDF8` | `#8FDCFF` |
| `--fat` | `#1E40AF` | `#4C6EF5` |
| `--protein` | `#F59E0B` | `#FBBF24` |
| `--water` | `#0891B2` | `#22A5C7` |
| `--ink` (chrome) | `#151824` | `#0B0E17` |
| `--bg` wash | `#E7EAF3` → `#D9E4F5` | `#0B0E17` |
| `--gold` | `#F5C542` | — |

**Why these macro colours:** two blues from the accent's own family separated by
lightness, plus one warm. The user asked for macros derived from the calorie
colour; a pure same-hue triad was prototyped and rejected because three shades
of one hue separate by lightness alone, which is unreadable on an 8px bar.
Blue-against-amber is also the only contrast that survives red-green
colourblindness. Dark mode lifts fat to a mid blue because the light-mode navy
vanishes on a dark background.

### Layout language

- Cards **float** on the wash: 16px radius, 14px side margins, never edge-to-edge.
- Large left-aligned page titles (`.pagetitle`, 30px/800).
- Floating pill nav with a **separate** circular FAB beside it (`.navdock`).
- Section headers are large left-aligned text (`.section-head`), not tiny caps.
- Settings uses `.banner` — a full-width tappable card that opens its own page.

Two prior palette explorations were rejected. Warm-tinted neutrals (bone,
ivory, greige) read as "yellowish" and were rejected outright. **Keep neutrals
cool / blue-biased.**

---

## 6. Features

**Home**, in this order — the order was specified and matters:

1. Page title, with a **logging streak** chip beside it (flame + "3 days")
2. Week strip
3. Calories card
4. Macros card (3 columns + segmented bar)
5. **Fasting and Water tiles, side by side** — each a whole-card button through
   to its own screen
6. Diary rows per period, with a blue "Log" pill
7. Healthy habits (exercise only — water has its own tile)
8. Weight

Fasting and water used to sit *below* the diary, which on a phone meant
scrolling past four meal cards, so in practice nobody saw them.

**The week strip carries three states** and they are easy to collapse into each
other. Logged fills dark with a tick; the *viewed* day fills accent-blue with a
ring, and shows a white dot when nothing is logged; *today* keeps a dot above
its letter, which starts mattering the moment you navigate away from it. Before
this, a fully-logged week was seven identical circles.

**The streak** counts consecutive days with calories — the same rule as the
strip's ticks, so the two can never disagree. It counts back from *yesterday*
when today is still empty; anchoring on today would reset a long streak every
midnight and hand it back after breakfast. Hidden at zero.

**The fasting tile is a stopwatch, not a streak.** `0:00 · Not fasting · 16h
plan` at rest, elapsed time against target while one runs. It used to report
"0 day streak", which is a statistic nobody asked for that reads as a scolding.

**Diary** — pushed screen. `Goal − Food + Exercise = Remaining`, macro bars,
week strip, water, entries grouped by period, exercise, "Complete this day"
with the five-week weight projection.

**Plan tab** — daily targets, repeat meals, my meals, my recipes, my foods,
shortcuts.

**Progress** — weight chart (30/90/180/365 days, scrubable, goal line), BMI,
six body measurements each with their own history, calories tab with a 14-day
bar chart and averages.

**Settings** — a **clickable profile card** at the top, then banners: Foods ·
Plan · Intermittent fasting · Units · Appearance · About.

The card is the only way into the profile. There used to be an inert summary
card *plus* an Account banner *plus* a Profile banner — three entry points for
one idea. **Profile** now holds all of it: email, sync state, username, sign
out, first/last name, sex, date of birth, height, and **Clear all data** at the
bottom.

**Every preferences screen commits through a save bar**, and backing out
discards. Plan, Food database and Appearance used to write on each keystroke,
so a mistyped digit in "minutes per workout" was saved — and pushed to the
account — before it could be corrected. Save is disabled until something
differs. Appearance therefore no longer previews the theme as you pick it;
consistency across the screens was judged worth more than the preview.

**Clear all data** deletes the account's rows too when signed in, not just the
device — clearing one side only would be a lie, since the next sync pulls it
straight back.

There is **no Food database screen**. Nothing about the food data is optional
any more; see §8.

**Nutrition screen** — Calories (donut by period), Nutrients (Total/Goal/Left
across 17 nutrients), Macros.

**Four ways to log**, from the `+` FAB:

1. **Barcode scan** — live camera decode via **ZXing**. Not `BarcodeDetector`:
   that API is Chromium-only, so on Safari and Firefox the camera opened and
   silently never decoded. This was a reported bug and this is the fix.
   Successful scans are saved to the device and become searchable offline.
2. **Voice log** — Web Speech API. Parses "two eggs and a cup of oatmeal" into
   quantity + food pairs, matches against the database, shows everything for
   review before logging. Typed fallback where speech is unavailable.
3. **Meal scan** — photo, then a written description, then an estimate.
   **There is no vision model connected.** The estimate comes from the
   description, not the image, and the screen says so. Size words (*large*,
   *small*) scale portions. Wiring a real recogniser needs an API key.
4. **Quick add** — calories, optionally macros.

**Intermittent fasting** — seven protocols (12:12 → OMAD → custom), live ring
timer that counts past target, eating-window schedule, streak / longest /
average / hit-rate, deletable history. A fast is stored as a start timestamp
plus a target; everything else is derived, so it survives app closure.

**Onboarding** — 8 steps: sex → age → height & weight → body type → activity →
goal → pace → plan. Ends with the computed plan **and a recommended fasting
window** derived from the goal.

---

## 7. The numbers

`src/lib/nutrition.ts` is the single source of truth. `resolvePlan()` returns
everything; screens never compute targets themselves.

**BMR — Mifflin-St Jeor** (not Harris-Benedict, which is widely misquoted in its
place, including in MyFitnessPal's own community posts):

```
men:   10·kg + 6.25·cm − 5·age + 5
women: 10·kg + 6.25·cm − 5·age − 161
```

Activity multipliers `1.2 / 1.375 / 1.55 / 1.725` cover **everyday movement
only** — logged workouts are added back to the day, which is why they're lower
than an all-in TDEE figure. Weekly goal applied at 3,500 kcal/lb. Floored at
1,500 (men) / 1,200 (women), with a visible warning when the floor bites.

**Protein is anchored to lean mass, not body weight** — scaling to total weight
over-prescribes for heavier bodies. Lean mass comes from the self-reported body
type's body-fat estimate.

Plans deliberately diverge at the extremes (this was an explicit request):

| Goal | cal | carbs | fat | protein | fasting rec |
|---|---|---|---|---|---|
| Very aggressive cut | 1,500 | 105 g | 37 g | 188 g | 18:6 |
| Steady cut | 1,910 | 173 g | 47 g | 199 g | 16:8 |
| Maintain | 2,410 | 284 g | 80 g | 138 g | 14:10 |
| Recomp | 2,285 | 220 g | 61 g | 214 g | 16:8 |
| Hard bulk | 2,910 | 340 g | 91 g | 184 g | 12:12 |

*(180 lb athletic male, 36, 5'10", lightly active)*

**Hydration** — `waterGoalMl()`: body mass × a per-kg figure that falls with
age, plus an activity allowance, plus height above 5'6", plus 12 ml per logged
exercise minute. Clamped 1.4–5.0 L. Shown in the user's chosen unit everywhere.

---

## 8. Food data — four layers

1. **Curated seed** — 324 foods in `src/data/seedFoods.ts`, a pipe-delimited
   table (15 columns). **Ranked first in search** because they're the only ones
   checked by hand. The parser asserts the column count.
2. **Core offline DB** — 58,381 foods in `public/food-db.json` (10.5 MB, 2.6 MB
   gzipped). Every USDA generic food plus the 45,000 best-ranked branded
   products. Fetched on the first search, then HTTP-cached for a week.
3. **Extended offline DB** — 175,000 more branded products in
   `public/food-db-ext.json` (29.7 MB, 7.7 MB gzipped). **Loads automatically**,
   right behind the core. It was opt-in behind a setting until the user asked
   for everything on by default; a food that only appears once you have found
   and enabled a preference is, in practice, missing. The cost is real and worth
   knowing: the heap goes from ~44 MB to ~117 MB once it lands. If the app ever
   gets sluggish or reloads itself on a phone, suspect this first.
4. **Open Food Facts live** — barcode lookup, and search for non-US products.

Rows stay packed in memory and are only turned into `Food` objects for results
that get displayed (`unpackRow`). Eagerly unpacking everything cost ~405 MB of
heap — enough to get a tab killed on iOS. See `src/services/foodDb.ts`.

### Why USDA rather than more Open Food Facts

OFF is crowd-sourced and Europe-heavy, and has almost no *generic* foods — no
plain "Shrimp", no "Chicken breast, grilled", only barcoded packages. Searching
"white rice" returned Asda and Sainsbury's own-brand. USDA FoodData Central is
public domain, US-first, and ships household portions ("1 cup", "2 oz",
"12 chips") instead of everything being 100 g.

| FDC dataset | Rows kept | What it gives |
|---|---|---|
| Survey (FNDDS) | 5,372 | generic foods as eaten, household portions |
| SR Legacy | 7,710 | reference whole foods |
| Foundation | 299 | newer lab-analysed whole foods |
| Branded | 364,161 usable | US packaged goods with real serving sizes |

### Rebuilding

```bash
# Download the JSON exports from https://fdc.nal.usda.gov/download-datasets
# and unzip them all into one directory, then:
node --max-old-space-size=12288 scripts/build-usda-db.mjs --src <dir>
```

Takes about four minutes; the branded export is 3.3 GB unzipped. It is **read
as JSON Lines**, not parsed whole — FDC writes one record per line inside the
array, and the file is far past the maximum length of a JS string, so
`JSON.parse` throws before it starts. `--generics-only` skips the slow half.

`build-food-db.mjs` (Open Food Facts) is kept for non-US coverage but no longer
produces the shipped file. If you run it, write to a different path.

### The bug that made this necessary

The old shipped database was **alphabetically truncated at "C"**. `build-food-db.mjs`
sorted alphabetically before writing, and `trim-food-db.mjs` then kept the first
25,000 — believing, per its own comment, that it was keeping the most-scanned.
The result: 11,531 foods starting with C, and **37 in total for D through Z**.
No Doritos, no Eggo, no Gatorade, no own-brand shrimp. This is fixed (the
builder no longer sorts), and it is worth remembering as the reason the database
"had 25,000 foods" and still could not find StarKist tuna.

### Open Food Facts gotchas — these cost real time, don't rediscover them

| Need | Endpoint | Browser | Node |
|---|---|---|---|
| Barcode | `world.openfoodfacts.org/api/v2/product/{code}.json` | works | works |
| Search (runtime) | `world.openfoodfacts.org/cgi/search.pl?...&json=1` → `{products}` | works | 503s under load |
| Search (bulk build) | `search.openfoodfacts.org/search?q=` → `{hits}` | **no CORS** | fast, reliable |

- **Search-a-licious sends no `Access-Control-Allow-Origin`.** Browser fetch
  dies with a bare "Failed to fetch" — but it works fine under curl and Node.
  Verify web APIs from the actual page, not just the terminal.
- **The legacy CGI search 503s on ~⅓ of requests under load.** Ten search terms
  took 25 minutes; Search-a-licious did 262 terms in ~15 minutes with zero
  errors. Use `sort_by=-unique_scans_n` or you get obscure regional SKUs.
- **Rate limits ~10 searches / 15 lookups per minute per IP**, and the failure
  mode is *dropping CORS headers* rather than returning 429 — indistinguishable
  from a CORS bug. `src/services/openFoodFacts.ts` caches per query and enforces
  a client-side token budget; the UI debounces at 700 ms.
- All `*_100g` values are **grams** (`sodium_100g: 0.043` = 43 mg). `salt_100g`
  often replaces missing sodium (sodium ≈ salt × 0.4). `brands` is a
  comma-string in v2/CGI but an **array** in Search-a-licious.

---

## 9. Structure

```
src/
  types.ts                  domain types, period helpers
  lib/
    nutrition.ts            BMR, TDEE, resolvePlan, protein, hydration
    fasting.ts              protocols, stats, recommendFast
    storage.ts              PersistenceAdapter + migrate()
    dates.ts units.ts format.ts id.ts
  data/
    seedFoods.ts            324 curated foods
    exercises.ts            70 cardio (MET) + 60 strength
    nutrients.ts            17 nutrients, order, daily values
  lib/
    supabase.ts             client, OAuth fragment handling, __BUILD_SHA__
    storage.ts              PersistenceAdapter, migrate(), displayNameFrom()
  services/
    cloud.ts                snapshot differ, fetchAll, pushChanges, usernames
    cloud.test.ts           differ tests — npm test
    openFoodFacts.ts        live search + barcode, cache + throttle
    foodDb.ts               two-stage loader, packed rows, lazy unpack
    foodSearch.ts           local ranking, aliases, plural handling
  state/store.tsx           all state + nav stack + mutations
  components/
    Icon.tsx charts.tsx ui.tsx nutrition.tsx
  screens/                  one file per screen
    Auth.tsx                sign in / create account (email + Google)
    AccountSetup.tsx        steps 2 and 3: username, then names
supabase/schema.sql         tables + row level security
scripts/                    build-usda-db.mjs (ships the DB),
                            build-food-db.mjs + trim-food-db.mjs (OFF, legacy)
public/food-db.json         58k core foods
public/food-db-ext.json     175k extended, loaded automatically
```

**Nutrition is stored per serving as logged** on each diary entry, never
recomputed from the food record — editing or deleting a food never rewrites
history.

---

## 10. Working style the user expects

- **Be terse.** No narration after every edit. Batch the work, give one short
  summary at the end. They've asked for this explicitly, more than once.
- **Click-by-click for anything they run.** They push and handle dashboards;
  you build and verify.
- **Verify in the browser before claiming done.** Build passing is not enough.
- **Don't ask when you can check.** Several bugs here were only found by
  actually driving the app.

### Testing technique that works

Seed `localStorage` directly with `javascript_tool`, reload, screenshot. Faster
and far more reliable than clicking through onboarding each time. The shape is
`AppData` from `types.ts`; setting `profile.onboarded = true` plus sex,
birthDate and heightIn is enough to reach the app.

**Seeding localStorage does not work while signed in.** The cloud copy wins on
the next reconcile and overwrites it. Either sign out first, or write to the
`logpal_profile` row directly and reload *immediately* — the store's 250 ms
debounce will otherwise push the local copy back over your edit.

**Mint a session without the UI** when you need an authenticated fetch:

```js
await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
```

**Synthetic clicks in the browser tool sometimes double-fire** — a row click can
navigate and then immediately pop back. Tab-bar clicks are idempotent so they
survive it. If a click seems to do nothing, that's usually why, not a bug.
Calling `.click()` on the element via `javascript_tool` fires exactly once and
sidesteps it.

**A hash-only URL change does not reload the page.** Testing an OAuth return by
setting `location.href = '…#access_token=…'` runs no app code at all; the
mount-time handler never fires. Follow it with `location.reload()`, or navigate
to a URL whose *query* also differs. This wasted a full round of debugging.

### Verifying a deploy

Never conclude anything about production from behaviour alone. Wait until the
bundle contains the commit you just pushed, then test:

```js
const js = await (await fetch(base + assetPath, { cache: 'no-store' })).text()
js.includes('<short-sha>')   // must be true before drawing conclusions
```

---

## 11. Known limitations — state these honestly, don't paper over them

- **Meal scan does not identify food from the photo.** No vision model. The
  estimate is from the typed description.
- **Camera needs a secure context** — works on `localhost` and the Vercel https
  URL, never over plain http on a LAN. **The ZXing decode loop is still
  unverified on a real device camera** — the in-app browser blocks camera
  access, so it cannot be tested from here; it needs a phone against the Vercel
  URL. Everything either side of the decode *is* verified (2026-08-06):
  permission-denied falls back correctly, and manual entry →
  Open Food Facts → food detail works, writing to `scannedBarcodes` and
  `foodCache`. Camera and manual share one `resolve()`, so only the decode
  itself is unproven. The ZXing version shipped in `e087a77` and is already
  live — no push is needed to test it.
- **Sync is last-write-wins per row, not a merge.** Two devices editing the
  *same* entry at the same time: the later write survives. Different entries,
  different days and offline edits are all fine, because the diff is per row.
- **Signed out, data is per-browser localStorage.** Phone and laptop don't
  share, and clearing site data wipes it. Settings → About → Export is the only
  backup in that mode.
- **The cloud read fetches a user's whole history** on sign-in. Fine for years
  of diary; if it ever isn't, `fetchAll` is where to add a date window.
- The offline database is US-centric now that it comes from USDA. Non-US
  packaged goods rely on live Open Food Facts, which is rate-limited.
- **Open Food Facts search is the weak link.** ~10 searches per minute per IP,
  and the failure mode is dropping CORS headers rather than returning 429 — so
  it fails opaquely and looks like a CORS bug. Local results still show; only
  the "Open Food Facts" section errors. Barcode lookup has a separate, higher
  budget and is more reliable.
- About 1% of branded rows still carry cosmetic artefacts from the source data
  (a stray separator in a serving label, a repeated flavour in a name).
- **The extended food database roughly triples the heap** — ~44 MB to ~117 MB —
  and now loads automatically. Fine on a recent phone. If the app gets sluggish
  or a tab reloads itself on mobile, this is the first thing to suspect, and
  `loadFoodDb()` in `src/services/foodDb.ts` is the one line to change back.
- **Anyone who knows a handle can learn the email behind it**, via
  `email_for_username`. Unavoidable for username sign-in with no server of our
  own. See §4.
- **A username can be changed but never released.** There is no delete policy on
  `logpal_usernames`; deleting the account frees the handle via the cascade.
- No social feed and no step counting (no web pedometer API). Friend search is
  **not built** — the data model supports it (handles are unique, world-readable
  and map to a user id) but nothing consumes it yet.
- **No Sign in with Apple.** It needs a paid Apple Developer account, a service
  ID and a key. The account-setup flow already handles "provider gave us an
  address and nothing else", so adding it is small once those exist.
- **Email confirmation is currently OFF** in Supabase — switched off during
  testing so accounts could be created without an inbox round trip. Turn it back
  on before anyone else uses the app, or people can register with addresses they
  do not own. Authentication → Sign In / Providers → Email → Confirm email.
- **Google consent screen is in Testing mode**, so only listed test users can
  sign in with Google.

---

## 12. Deploying

Every push to `main` redeploys automatically.

```bash
cd ~/Documents/Projects/logpal && git push
```

**The user pushes, not you.** Ask before pushing; they have said so explicitly,
and the one time it was done it was on a direct instruction.

`vercel.json` handles the SPA rewrite, a one-week cache on both database files,
and immutable caching on hashed assets. Vercel auto-detects Vite — build
`npm run build`, output `dist`.

Environment variables live in **Vercel → Settings → Environments → Production →
Environment Variables** on this account's layout; there is no top-level
"Environment Variables" entry in the sidebar. They are read at *build* time, so
changing one does nothing until the next deploy.

After pushing, confirm the deploy identifies itself as your commit before
testing anything — see §10.

---

## 13. Open threads

Nothing is half-finished in the code; these are things discussed and not built.

1. **Friend search.** Discussed at length as the reason usernames must be
   unique. Data model is ready; no UI, no follow/friend relationship, no
   profile-viewing screen.
2. **Progress photo journal.** Asked for, then explicitly dropped ("okay how
   about no progress photo"). Would need a Supabase Storage bucket and its
   policies; nothing was built.
3. **Sign in with Apple**, blocked on a paid developer account.
4. **The barcode decode loop on a real camera** — the one piece of shipped
   functionality never verified.
