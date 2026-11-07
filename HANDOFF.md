# LogPal — handoff

Everything needed to pick this up cold in a new session. Started 2026-08-05,
current as of **2026-09-06**, commit `66e0323` on `main`, 68 commits, deployed.

**2026-10-31: first build uploaded to App Store Connect.** The app record
is Apple ID 6829268972, store name "LogPal: Calorie Tracker" (plain "LogPal"
was taken), SKU `logpal-ios`. Build 1.0 (1) was archived and uploaded from
the command line (`xcodebuild archive` then `-exportArchive` with
`build/ExportOptions.plist`, destination upload) using the Xcode account
phillip@erealgroup.com. Two things the archive needed that the GUI hides:
`DEVELOPMENT_TEAM`/`CODE_SIGN_ENTITLEMENTS` in the pbxproj
(`App/App.entitlements` carries Sign in with Apple), and at least one
registered device for the development profile, which a `build` for "My Mac
(Designed for iPad)" with `-allowProvisioningDeviceRegistration` supplies
without a phone. `ITSAppUsesNonExemptEncryption=false` is in Info.plist.
Listing text, categories, review notes and the demo user name are in App
Store Connect; the demo password is in `secrets/review-account.txt`. Store
screenshots come from the simulators via `?seed=demo` on the dev server
(`src/dev/seedDemo.ts`, dev-only) with `server.url` temporarily set in
`capacitor.config.ts`, never committed that way. Still on Phillip's side:
accept the updated Program License Agreement, EU trader status, phone
number and demo password on the version page, confirm the demo email.

**2026-11-01: the real icon.** The violet ring was a placeholder; the mark
Phillip chose (black L, green leaf, black fork, on white) replaced it in
every size: `public/icons/*`, `favicon.png`, `apple-touch-icon.png`, the
Xcode `AppIcon` set and both splash tiles. There is no vector; the source
is a 1254px raster, so regenerate from the largest PNG if sizes are ever
needed again (the generator was a throwaway AppKit script: white square,
logo inset 10%, splash tile 400px with a 22% corner radius on the app's
background colours). Build number went to 2 and that archive was uploaded
the same way as build 1.

**2026-11-02 (evening): Apple Health sync, version 1.1, build 5.** Built
while 1.0 (build 4) sits in App Review, and deliberately *not* submitted
over it: a HealthKit entitlement, new usage strings and a privacy-policy
change would have meant pulling build 4 and restarting the queue. Upload
build 5 to TestFlight, let 1.0 land, then create 1.1 in App Store Connect
and attach build 5. Before that submission: App Privacy needs the "Health &
Fitness" data type added (collected, linked to the user, not used for
tracking) and the review notes should say Health is optional and off by
default.

- *Native side.* `ios/App/App/HealthPlugin.swift` is a plugin written into
  the app target rather than a package (the HealthKit plugin ecosystem is
  thin and lags Capacitor majors). `MainViewController.swift` subclasses
  `CAPBridgeViewController` to register it; `Main.storyboard` points at that
  class. `App.entitlements` has `com.apple.developer.healthkit`; Info.plist
  has `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription`;
  `project.pbxproj` lists both files, the HealthKit `SystemCapabilities`
  flag, `MARKETING_VERSION = 1.1`, `CURRENT_PROJECT_VERSION = 5`.
- *Reads:* daily step totals (HKStatisticsCollectionQuery, so iPhone and
  Watch are de-duplicated by Health itself), body mass, workouts. *Writes:*
  dietary water, body mass, dietary energy, protein, carbs, fat. Every write
  is "replace LogPal's sample for that day and type": delete what LogPal
  wrote (predicate on `HKSource.default()`), save one sample at noon (or
  now, if today and still morning: Health refuses future dates). Nothing
  another app wrote is ever touched. Days are cut in the app's time zone
  setting for reads of weights and workouts; the steps collection query
  uses the device zone for its day boundaries, so a user logging for a
  different zone could see a day's steps shifted. Noted, not fixed.
- *JS side.* `src/services/health.ts` wraps the plugin, and `mergeHealth` is
  the pure fold (tested in `health.test.ts`): steps from Health replace a
  typed figure but a zero is ignored; weigh-ins fill only days LogPal has
  none for, and ones LogPal itself wrote come back flagged `own` and are
  skipped, which is what stops the loop; workouts are keyed `hk:<uuid>`.
  The store (`store.tsx`, "Apple Health" section) pulls on launch once the
  cloud copy has landed, and on every return to the foreground
  (`@capacitor/app` `appStateChange`), 30 days back. It pushes by diffing
  each state change for days whose water, food or weight moved, then writes
  those days' totals 800 ms later. The cloud landing is skipped via
  `hydratingRef`, and weigh-ins that an import just added are skipped via
  `importedWeightsRef`, or they would be echoed back as LogPal's own.
- *UI.* Settings → "Apple Health" banner (iOS app only; `healthSupported`)
  → `PrefsHealth`: one toggle that shows the system sheet and syncs, the
  reads/writes list, Sync now, last-synced line, and the hint that only the
  Health app can revoke access (HealthKit never tells an app whether a
  *read* was refused; it just returns nothing). Setting is
  `settings.healthSync`, default false, synced with the other settings;
  the last-sync summary is per device in `localStorage`.
- `public/privacy.html` gained an "Apple Health" section, which Guideline
  5.1.3 requires.
- *Two things that cost time.* (1) `SceneDelegate.swift` builds the root
  view controller in code, so the storyboard's custom class is never used;
  the plugin only registers once the scene delegate says
  `MainViewController()`. The symptom is the JS error `"Health" plugin is
  not implemented on ios`. (2) Code signing failed with "resource fork,
  Finder information, or similar detritus not allowed" when derived data
  lived under `build/` inside `~/Documents`, which iCloud Drive syncs and
  decorates with `com.apple.FinderInfo`. Build and archive with
  `-derivedDataPath` and `-archivePath` outside `~/Documents` (a `/tmp`
  path is fine); `xattr -cr` on the sources is not enough.
- *Second way in (build 6).* The Steps screen (`screens/wellness.tsx`)
  ends with a "Link with Apple Health" card in the iOS app while
  `settings.healthSync` is off; it calls the same `connectHealth` as the
  Settings toggle. Once linked it becomes a "Linked with Apple Health" row
  that opens the Health page and says a typed count is replaced at the next
  sync. Phillip asked for it so first-time users find the link where the
  number is, not under Settings.
- Verified in the iPhone 17 Pro Max simulator on 2026-11-02: the system
  Health Access sheet appears with all nine topics, five cups logged in
  LogPal show up in Health as 1,183 mL, and 7,432 steps typed into Health
  appear on LogPal's steps widget after returning to the app. Build 5
  (1.1) archived with the HealthKit entitlement under automatic signing.

**2026-11-03: 1.0 (build 4) rejected, Guideline 2.1 Information Needed.**
Apple's message (yesterday 4:38 PM) asks for six things in the review
Notes: a screen recording from a physical iPhone starting at launch and
showing registration, login and account deletion; purpose and audience;
setup instructions; the external services list; regional differences;
regulated-content confirmation. Nothing about a crash or a bug. The notes
field held one 256-character paragraph, which is why. A full draft covering
items 2 to 6 is in `store/app-review-notes.md`, with a shot list for the
recording (item 1, Phillip's phone, attached via the Attachment field on
the version page). App Privacy already lists Health & Fitness, so the plan
is to resubmit with build 7 (1.1, Apple Health) instead of build 4: set the
Version field to 1.1, remove build 4 from the version, add build 7, paste
the notes, attach the video, Resubmit. The classifier blocks me from
editing the version page unless Phillip asks for it in so many words, and
from clicking Resubmit at all. Resubmissions after a rejection usually
come back within a day.

**2026-11-02 (later): water "doesn't save", and the water screen redone.**
Phillip logged water on the phone and it was gone next launch. The cause is
not in the app: the live `logpal_days` table never got the two
`add column if not exists` lines for `sleep_min` and `steps` from
`supabase/schema.sql`, so every upsert of a day row is rejected (Postgres
42703) and the cloud copy, still at 0, wins on the next sign-in reconcile.
Water, sleep and steps were all affected; nothing else, every other table
and column probed clean against the live project. **Run those two lines in
the Supabase SQL editor** (the Supabase MCP and raw REST writes are both
blocked from this session). Separately, `screens/misc.tsx` `WaterScreen`
got the controls Phillip asked for: two presets (`+1 / +5` cups, `+8 / +16`
fl oz, `+250 / +500` ml), a custom box you type once and tap `+N Add` as
often as needed, a `Done` button, and a "Saved" flash on every change. The
old "set exact amount" field is gone. Also fixed in passing: filled glasses
in the tap-to-set row were invisible (stroke 0 on an unfilled icon); `Icon`
now takes a `fill` prop.

*Night follow-up (build 7).* Phillip sent a screen recording: water still
vanished on relaunch. Probed the live project again from the browser pane
(the sandbox shell has no network): `logpal_days.sleep_min` and `.steps`
were still missing, so the SQL above had not been run. Two changes so the
app no longer depends on it. `services/cloud.ts` `upsert` now reads a 42703
error, drops the named column from the batch and retries (`missingColumn`,
tested), so water and `completed` reach the server even while the
migration is pending; sleep and steps simply stay local until it runs, and
the next edit after that pushes them. The console says
`logpal_days.sleep_min is not on the server yet` when it happens. Build 7
carries the fix to TestFlight. **The SQL still needs running** for sleep
and steps to sync across devices; the two lines have not changed.

*Morning, 2026-11-03 (build 8): build 7 did not fix it.* Phillip's second
recording: 25 cups, Done, relaunch, 0. The retry never fired because a
*write* with an unknown column is refused by PostgREST's schema cache with
code `PGRST204` ("Could not find the 'sleep_min' column of 'logpal_days' in
the schema cache"), not Postgres's `42703`, which only a *read* produces
(that is what the probe used, so that is what the first fix matched).
`missingColumn` now reads both. Second change, independent of the first:
`store.tsx` keeps a `logpal.pushFailed` flag in localStorage, set when a
push throws and cleared when one succeeds. At the sign-in reconcile, if it
is set, the device wins: `pushChanges(remote, local)` sends its diff up and
the local copy stays, instead of the cloud copy landing on top of edits the
server never saw. Only after that push succeeds does the cloud win again.
Any future rejected row, or an offline launch, now loses nothing.

**2026-11-02: languages, time zone, and a widget board you can actually
rearrange.** Two pre-launch requests from Phillip.

- *Widgets.* Dragging one a long way (fasting from the bottom to the top)
  used to flip back and forth, because the grid re-flowed under a still
  finger and the widget beneath changed. `components/WidgetGrid.tsx` now
  lifts the dragged widget as a ghost that rides under the finger
  (`pointer-events: none`, so hit-testing finds the one beneath), swaps only
  once the finger is past the target's midpoint in the direction of travel,
  and scrolls the page when the finger is held near either edge. Every
  widget also has ▲ ▼ arrows in edit mode that move it one place. The drag
  state is mirrored in a ref because the first move can arrive before the
  pointerdown state has rendered.
- *Language and region.* `src/i18n/` is a hand-rolled layer: `t(key, vars)`
  with English fallback, `useT()` to re-render on change, dictionaries in
  `strings.ts` for en, es, fr, de, pt, it, zh and ja. Settings → **Language
  & region** picks a language (`settings.language`, `auto` follows the
  device) and a time zone (`settings.timeZone`; every IANA zone the runtime
  knows, with its offset). The zone decides what `today()` returns
  (`lib/dates.ts`) and how `timeOfDay()` prints; the language drives
  `Intl` dates, number grouping (`cal()`), weekday initials and the strings.
  The store calls `applyRegion()` before first render and whenever settings
  change. **Coverage is partial on purpose:** the tab bar, Home and its
  widgets, the add sheet, sign-in, and the Settings pages are translated.
  The insight sentence on Home (`lib/dayInsight.ts`), onboarding, the diary,
  food search, recipes, friends, progress and the rest still read in
  English in every language. Adding a screen means wrapping its strings in
  `t()` and adding keys to each dictionary; a missing key falls back to
  English rather than blank.

**2026-11-01, later: guest mode is a button.** The sign-in screen's quiet
"Continue without an account" link became a "Continue as guest" button
(`screens/Auth.tsx`), so App Review can try the app without the demo
account; the demo account still exists for the friends features. Build 3
uploaded with it. In App Store Connect the version's "Sign-in required"
box can therefore be unticked, with the review note pointing at the guest
button.

**2026-10-30, later: the Home widgets redrawn per shape.** Every widget now
has a layout for each of the eight sizes it can be resized to (see
`formOf` in `components/widgets.tsx` and the DESIGN.md entry), the default
board is a mix of shapes, and the layout storage key is `logpal.widgets.v2`,
so existing devices get the new default once and keep their edits from then
on.

**2026-10-30, a batch of pre-launch edits from the user**, each small enough
to live in the code's own comments, listed here so nobody looks for them:
- **Your plan is editable.** `screens/Goals.tsx` (reached from the calorie
  card's "Your plan" and from Settings → Plan) has a Recommended/Custom switch
  at the top. Custom edits calories, the macros as either percent sliders
  (`lib/planEditor.ts` rebalances the other two) or grams (calories then
  follow the grams), and water; it is a draft until Save. `CustomPlan` grew
  `macroMode` and `macroGrams`; `customPlanTargets()` in `lib/nutrition.ts`
  resolves either mode. Old saves have no mode and are read as percent.
- **The concentric macro rings are gone** from onboarding and the plan
  screen; `components/PlanSummary.tsx` (calorie figure plus three coloured
  bars) replaced both the `TriRing` and the `Donut` there. The user called the
  rings ugly; the component is also the Home macro card's own device.
- **Profile photo and bio**: `profile.avatar` (a 256 px JPEG data URL made by
  `lib/avatar.ts`, so it syncs inside the profile JSON with no bucket) and
  `profile.bio`, set under Settings → profile, shown on the Settings card.
  Friends do not see either yet; the public profile table has no column.
- **Label scan, the label scanner** (shown as "NutriScan" until 2026-10-30,
  when the clash with the tab was resolved by renaming the tile; the file
  kept its name), under the "+" beside Barcode, Meal scan
  and Quick add: `screens/NutriScan.tsx` photographs the Nutrition Facts
  panel, `services/ocr.ts` reads it with Tesseract (WebAssembly, in a worker,
  all three files bundled under `public/ocr/`, 6 MB, so it works offline and
  never phones home), `lib/nutritionLabel.ts` parses the figures, and the
  result opens `CreateFood` prefilled for the user to name and check. On the
  FDA sample label it reads 12 figures in under a second; a glossy curved
  packet will do worse, which is why nothing is saved without a look. **The
  tab called NutriScan is a different thing** (the worth-it comparison in
  `WorthIt.tsx`), which is why the tile was renamed.
- The "+" sheet's search row became a full-width tile under the 2×2.

**The native shell exists as of 2026-10-23:** Capacitor 8 with Swift Package
Manager, `ios/` generated, icons and splash in place, Info.plist configured,
OAuth through the system browser with a `logpal://auth` deep link, and a
Sign in with Apple button shown only in the app. `npm run ios` rebuilds and
syncs. What remains needs Xcode and the developer account; `APPSTORE.md` §3.

**App Store work started 2026-10-13** — see `APPSTORE.md` for the route
(Capacitor), what blocks on the user (developer account, Xcode, Sign in with
Apple), and what landed that day: icon set, web manifest and Apple meta tags,
`/privacy` page, and in-app account deletion backed by `delete_own_account()`
at the bottom of `supabase/schema.sql`, **which has not been run against the
live project yet**. §11's "No Sign in with Apple" is now a hard App Store
blocker (Guideline 4.8), not a nice-to-have.

**Two large features landed after the original text below was written**, and
they are documented in §14 and §15 at the end rather than woven through:
following/friends, and meal planning. Where the older sections disagree with
those, the later ones are right. §3's "current state" is stale; §14 has it.

**Read this before touching anything.** It is not an overview — it is the set of
things that cost real time to learn, including several where the obvious
approach is wrong and the reason why. In particular: §2's incident note,
§4 on accounts and the OAuth fragment, §8's alphabetical-truncation bug, and
§10's testing notes.

**Fastest orientation:** run it (§2), open Settings → About to see which commit
you are on, then read §3 for what is verified and what is not.

---

## 1. What this is

**LogPal** — a calorie and nutrition tracker for the web, modelled on the
leading calorie trackers and then pushed past them. Originally called *FitLog*,
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

This database used to hold seven unprefixed tables — `habits`, `habit_checks`,
`trackers`, `journals`, `profiles`, `schedules`, `mental` — four from an
abandoned Daily Planner setup and three from the `cloud-sync.sql` mis-run
described in that project's own notes. **Dropped 2026-09-06**, after checking
that nothing here reads them: every table this app touches is prefixed
`logpal_`. Verified from outside afterwards, all seven 404 while the
`logpal_*` tables still answer 200.

Keep the prefix rule. It is the only thing that made the cleanup safe, since
the names collide exactly with a live schema in the other project.

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

**Everything is pushed and deployed.** 68 commits, working tree clean, HEAD is
`66e0323`, and production is confirmed running it — the live bundle was grepped
for the sha, not inferred from the dashboard. 98 tests pass across 8 files.
84 TypeScript files in `src/`, plus 40 MB of food database and 1.4 MB of
recipes in `public/`.

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

**Rebuilt 2026-10-23. `DESIGN.md` is now the brief and the table below is
historical.** The user asked for a sleeker, more professional look and for the
"AI tendencies" to go; eight shipping trackers were studied from their App
Store screenshots and the system was rebuilt on what they share: neutral
near-white ground, white cards (radius 20, soft shadow), the blue-violet
accent kept but used only as a detail, macros recoloured coral/amber/blue, a
dated week strip, a header in the flow of the page instead of the indigo
masthead, meal rows with an add button each. The lavender wash, the gradient
masthead and the `dayhead` classes are gone; `.home-head`, `.pill`, `.week`,
`.meal` and `.stat-icon` replaced them. Widgets were restyled in place, so the
board and its layout code are untouched. The `.chip` class had been defined
twice (the second time for recipe steps) and the duplicate had silently
broken the selected state everywhere; it is scoped to `.step` now.

Then, the same day, the "life" layer (DESIGN.md's last section): a computed
daily insight (`lib/dayInsight.ts`, tested), a one-tap "Log again" rail, a
food-group mark beside every food (`lib/foodIcon.ts`, `FoodMark`, tested),
a rail of recipe ideas that fit the calories left, and a `weight` widget.
Home now loads `recipes.json` on first render for the ideas rail; it was
already a week-cached fetch on the Plan tab.


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

### iOS is the target, and it breaks things desktop Chrome cannot show you

**This is a mobile web app for iPhone and iPad.** Design and verify for iOS
Safari; desktop is not the audience.

`position: fixed` is laid out against the **layout viewport** on iOS, and the
layout viewport does not shrink when the keyboard opens. A bottom sheet opened
from a focused search field therefore anchors itself *behind the keyboard*,
off screen. This cost two shipped "fixes" that verified fine in Chrome and
changed nothing on the phone.

**`vh` and `dvh` cannot fix it** — both measure the layout viewport. `Sheet` in
`components/ui.tsx` instead blurs whatever holds focus, then pins the scrim to
`window.visualViewport` and re-pins on its `resize` and `scroll`. Everything
inside sizes in `%` of that scrim, so nothing can extend past what is visible.
The page underneath is frozen while a sheet is open.

**Diagnosis technique that settled it:** the recording showed the page behind
the "open" sheet as pixel-identical to the page with no sheet open — `213,225,243`
at the same point in both — proving the 45% scrim was never over the visible
area, so the sheet was being laid out somewhere off screen. Measure the frames;
do not squint at them.

Desktop Chrome has no software keyboard and no sliding toolbars, so it cannot
reproduce this class of bug. Verify layout numerically (does it fit
`visualViewport`?) and say plainly that the real check is the user's phone. A
real iOS Simulator would settle it, but this Mac has no full Xcode — `attach`
fails until someone installs it and runs
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.

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

**Three ways to log**, from the `+` FAB:

1. **Barcode scan** — live camera decode via **ZXing**. Not `BarcodeDetector`:
   that API is Chromium-only, so on Safari and Firefox the camera opened and
   silently never decoded. This was a reported bug and this is the fix.
   Successful scans are saved to the device and become searchable offline.
2. **Meal scan** — photo, then a written description, then an estimate.
   **There is no vision model connected.** The estimate comes from the
   description, not the image, and the screen says so. Size words (*large*,
   *small*) scale portions. Wiring a real recogniser needs an API key.
3. **Quick add** — calories, optionally macros.

There were four. **Voice logging was removed 2026-09-06** — Web Speech got the
sentence wrong often enough that reviewing its guess cost more than typing the
food. Its parser survives as `lib/spokenFood.ts`, because the description
someone types under a meal-scan photograph is the same shape of sentence.

**The meal is chosen on the way in.** Tapping Log on the Dinner row opens on
Dinner; food detail and quick add both carry a meal picker, and editing an
entry keeps the meal it is already in. The clock still supplies the default,
but it is a suggestion rather than a verdict — before this, correcting the
period meant deleting the entry and logging it again at the right hour.
Periods are named for the meal now: Breakfast, Lunch, Dinner, Snacks.

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
than an all-in TDEE figure. Weekly goal applied at 3,500 kcal/lb.

**The minimum is reported, not enforced** (changed 2026-09-06). `resolvePlan`
used to raise a target up to 1,500 (men) / 1,200 (women) and then say it had
done so, which is the worst of both — the person did not get the pace they
chose, and the number on screen was not the one their choice produces. It now
returns what the pace gives, floored only at 600 so the arithmetic cannot go
absurd, and sets `belowMinimum` (was `flooredCalories`) when it lands under the
recommended line. Goals and Onboarding name the figure and say the target is
under it. `calorieMinimum(profile)` is the one place that number lives.

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
    healthScore.ts          1–10 nutrient density + healthScore.test.ts
    recipeTags.ts           computed meal/diet/nutrition/cuisine tags
    stepDetail.ts           per-step ingredient, equipment and appliance chips
    ingredients.ts          quantity/unit/name parser
    spokenFood.ts           sentence -> quantity + food pairs (meal scan)
    dates.ts units.ts format.ts id.ts
  data/
    authoredRecipes.ts      153 recipes written for LogPal, nutrition stated
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
    recipeDb.ts             fetches public/recipes.json, caches a week
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
- ~~Email confirmation off~~ **Back on since 2026-10-25.** Sign-ups now wait
  for the confirmation email, which the account-setup gate already handles.
- ~~Google consent screen in Testing~~ **In production since 2026-10-25**;
  anyone with a Google account can sign in.

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

1. ~~**Friend search.**~~ Built — see §14.
2. **Progress photo journal.** Asked for, then explicitly dropped ("okay how
   about no progress photo"). Would need a Supabase Storage bucket and its
   policies; nothing was built.
3. **Sign in with Apple**, blocked on a paid developer account.
4. **The barcode decode loop on a real camera** — the one piece of shipped
   functionality never verified.
5. See §15's closing list for the meal planner's own open threads.


---

## 14. Following and friends — built 2026-08-13

`Settings → Friends`. Two tables, `logpal_social_profile` and `logpal_follows`,
both in `supabase/schema.sql` and **already run against the live project**.

**Following is one-way.** A public account accepts a follow immediately; a
private one holds it as `pending`. Whether it needs approving is decided by a
**database trigger** from the target's own `private` flag, never by the client —
a client that could write `status: 'accepted'` itself could read a private
account by asking nicely. There is a second trigger freezing `follower` and
`followee` on update, because the update policy has to let the followee write
the row (accepting *is* an update) and a policy cannot see previous values.

**Nothing here reads anyone's diary and nothing can.** What one person sees of
another is only what that person's own client wrote into
`logpal_social_profile`, filtered by their `shareName` / `shareStreak` /
`shareCalories` settings *before* it leaves the device. A field they have not
shared is absent from the table, not hidden at read time. The field toggles live
in `settings` (so they sync and stay private); `private` lives on the row
because the server reads it.

**Never verified: the request → accept path.** It needs two signed-in accounts
and could not be tested from here. Everything either side is proven — the
trigger auto-accepts against a public target, and `private: true` writes and
reads back.

The streak moved from Home into the store so Home's badge, the week strip's
ticks and what followers see are one rule in one place.

---

## 15. Meal planning — built 2026-08-13/14

The Plan tab is now a recipe browser and nothing else. Everything that used to
be on it — targets, repeat meals, the three food libraries, shortcuts — already
had another home under Settings, so clearing it lost nothing.

### The shape

`Plan.tsx` is a thin shell over `PlanPane` in `Planner.tsx`, which holds search,
six filter chips over a sheet, and a stack of shelves: Favourite meals, Your
recipes, Recipes you may like, Popular (photo tiles), then the catalogue cut by
high protein, build muscle, GLP-1, fibre, low carb, the diets, and so on. Each
shelf shows ten with an "All 70" control that opens two columns.

`MealPlanner` (pushed from the banner) is the week; `ShoppingList` is
aisle-grouped with a pantry that subtracts.

### Where the numbers come from — read this before changing anything

Two paths, deliberately:

- **`summarise()`** — the cheap one, used by every list, card and filter. Reads
  `recipe.nutritionPerServing`, which the catalogue ships.
- **`resolveRecipe()`** — parses every ingredient against the 233k food
  database. Used by the recipe detail screen, the shopping list and logging,
  where a per-ingredient answer is the point.

**Do not put `resolveRecipe` back into a list.** Five hundred recipes across
sixteen shelves is thousands of searches over a quarter of a million rows, and
it locks the renderer solid. It did, twice. The shelves are also built in a
**single bucketing pass**, not one filter per shelf.

### The ingredient parser

`lib/ingredients.ts`, tested against lines copied verbatim from real Samsung
Food and MyFitnessPal recipes. Measured against USDA's own published calories
over 120 recipes: **median ratio 1.05, 60 of 120 within 25%.** It is good enough
to price a shopping list and not good enough to be the number on a card, which
is why published nutrition wins where it exists.

Four bugs it has already had, all of which looked like something else:

- `searchLocal` always returns its best guess, which is right for a human
  picking from a list and dangerous automatically. `matchIngredient` now
  requires the candidate to contain the ingredient's **stemmed head noun** and
  prefers fewest extra words. Before that, "salt and pepper" matched a
  **Chocolate Sea Salt Bar** and added 210 phantom calories.
- Lines with **no amount are never priced** — "salt to taste" names a food
  without saying how much, and charging it a whole database serving is how the
  above happened. They say "to taste" on screen instead.
- `"ounces"` singularised to `"ounc"`, so `8 ounces cheddar` parsed no unit.
- Plurals never matched: `4 medium apples` could not reach "Apple".

**Tinned goods are deliberately unpriced.** Reading the size out of
`1 can pumpkin (15 ounce)` works and was reverted: a can multiplies whatever
matched, and "pumpkin" resolves to Pumpkin Seeds, so fifteen ounces arrived as
2,400 silent calories. An undercount the screen admits to beats an overcount it
does not. Revisit once matching can express confidence.

### The catalogue

`public/recipes.json`, **1,054 USDA MyPlate recipes**, ~1.4 MB, **fetched not
bundled** and cached a week. Public domain under CC PD Mark 1.0.

Built by `scripts/build-recipes.mjs --limit 5000`, which takes everything
MyPlate publishes (1,072) bar the ones with no substance behind them. It used to
take 400, filtered on substance within calorie bands — that filter existed to
keep a small catalogue interesting and is the wrong trade once the ask is
breadth. MyPlate is now exhausted; there is no more to import from it.

Plus **153 recipes written for LogPal** in `src/data/authoredRecipes.ts`. Their
nutrition is *stated*, not parsed. They exist for two reasons: USDA's ceiling is
575 calories, and its library is a public-health one with whole categories
missing — Beverage and Appetizer both returned literally nothing before these.

**Photos come from Pexels** via `scripts/fetch-photos.mjs`, needing
`PEXELS_API_KEY` in `.env.local` (gitignored; the script also reads the env
var). Wikimedia Commons and then Openverse came first and both failed on the
same point: they are archives, not food photography. Commons put a **scan of
printed text** on the barbacoa tacos and a **microscope slide of cucumber mosaic
virus** on a cucumber drink; Openverse gave a conference hall to a cherry
smoothie. Pexels' licence allows commercial use and asks no attribution; the
photographer is credited anyway.

The script requires the query's **head noun** in the photo's own description, so
"beef barbacoa tacos" must return tacos rather than beef, and refuses to run on
duplicate photo queries — two recipes sharing one made the write-back stamp one
recipe twice and leave the other bare, which broke the build with a duplicate
object key.

**Always review new photos on screen, not by filename.** Every bad one in this
project got through a filename check: a vineyard on the mango lassi, a spice
rack on the butter chicken, a market stall of tagine pots on the tagine, stuffed
courgettes on the jambalaya.

**MyFitnessPal's and Samsung Food's libraries cannot be used** — the first is
paywalled licensed content, the second user-uploaded with rights retained by the
uploaders. This has been asked for repeatedly and in several forms, including
"just the photos" and "just scan their database". The photos are the clearest
case of all. What *is* fine, and was done: reading their public category page to
see which dish types exist, then writing our own recipes for the ones we lacked.
All 32 of their dish types now have something behind them.

### Ingredient amounts are always numbers

No line says "to taste", "as desired", "pinch" or "dash". 403 carried a vague
amount and 118 gave no quantity at all, which cannot be scaled by the servings
stepper and leaves a blank on the step chip. Salt and pepper take ¼ teaspoon,
pinches ⅛, seasonings ordinary kitchen amounts. "Optional" is kept where USDA
marked it — only the missing number was the problem.

76 lines had the amount in a parenthetical *after* the food, "salt (1 teaspoon,
optional)". The parser reads leading quantities and treats parentheses as notes,
so those were read as having no amount at all.

### Steps carry what they need

`lib/stepDetail.ts` puts a chip row under each step: the ingredients that step
consumes with amounts, the equipment it uses, and appliance settings boxed out
("Oven · Preheat, 400°F"). Derived per render from the recipe's own ingredient
list and step text — nothing is authored, so it works across all 1,207.

Three matching rules, each of which exists because of a real wrong chip:

- An ingredient's **category word alone is not a match**. Matching on the last
  word let "soy sauce" claim any step saying "the sauce", and there is always a
  sauce. `GENERIC` holds those words; they need the whole phrase.
- **Any distinctive word counts**, not just the last, or "panko breadcrumbs"
  misses a step saying only "panko".
- **The vaguer claim loses.** "Chicken breasts" and "chicken stock" both answer
  to "chicken"; an ingredient whose matched words are a subset of another's is
  dropped, ties going to the earlier ingredient.

### USDA steps needed work, and mostly did not

USDA publishes **one instruction per sentence**, which turns asides into
numbered steps — Peach Sorbet ended on "They will not explode." as step 11 of
11, the back half of the sentence above it. `joinFragments` in the builder folds
back anything opening with a back-reference, anything under 30 characters, and
declarative asides. 8,039 steps became 6,425.

**Do not rewrite the rest.** 1,016 of 1,054 already carry times, temperatures
and doneness cues; "Bake butternut squash until tender (about 45 minutes)" needs
no help, and replacing tested USDA prose with untested prose is a downgrade
dressed as an upgrade. Only 38 genuinely lacked numbers and those were rewritten
by hand. A verb-list test for "is this an instruction" was tried and rejected —
it flagged 1,039 legitimate steps, because plenty open with "While the squash
bakes" or "In a large bowl".

143 recipes cooked raw meat, poultry or fish while naming no temperature. Each
now states the **published FSIS minimum** on the step that cooks it: 165 °F
poultry, 160 °F ground meat, 145 °F fish and whole cuts. Recipes whose protein
arrives cooked, canned or as deli slices are excluded.

**Never invent a cooking time or temperature.** Every figure in the catalogue is
either USDA's own or an FSIS published minimum. A plausible-sounding wrong
number on chicken is worse than a vague right one.

### Filters are computed, never typed

`lib/recipeTags.ts`. Nutrition tags come from each recipe's own numbers on FDA
claim thresholds; diets are read off the **ingredient list**, because USDA files
by food group and nothing in the data says "vegetarian". The false friends
matter — almond milk and peanut butter are vegan, and a naive substring check
disqualifies most of the plant recipes.

Diets nest: vegan implies vegetarian implies pescatarian.

**Two sugar filters, deliberately.** "Sugar Free" is 21 CFR 101.60 — under 0.5 g
a serving — and matches 11 recipes of 1,207. Accurate and nearly empty, because
anything with fruit or honey is out. "No Added Sugar" reads the ingredient list
for sweeteners, ignores fruit's own sugars, and matches 388. Shipping only the
strict one would have been another filter that opens onto an empty screen, which
is exactly the complaint that started the Beverage work.

**High Carb (≥45 g) is not a joke tag.** Someone eating to gain, or carb-loading
before a race, is looking for precisely what Low Carb hides. Carbohydrate is not
a fault.

**Low Cholesterol (≤20 mg) filters but does not score** — see the health score
below.

**Exclude** is a separate chip carrying the same ingredient shelves inverted,
for allergies. One hit drops the recipe outright rather than ranking it lower,
because "no peanuts" has to be absolute. Excluded pills render struck through so
they can never be mistaken for selected ones, and an ingredient cannot be both
wanted and banned.

**Non-GMO was asked for and is not implemented.** Nothing in FoodData Central or
the recipe data records it, so the filter could only have guessed. It would need
a manual per-recipe flag.

### Star and bookmark are different things

- **Star → foods** → My Favourites (a tab in food search, between All and My
  Meals)
- **Bookmark → meals/recipes** → My Meals, and the Favourite meals shelf

Neither turns into the other; both fill solid gold when on. They were briefly
unified and that was wrong. Bookmarking is a **toggle** — saved meals carry
`recipeId`, without which nothing could tell a recipe was already saved and
every tap added another copy.

### Health score

`lib/healthScore.ts`. Ours, not Samsung Food's, and the screen says how it is
worked out. Rebalanced 2026-08-18 after a French spinach frittata — 132 calories
carrying 9.6 g of protein, from eggs and spinach — scored **4.6**. Three
structural faults, all of which made light savoury cooking look bad:

- **Sodium and saturated fat were judged per calorie**, so the lighter and more
  vegetable a dish was, the worse it did. 364 mg is an ordinary amount of salt
  for a meal; per calorie it read as 2.4× par and maxed the penalty. Sodium is
  now measured against what a *serving* may reasonably carry (600 mg), and
  saturated fat gets 15% of calories before anything is charged.
- **Positives were divided by a fixed six nutrients** when the catalogue carries
  protein and fibre for everything and potassium or vitamin C for almost
  nothing. A dish could do everything right on the figures that exist and reach
  a third of the credit. Now averaged over what is measured, and weighted 60/40
  toward the food's **peak** density — a frittata's missing fibre must not
  cancel its protein.
- **Sugar was charged wherever it appeared**, which marks down fruit for being
  fruit. Only recipes containing an actual sweetener are charged, read from the
  ingredient list via `hasAddedSugar`.

Frittata is now 7.4 and "Great". Sweets average 5.3, vegetable dishes 8.4, so it
still discriminates. Four tests in `healthScore.test.ts` lock this in, including
the frittata case — **run them before touching the constants.**

Dietary cholesterol is still not scored: the 2020–2025 guidelines set no numeric
limit, and scoring it made eggs the worst thing in the catalogue.

### Not synced

`planEntries`, `shopping`, `pantry`, `savedRecipeIds` and `recentSearches` are
**device-local**. The sign-in reconcile explicitly carries them across a cloud
read so an empty server cannot wipe a planned week. Syncing them needs three
more tables.

### Open threads

1. **Tinned goods** — needs match confidence first.
2. **Collections** for saved recipes; Saved has no grouping.
3. **Scale.** Samsung Food has ~240,000 recipes; this has 1,207. MyPlate is
   exhausted, so more bulk means either a licensed API (Spoonacular, Edamam —
   paid, and usually live calls rather than stored copies) or continued
   authoring. Thinnest categories are Lunch (12), Appetizer (13) and Brunch.
4. **Cuisine coverage is uneven** — Thai 2, Greek/French/Caribbean 3 each,
   against Asian 14 and Mediterranean 16.
5. **Non-GMO**, above — needs a manual flag.

## Mid-morning, 2026-11-03 (build 9)

"It happened again" was build 7: ASC's TestFlight tester list showed
phillip@erealgroup.com on 1.1 (7), not 8. While checking, found a second
hole: `pushFailed` was only set in the catch, so a push cut off by the app
being killed mid-request left no flag and the cloud still won at launch.
Build 9 (4259545, uploaded 10:18) flags the push before it leaves (cleared
only when every in-flight push has resolved) and flushes the debounced save
on `visibilitychange` → hidden, since a backgrounded web view never fires a
pending timer. Still unrun: the two `alter table logpal_days` lines.

## Late morning, 2026-11-03 (build 10): two devices

Phillip signed in on iPad and iPhone; water did not cross over. Two causes:
the cloud was only pulled at sign-in (so the other device needed a full
relaunch), and the reconcile was whole-snapshot (cloud wins, or device wins
with the push flag), so whichever side landed last erased the other's day.
Build 10: `src/services/merge.ts` three-way merge (synced snapshot vs local
vs remote; local edits since the last confirmed push stay, everything else
is the server's). The synced snapshot now persists in localStorage
(`logpal.synced.v1`, `syncedStore` in lib/storage.ts), and `pullCloud` runs
again on every foreground (visibilitychange + Capacitor appStateChange).
Without a synced snapshot (first sign-in, or upgrading from ≤9) it falls
back to the push flag. Tests in merge.test.ts; 136 pass.

## Early afternoon, 2026-11-03 (builds 11–13): small things that looked wrong

Three TestFlight uploads in a row, each one screen Phillip pointed at.

**Build 11 (13:1x): calories from steps.** `stepCalories(steps, heightIn,
weightLb)` in `src/lib/nutrition.ts`: stride is 0.415 × height, miles at
0.57 kcal per pound. Out-of-range or missing height/weight fall back to
66 in / 150 lb rather than producing nonsense. Shown on the wellness steps
line and as the Steps widget caption (`w.stepKcal`, eight locales).

**Build 12 (13:57): USDA "Guideline amount per fl oz of".** The survey
portions include dosing notes (2.5 g of milk, for coffee) which made a
glass of milk one calorie and read as gibberish in the picker.
`unpackRow` drops any portion whose label starts "Guideline amount"
before nutrition is based on `portions[0]`; a row that was nothing but
notes falls back to 100 g. Tests in `src/services/foodDb.test.ts`.

**Build 13 (~15:30): the "elevated bar".** NutriScan's Compare / Log it
bar was `position: sticky; bottom: 0` *inside* `.scroll`. The scroller
ends where the nav dock begins, so the bar pinned a dock's height above
the screen edge, a bordered white slab with the page scrolling past both
above it and, through the dock's transparent gradient, below it. It is
now a flex row between the scroller and the dock, exactly as the recipe
screen already did it; `.ractions` is no longer sticky and no longer pays
the safe-area inset the dock already pays. Same build: `unpackRow` no
longer appends a second "1 oz" when USDA already lists one rounded to
28 g (React was logging duplicate keys in the serving picker).

Still open from the morning: the two `alter table` lines for `sleep_min`
and `steps` have not been run; the review video is Phillip's to record.

## Morning, 2026-11-04 (build 14): Phillip's list

Seven things from a day of use, all in one build.

**Calories tap.** The Home calories figure opened the plan editor. It now
opens `CaloriesScreen` (`src/screens/Breakdown.tsx`): the arithmetic (plan +
exercise − food = left), a donut by meal with each meal's foods, the day's
exercise, and one quiet line saying where the plan is changed. The widget's
action text reads "Where it went".

**Macros tap.** The macros widget was not tappable. It opens `MacrosScreen`:
three cards (grams against target, share of calories, "mostly from X"),
each opening `NutrientScreen`, which lists every logged food carrying that
nutrient, biggest first, with its share. The "everything else" list under
the three does the same for every nutrient on the panel. Routes
`calories`, `macros`, `nutrient`.

**NutriScan.** Rewritten (`WorthIt.tsx`). No "Log it"; the only action is
Compare. The health score is the headline, large and in its colour, with
the plan-fit dial beside it. Under it, four ratings from
`src/lib/sourceRatings.ts`: protein source, carb source, fat source, clean
eating, each 0–10 with a word and the figures behind it. Comparison is a
face-to-face card (two dials, "Healthier" and "Better for today") and a
row-per-figure table with the leader lit, then each food in full with a
numbered badge.

The pair lives in `src/state/worthSession.ts`, not component state: the
router shows one route at a time, so the scanners unmounted the screen and
the first food was lost. `Scanner` (mode `worth`) and the label scanner
(new `mode` on route `nutriScan`) now `deliver()` their result and pop.
Label scan is the third door on the NutriScan choose screen; its reading
becomes a food named "Scanned label" without going through the create
form.

**Search tabs.** "My Favourites / My Meals / My Recipes / My Foods" →
"Favorited foods / Favorited meals / My recipes / My foods".

**Streak.** The Home flame pill is bigger (`.pill--streak`), the flame
leads and breathes.

**Celebrations.** `src/lib/celebrations.ts` decides what has just been
met: calories within 5% of goal, all three macros, water, steps, sleep, a
fast past its target (keyed by fast), diary completed, and the goal weight
(keyed by target, direction-aware). `uncelebrated`/`markCelebrated` keep
memory in `logpal.celebrated.v2`. Home checks on every change and on every
foreground (visibilitychange + Capacitor appStateChange), so a goal met
while the app was away is cheered at the next opening. `CelebrationHost`
(`components/Confetti.tsx`) renders at app level from a tiny bus;
`celebrate(items)` raises one. Ordinary goals: confetti + card, 3.4 s.
Goal weight: dark backdrop with a gold glow, a burst of confetti flying
out from the card in every direction plus the falling kind, trophy card,
waits for a tap. (Build 14 had CSS flames; Phillip found them awkward,
build 15 swapped them for the burst.) Settings → About has two preview rows.

Still open: the two `alter table` lines; the review video.

## Mid-morning, 2026-11-04 (build 16): three corrections

**Goal weight cheered wrongly.** Phillip opened build 14 and was told he
had reached a goal of 115 at 130. The direction came from `goal.kind`, and
"gain muscle" with a lower target read as gaining. Direction is now
`startWeight` against `goalWeight` only; the weight judged is the latest
weigh-in (`latestWeight`), and no weigh-in means no cheer. The id moved
to `weight2:<target>` so the wrongly-marked `weight:115` no longer blocks
the real one.

**The diary page is gone.** `src/screens/Diary.tsx` and route `diary`
deleted. Tapping a meal (from Home or the calories breakdown) opens
`MealScreen` (`Breakdown.tsx`, route `meal`): that meal's foods, a total,
Log food. Tapping a food opens the food detail for the entry; an entry
whose food can no longer be resolved gets a move/delete sheet. The
"Open diary" button on Home and the "See the diary" nudge now open the
calories breakdown.

**NutriScan always makes the call.** "Too close to call" under 0.3 is
gone; the better food is named whenever the scores differ, "Dead even"
only on an exact tie.

## Late morning, 2026-11-04 (build 17): NutriScan, lighter

Phillip liked what the page said and not how much of it there was ("less
is more, sleeker"). `src/screens/WorthIt.tsx` rewritten around that, with
its own `.ns-*` block at the end of `global.css`; the old `.hero__*` (bar
`.hero`, `--center`, `__big`, `__caption`, which Breakdown uses), `.wtag`,
`.vs*`, `.rating*` (bar `.rating__bar`) and `.cmp*` rules are gone.

- **Ways in** are three rows in one flat panel (tinted icon, label,
  chevron), not three shadowed tiles. `.pickways` is still used by the
  label scanner.
- **Result**: the name and one thin ring on the wash, no card; the word
  under it; "Fits your plan" as one quiet line with a dot, no second dial.
  Stepper centred with nothing drawn around it. The four ratings are 2×2
  tiles: label, score in colour, the word, a 3 px bar. The long "detail"
  sentence from `sourceRatings` is no longer shown. A protein/carb/fat
  score under 2 is grey, not red: "not a source" is a fact, not a fault.
  Figures are one strip (cal, protein, carbs, fat) with fiber, sugar,
  sodium in a line under it; the per-row carb/fat/protein make-up text is
  gone. "In its favour" and "Worth knowing" merged into one "Notes" list,
  told apart by dot colour.
- **Compare** shows only the face-off, the two verdicts, the stepper for
  food 1 (captioned with its name) and the table. The two full details
  that used to stack beneath are gone; the table already holds every
  number. Panels are hairline-bordered, no shadow.

## Morning, 2026-11-05: looks (palettes), web only

Phillip sent a board (soft pink, matcha green, white, gingham, cherry
blossom) and asked for "a few other options for themes", to look at on
Vercel first, not TestFlight. So: pushed to main, **no build bumped, no
upload**.

- `Settings.palette: 'classic' | 'sakura' | 'matcha'`
  (`types.ts`, default `classic` in `defaultSettings`; `migrateSettings`
  spreads defaults, so old saves get it). It sits under the light/dark
  mode, which is unchanged.
- `src/lib/theme.ts`: `applyLook(theme, palette)` sets `data-theme` and
  `data-palette` on `<html>` and copies the wash colour into the
  `theme-color` metas. `PALETTES` is the swatch list.
- `tokens.css`: a block per palette (light), and dark halves. Phillip's
  second note: "pink as the base colour and splotches of green" (Sakura),
  the reverse for Matcha; Gingham dropped. So each look is a base (the wash,
  a breath of it in the cards, the brand colour) plus a second colour,
  `--pop`, that takes the add button, links, the picked day and the banner
  icon tiles (`global.css` routes those through `--pop`; classic sets it to
  the accent). Third note: no blobs on the wash ("plain pink"); the
  splotches are the *things*: water, steps, sleep, the meal rows and the
  macros are all pink in Sakura with green on a few (water, carbs, the
  afternoon meal), the mirror in Matcha. Meal tints are tokens now
  (`--meal-morning` etc., `PERIOD_TINT` in Today.tsx). `--bg-pattern` is
  still honoured by `.app` but no palette sets it.
- Appearance screen: a row of three swatch discs ("Look") above the mode
  select. A pick shows at once; the shell re-applies the saved look on
  every route change (`route` is a dependency of the look effect in
  `App.tsx`), which is what puts an unsaved pick back on leaving. The
  Settings banner reads "Sakura · Match system".
- Strings are English only (`settings.palette`, `settings.paletteClassic`;
  `settings.themeHint` reworded); `t()` falls back to English.

Fourth note, same day: "too much on the eyes, I get tired". The cause was
one saturated hue everywhere: a pink wash, a pink tint on every card, pink
figures. So: the wash is near-white blush (`#fbf4f6`) / near-white sage,
cards pure white, the hues dustier (rose `#d8809a`, sage `#86ad82`), and
`--tint-k` (new, 1 in classic, 0.5 in the soft looks, 0.6 dark) scales
every card wash in `global.css` and the meal icon tint in Today.tsx.

Fifth note: "a ton of options, something for everybody, girly and
masculine". Eight more looks, generated by `scripts/palettes.py` (run from
the repo root; it appends to `tokens.css` and edits `theme.ts`/`types.ts`,
so run it once or trim first): Lavender, Peach (soft), Sky, Honey (middle),
Slate, Forest, Ocean, Mono (plain). Same rules as Sakura/Matcha: one base,
the other colour splotched through, pale wash, white cards, `--tint-k`
0.5. Light and dark for each. Swatch grid is five wide.

Sixth note: the eight generated looks were "grayish on whitish on
whitish". Regenerated (`scripts/palettes.py` now updates the swatch rows
in place when the keys already exist, and still appends to `tokens.css`,
so truncate the generated section first): fuller accents (Slate `#44679f`,
Ocean `#1f87a6`, Mono near-black with red `#e23d4e`…), secondary text
darker, borders and card tints stronger (`--tint-k` 0.8 for these;
Sakura/Matcha untouched at 0.5 since he liked them).

Seventh note: Peach, Ocean and Mono cut. Seven looks remain. `applyLook`
falls back to classic for a saved palette key that no longer exists.

## Evening, 2026-11-05: meal ideas ranked, tab labels, two ice creams

- **Meal ideas are ranked, not filtered.** `src/lib/mealIdeas.ts`,
  `rankIdeas(candidates, ctx)`: room left for this meal by hour, protein
  need (weighted up for gain-muscle/recomp, losing, and age ≥ 50), the plan
  (losing favours lighter, fibre-rich, low-sugar plates; gaining favours
  using the room; maintaining leans on health score), carb/fat overage
  penalties, familiarity with the last 14 days of logged food names and
  ingredients, a markdown for what was eaten today, a daily seeded
  rotation, breakfasts before eleven. Home builds the context from totals,
  macro targets, `profile.goal.kind`, `profile.sex`, `age(birthDate)`,
  `data.foodEntries`, and pools the catalogue with the user's own recipes.
  Seven tests in `mealIdeas.test.ts`. Hint string `home.ideasHintTailored`.
- Food search tabs read "Favorite foods / Favorite meals" (the D dropped,
  by request) and the row scrolls sideways, because five tabs never fit a
  390 px phone at 14 px; "My foods" shows its edge.
- Two looks from his hex codes: Neapolitan (strawberry `#e27ab0`, chocolate
  `#604734` as the second colour, vanilla wash) and Mint Choc (mint
  `#7dbda4`, dark chocolate `#3e3630`, cream wash). In `scripts/palettes.py`
  SPECS; nine looks now.

## Night, 2026-11-05: every look on the Neapolitan recipe

Phillip: Neapolitan and Mint Choc are "so far my favourite", redo the rest
"to feel similar" (not in colour). What they share: a warm cream wash,
white cards, a pastel main colour, one deep dark second colour (the
chocolate) on the add button, links, picked day, icon tiles, water and
carbs. All nine looks now come from SPECS in `scripts/palettes.py` on
that recipe, Sakura and Matcha included (their hand-tuned blocks are
gone; `git show 8af9182:src/styles/tokens.css` has them if he says undo).
Pastel main + dark second per look: Sakura `#ec9ab9`/`#5a3a44`, Matcha
`#9fc48f`/`#4a4a32`, Lavender `#b39adb`/`#4a3d5c`, Sky `#8fb8e6`/`#3a4658`,
Honey `#e9b84a`/`#5c4320`, Slate `#8aa0bd`/`#2f3a4a`, Forest
`#6fae8a`/`#2f3f33`. Neapolitan and Mint Choc untouched.

Later that night: Mint Choc, Forest and Matcha read as one look. Matcha is
his favourite, so Forest and Mint Choc were cut and two flavours added on
the same recipe: Mocha (milk chocolate `#bf8f70`, espresso `#3b2a22`) and
Black Cherry (`#d97b8c`, dark cherry `#44202c`). Nine looks: Classic,
Sakura, Matcha, Lavender, Sky, Honey, Slate, Mocha, Black Cherry,
Neapolitan. The generator now expects everything from its own "All the
looks" comment down to be cut before a run (it appends).

Then: four from his own hex sets, to nitpick, on the same recipe. SPECS
can carry an eighth value, a third colour, that goes on water, fat and
sleep. Picnic (blue `#78a5ce`, brown `#7c5549`, pink `#dda4b4`), Rosewater
(rose `#e0a9b2`, dark rose `#5a3a3e`, mint `#a9cfc9`), Pistachio (mint
`#9ccbbd`, brown `#786c56`, olive `#a1a34e`), Red Velvet (brick `#9e5151`,
near-black red `#260809`, dark red `#751d1d`). Thirteen looks now.

And Sherbet, from `D5D98F CEE1F2 F7A9A5 F0D9A3`: salmon `#f29e99` main, a
dark terracotta-brown `#5a3b35` as the second (the set had no dark), the
pale blue on water, fat and sleep, apricot cream wash. The lime is unused.

Cut: Black Cherry, Rosewater, Pistachio, Red Velvet, Picnic. Nine looks:
Classic, Sakura, Matcha, Lavender, Sky, Honey, Slate, Mocha, Sherbet,
Neapolitan.

Earth, from `73503D F7D5A3 B9AE66 163E11`: olive-khaki `#b9ae66` main, forest
green `#163e11` as the dark second, brown `#73503d` on water, fat and
sleep, sand lightened to cream. Ten looks.

Sherbet cut. Nine looks: Classic, Sakura, Matcha, Lavender, Sky, Honey,
Slate, Mocha, Earth, Neapolitan.

## Night, 2026-11-06: build 18 to TestFlight

Build 18 (1.1) uploaded 00:25 with everything since 17: the nine looks, meal ideas ranked, tab labels. Same recipe, derived data in the scratchpad.

## Small hours, 2026-11-06: the feed is personal now (build 19)

Phillip: "I keep on saying the same food feed for everybody." Home now shows a "why" strip (sex + age, weight + goal, the three words they log most) above two rails: Ideas for today (room-fit, `rankIdeas`) and Recipes you may like (taste-fit, `rankLikes`, no room gate, skips the first rail). Ranking now uses body weight (plate size, protein per lb), salt past 40/50, a stronger familiarity term, and a per-person seed so two people never get the same near-tie order. Label words (greek, nonfat, grilled) are stop words. Build 19 uploaded.

## Small hours, 2026-11-06: lifts and PRs in Progress, web only

Progress has a third tab, Exercise: personal records per lift (Bench press, Squat, … or typed), a Recent list with PR badges, a detail page per lift (line chart, PR / First / Gain, history with delete), and a sheet to log weight + reps + date. Beating the best fires the confetti card "New PR!". Data is `AppData.lifts` (`LiftEntry`, lb), device-local like the planner (carried across sign-in reconcile, not in any cloud table). Same lift + same day merges to the heavier weight. Not uploaded; Phillip wants to try it on Vercel first.

## Morning, 2026-11-06: one rail on Home, feed-based Plan rail, the weekly race (build 20)

Phillip, from the TestFlight screenshot: no "Woman, 166 lb, losing / you often log" chips on Home, and one rail only. Done: Home keeps "Ideas for today" with its hint line; the why strip and the second rail are gone. "Recipes you may like" on the Plan tab is now `rankLikes` over the whole catalogue (feed-based: what they log, plan, body) instead of a seeded shuffle; both screens build their context with `lib/ideaContext.ts`.

Friends → Following now opens with "This week", the Apple-Watch-style race: four contests (Steps, Water, Calories, Logging), each a count of days at goal out of seven, you plus everyone you follow who shares that metric, ranked, crown on the leader. Counts come from `lib/weekly.ts` and are published with the profile as `week_step_days`, `week_water_days`, `week_calorie_days`, `week_logged_days`, `week_steps` (steps total only on `exact`). **The columns are not on the server yet.** Run in the LogPal Supabase SQL editor:

```sql
alter table logpal_social_profile
  add column if not exists week_step_days integer,
  add column if not exists week_water_days integer,
  add column if not exists week_calorie_days integer,
  add column if not exists week_logged_days integer,
  add column if not exists week_steps integer;
```

Until then `publishProfile` catches PGRST204 and republishes without the week fields, so sharing keeps working and the race shows only you. The friend-profile Macros card has 6px more under its bars. Build 20 uploaded; lifts tab rides along.

## Midday, 2026-11-06: your week, read back (web only)

Phillip showed MyFitnessPal's Weekly Digest and asked for one that fits LogPal and beats it; not for TestFlight yet. Home now carries a "Your week" banner under the greeting card (last week Mon–Wed, the week so far from Thursday) with the week's score on NutriScan's dial (`components/ScoreDial.tsx`, moved out of WorthIt), a word, and seven dots. It opens `screens/WeekReview.tsx`: week switcher; hero (score, word, one-sentence headline, dots); Calories (seven bars coloured in/over/light with a goal line, average, goal, best day); On the plate (macro averages vs target, "Your stars" and "Worth a swap" from food health scores, with how often and how many calories); Body tiles (weight change, water days, steps with best day, sleep average, exercise); New PRs from the lifts tab; Next week (one thing to do, picked from the weakest part of the score) and "Against last week" chips. All reading is pure in `lib/weekReview.ts` (score weights: logged .3, calories .25, protein .15, water .1, steps .1 and sleep .1 only for people who record them; under half the days logged, the advice is always to log). Tests in `lib/weekReview.test.ts`.

## Afternoon, 2026-11-06: Crews (web only, needs SQL)

Phillip's spec: a Crew with a name, private/public, invited by one link; inside it members, an activity feed, challenges, a leaderboard, kudos, group chat, achievements, shared recipes; and joining has to be one tap, benefits before the sign-up form.

Built, web only, not uploaded:

- **Entry.** Friends → Following has a "Crews" card (your crews, "Start one"/"All"); `Crews` screen lists yours, Start a crew / I have a link, and Discover (public crews, Join). Routes `crews` and `crew {id}`.
- **Dashboard** (`src/screens/Crews.tsx`): hero (badge emoji, member faces, Invite), tabs Feed / Compete / Recipes / Members. Feed is chat + milestones in one stream with four kudos reactions (one per person per post; tapping yours again takes it back), a sticky composer, 20 s polling. Compete: active/upcoming challenge cards (Steps, Water, Calories, Log every day; 7/14/30 days; bars from each member's `week_*` counts), the Leaderboard (2 pts per logged day, 1 per goal hit, 1 per message/kudos capped at 5), crew achievements (7 team badges) and yours (5), past challenges. Recipes: catalogue recipes shared with a note (picker: saved recipes, or search). Members: roles, join dates, invite link, edit (owner), leave/delete.
- **Milestones post themselves**: a PR (`addLift`, when there was a previous best) and streak marks 7/14/30/60/100/365 (once each, `logpal.streakTold.<uid>`) go to every crew via `announce`, which never throws.
- **Invite link** `https://logpal-two.vercel.app/join/CODE` (8 chars, no 0/O/1/I). `parseInvite` also accepts `logpal://join/CODE` (listener on `appUrlOpen`) and a bare code. The store captures it on boot into `logpal.invite`, the shell shows `InviteLanding` (preview via the anonymous `logpal_crew_preview` RPC: name, size, current challenge, three benefit lines) before Auth; "Join the crew" → sign-up; after session + handle + onboarding the store calls `logpal_join_crew` and opens the crew. "Not now" forgets it. Share uses `navigator.share`, else clipboard, else shows the link.
- **Rules** in `src/lib/crews.ts` (tests), network in `src/services/crews.ts`, `hydrate` exported from social.ts. Dev seams: `?crewdemo` opens a sample crew; `/join/DEMODEMO` shows a sample landing.

**Phillip ran the SQL at 2026-11-06 ~10:20** (crews block, the five `week_*` columns, and `logpal_days.sleep_min` / `.steps`); all probed 200 from the browser pane. The paragraph below is history. Run the whole "crews" block at the end of `supabase/schema.sql` in the LogPal SQL editor (six tables, `logpal_in_crew` / `logpal_owns_crew` helpers, two RPCs, and `social_visible_to_crew` so crew mates can read each other's published profile). Until then every crew screen reports the missing table. Also still pending: the five `week_*` columns from build 20 (the leaderboard and challenges read them).

Not done: universal links (an `apple-app-site-association` on Vercel plus the associated-domains entitlement) so the link opens the installed app instead of Safari; realtime for the chat; i18n strings for the crew screens.

## Afternoon, 2026-11-06: the Connect tab

Phillip pictured a fork, not a card. The fifth tab is now **Connect** (`tabs.friends` string in all eight languages; `settings.friends` keeps "Friends" for the Settings banner). `src/screens/Connect.tsx` is two doors: Friends (following count, "n waiting" badge) → the old Friends screen with a back arrow; Crews ("challenge on" badge, crew names) → the Crews screen. The Crews card is gone from the Friends screen. Tab key stays `friends`.

## Afternoon, 2026-11-06: crew icon, emoji or photo

The crew sheet's "Badge" is now "Icon": pick an emoji, or Upload a photo (`fileToAvatar`, 256px JPEG data URL, stored in `logpal_crews.photo`; "Use an emoji instead" clears it). `CrewFace` renders the photo wherever the emoji appeared (row, hero, landing). **SQL to run** (copied to Phillip's clipboard, also at the end of `supabase/schema.sql`): `alter table logpal_crews add column if not exists photo text …` plus the re-created `logpal_crew_preview` that returns it. Until it runs, `createCrew`/`updateCrew` catch PGRST204 and save without the photo.

## Afternoon, 2026-11-06: build 22 to TestFlight

Build 22 (1.1) uploaded 13:38: Crews, the Connect tab, crew photo icons, the owner-read policy fix. Two notes for next time: the archive command takes `-project App.xcodeproj` (there is no workspace), and `npm run build` runs `tsc -b` first, which hung at 0% CPU while iCloud Drive was syncing the project folder; `npx vite build` alone got through. tsc and tests had already passed on the same commit.

## Later afternoon, 2026-11-06: the looks re-tuned around Neapolitan

Phillip said Neapolitan is the one that works (four colours that go together but contrast, the yellow wash under the pink) and the rest looked washed out. Cause: the 2026-11-05 set used near-white washes and pastel mains of the same hue. Re-tuned SPECS in `scripts/palettes.py` so each look has a real tint of a different hue for the wash, a main colour as saturated as the strawberry, and a deep second colour: Sakura (cherry pink, leaf green, pale sky), Matcha (matcha, azuki, strawberry milk), Lavender (lilac, plum, lemon), Sky (sky blue, navy, peach), Honey (honey, caramel, pale blue), Slate (steel, charcoal, sand), Mocha (caramel, espresso, mint). Classic, Earth and Neapolitan untouched. Before/after mockups: https://claude.ai/artifact/HbqQSoqY4x517cNukA1EE3 (built by a scratchpad script from the two tokens.css versions). To go back: `git revert` this commit, or restore the SPECS from the commit before and re-run the script after cutting tokens.css from the "All the looks" comment down.

Round two, same afternoon: Phillip kept Sky and Slate, found Lavender's lemon too strong (wash now #fbf8ec, a soft cream), Matcha's pink wash out of place (now vanilla #fbf5e1 with dark chocolate #4a3626 instead of azuki), and Honey's pale blue off (now pale sage #eff4e7). Sakura and Mocha he wanted to see at full size before calling. The artifact now holds real Home-screen screenshots of all eight looks, taken in the browser pane by setting `document.documentElement.dataset.palette` and waiting a second before each shot (the first pass without the wait returned half-repainted frames).

Round three: seen full size, Phillip kept the re-tuned Matcha and Slate (and Neapolitan), cut Sky entirely ("too orange", the peach wash), and sent Sakura, Lavender, Honey and Mocha back to their 2026-11-05 cream versions. A saved `palette: 'sky'` falls back to classic through `applyLook`. He said "completely remove the third one" (Slate on the page) in the same breath as "except Matcha, Slate and Neapolitan"; I kept Slate and flagged it.

## Morning, 2026-11-07: the dev server "keeps going blank"

Not a code bug. iCloud Drive's Optimize Mac Storage had evicted the project from disk: `ls -lO` showed `dataless` on 2,963 project files and 11,155 under node_modules, including `.git/index` (which is why the previous evening's commit timed out on `index.lock`). Vite answered each source request only after iCloud re-downloaded the file, so the page sat blank. Fix was to read every file once (`find … | xargs cat > /dev/null`), which forces the download; sources and `node_modules/.vite` came back in under a minute, node_modules and `.git` in the background. Lasting fix is Phillip's call: move the project out of `~/Documents` (iCloud), or right-click the folder in Finder → Keep Downloaded. Check for `dataless` before chasing a blank page, a hung `tsc -b`, or a git lock timeout.

Also 2026-11-07: a **Classic Blue** look (key `blue`), Classic with a true blue (#2f6fe4, dark #6ea0ff) in place of the blue violet; fat moves to the violet so it does not read as the brand colour. Hand-written block in tokens.css above the generated section, so the palette script's cut-and-append leaves it alone.

Then Classic Green (`green`, #16a34a; steps moves to the violet), Classic Pink (`pink`, #ec4899) and Classic Yellow (`yellow`, amber #e3a008; carbs moves to teal, the morning meal and warning to the violet). Phillip asked to see them, "and then we can go back": all three are one block each in tokens.css plus a row in theme.ts and a union member in types.ts.
Seen, not loved: Classic Green, Pink and Yellow cut the same morning. Classic and Classic Blue stay.

## Midday, 2026-11-07: Challenges, Apple Fitness style

Connect has a third door, Challenges. A challenge is one number (steps or water for now), a date range (7/14/30 days), and either friends (invited, they Accept or Decline, Apple-style) or a whole crew (everyone is in at once; later joiners get a Join button). A duel is drawn you-against-them with a bar each and "Leading by 1,240"; a group is a ranked list. The challenge screen adds a day-by-day table and who's in. The list shows Invites, Going on now, Coming up, Finished, across every crew and friend at once.

Scoring reads `logpal_social_days`, a per-day copy of steps and water_ml that every client upserts for its last fourteen days (store.tsx, `publishedDays`, same gate and hold as the profile publish) whenever that metric's share level is not off. Visible to the same people as the profile plus crew-mates and anyone lined up in a challenge with you (`logpal_shares_days_with`).

Tables: `logpal_challenges`, `logpal_challenge_members` (status invited|in|declined), `logpal_social_days`; helpers `logpal_in_challenge`, `logpal_made_challenge`, `logpal_challenge_crew`. The crew's Compete tab and the crew cards now read `logpal_challenges` (crew_id set); `logpal_crew_challenges` is unused and can be dropped, and `logpal_crew_preview` was re-created to read the new table. The whole "challenges" block of supabase/schema.sql plus that function must be run in the SQL editor before any of this works; until then Challenges shows "Could not find the table". Code: `src/lib/challenges.ts` (+tests), `src/services/challenges.ts`, `src/screens/Challenges.tsx` (ChallengeCard and NewChallengeSheet are shared with Crews.tsx). Not done: sharing a challenge by link to someone not on LogPal, push notifications for invites (the Connect badge polls instead), other metrics (miles cycled etc. were mentioned, parked).

## Later, 2026-11-07: crew achievements cut; exercises rebuilt

Crew Compete tab is now "Challenges": the running challenges, the start button, the weekly leaderboard, past challenges. The "Crew achievements" and "Yours" badge cards are gone, with `achievements` and its test from lib/crews.ts.

Exercise catalog (`src/data/exercises.ts`) is one row per activity instead of one per pace ("Walking", not four walking speeds). Three tabs: Cardio, Strength, Sports. Cardio and Sports overlap on purpose (`also`): Mountain Biking, Swimming, Ice Skating and the like show on both. Sports has ~60 entries (Football, Water Polo, Pickleball, Squash…), cardio ~75. Ids are now `kind:slug` (`cardio:walking`); old entries keep their name and stored calories and just lose the catalog link, so they show a manual calories field when edited.

Burn estimate (`src/lib/exercise.ts`, tests) has three tiers shown on the detail screen as "Rough / Closer / Best estimate" with three dots: time alone uses the activity's general MET; time + distance picks a MET off a speed curve (walking, hiking, running, trail running, cycling, mountain biking, swimming, paddling, skating, cross-country skiing); time + distance + elevation gain adds the climb as mechanical work at 24 % efficiency. A sport takes an optional "Distance covered (from a watch)", read as running at that average speed, floored at the sport's own MET. Distance/elevation are stored on the entry in miles/feet (`distanceMi`, `elevationFt`) and shown in km/m when the weight unit is kg. Height is not used: MET-based burn scales with weight only.
