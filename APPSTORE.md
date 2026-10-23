# LogPal on the App Store — what stands between here and there

Written 2026-10-13 against commit `1173a55` plus the uncommitted work listed in
§1. Read HANDOFF.md first for the app itself; this file is only about shipping
it to Apple.

**The one-line version:** LogPal is a web app, and the App Store only takes
native binaries. The route is to wrap the existing app in **Capacitor** (an
open-source shell that puts a web app inside a real iOS app) and build it
with Xcode. Nothing in the React code has to be rewritten. But three things
on your side have to exist before any of that can start, and two App Store
rules need code that is now in place but unverified.

---

## 1. Done today (uncommitted, build and 98 tests pass)

| What | Where | Why Apple needs it |
|---|---|---|
| App icon | `public/icons/icon.svg`, PNGs at 32/180/192/512/1024, `apple-touch-icon.png`, `favicon.png` | App Store requires a 1024×1024 icon with no transparency; the 1024 is flattened. It is a placeholder design (the calorie ring on the brand violet) — swap `icon.svg` and re-run the `sips` lines in this file's §6 if you want something else. |
| Web manifest + Apple meta tags | `public/manifest.webmanifest`, `index.html` | Lets the Vercel site be added to an iPhone Home Screen full-screen today, before any native build. Theme colour now matches the wash in light and dark. |
| Privacy policy page | `public/privacy.html`, served at `/privacy` by `vercel.json` | App Store Connect requires a privacy policy URL, and Review checks it says what the app does. **It has `CONTACT_EMAIL` as a placeholder in two places** — tell me the address to put there. |
| Privacy link in the app | Settings → About → "Privacy policy" | Review expects it reachable in-app. |
| Delete account | Settings → Account → "Delete my account" (signed in only), typed `DELETE` to confirm | **Guideline 5.1.1(v)**: an app with sign-up must offer in-app account deletion. Not the same as Clear all data, which empties the account and leaves it standing. |
| SQL function behind it | `supabase/schema.sql`, bottom: `delete_own_account()` | The client cannot delete its own auth row; this runs as the definer and deletes exactly the caller. **Not yet run against the live project** — see §2 step 3. The button will fail with "function not found" until it is. |

## 2. Your side, in this order

### Step 1 — Apple Developer Program (blocks everything)
1. Go to https://developer.apple.com/programs/enroll/ and sign in with your Apple ID (it must have two-factor on).
2. Enrol as an **Individual** unless you have a registered company. US $99 per year.
3. Approval takes up to 48 hours; you get an email.

Without this: no Sign in with Apple, no TestFlight, no App Store Connect, no upload.

### Step 2 — Install Xcode (blocks the native build)
1. Mac App Store → search **Xcode** → Get. It is about 15 GB; let it finish.
2. Open Xcode once, accept the licence, and when it asks for platforms tick **iOS** and let it download.
3. Then in Terminal:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

This Mac currently has only the Command Line Tools, which cannot build an app or run the simulator.

### Step 3 — Run the account-deletion SQL (blocks the Delete button)
1. https://supabase.com/dashboard → project **egqetljdvslvfdmnecfk** (LogPal, not Daily Planner).
2. Left sidebar → **SQL Editor** → **New query**.
3. Paste the block at the very bottom of `supabase/schema.sql`, from the line `-- account deletion` to the end, and press **Run**.
4. It should say "Success. No rows returned".

### Step 4 — Turn email confirmation back on
Still in the Supabase dashboard: **Authentication → Sign In / Providers**. Above the provider list is a card called **User Signups**. Turn **Confirm email** on and press that card's own **Save changes**. It was switched off for testing; left off, anyone can register with an address they do not own, and Review may notice.

### Step 5 — Publish the Google consent screen
https://console.cloud.google.com → project **logpal-504803** → **APIs & Services → OAuth consent screen** → **Publish app**. Scope is only email and profile, so no verification is needed. While it says Testing, only listed test users can sign in with Google, and that includes Apple's reviewer.

### Step 6 — Tell me the contact email for the privacy policy
It goes into `public/privacy.html` in place of `CONTACT_EMAIL`. Apple also needs a **Support URL**; the Vercel site itself is acceptable for that.

### Step 7 — Sign in with Apple (after Step 1 clears)
**Guideline 4.8: because the app offers Google sign-in, it must also offer Sign in with Apple.** This is a hard rejection otherwise. It needs, in the Apple Developer portal: an App ID with the Sign in with Apple capability, a Services ID, and a private key. Then Supabase → Authentication → Sign In / Providers → **Apple** takes those three values. Supabase's walkthrough is at https://supabase.com/docs/guides/auth/social-login/auth-apple — do it when you reach it and I will add the button, which is a few lines.

## 3. My side, once Xcode and the developer account exist

1. `npm install @capacitor/core @capacitor/cli @capacitor/ios` and `npx cap add ios`. The `dist` folder, food database included, is copied into the app bundle, so search works fully offline on the phone. App size will be about 45 MB.
2. `Info.plist`: `NSCameraUsageDescription` for the barcode and meal scanners, or the camera prompt never appears.
3. **Google sign-in has to leave the app.** Google refuses OAuth inside an embedded web view. The flow becomes: open the Supabase OAuth URL in the system browser, return via a `logpal://auth` deep link, and feed that URL to `consumeAuthFragment`. Also add `logpal://auth` to Supabase → URL Configuration → Redirect URLs. The current `redirectTo: window.location.origin` would be `capacitor://localhost`, which Supabase rejects.
4. Sign in with Apple button in `Auth.tsx` (`provider: 'apple'`, same return path).
5. `@capacitor/assets` to generate every icon and splash size from `icon-1024.png`.
6. Status bar and safe areas checked in the real simulator, the thing this Mac could never run before — including the keyboard-and-sheet bug class from HANDOFF §5.
7. Archive in Xcode → upload to App Store Connect → TestFlight on your phone first.

## 4. The App Store Connect listing, so you can draft it meanwhile

- **Name** LogPal (check it is free in App Store Connect when you create the app; names are first-come).
- **Subtitle** (30 chars) e.g. "Calories, macros, fasting".
- **Description**, **keywords** (100 chars), **category** Health & Fitness.
- **Screenshots**: 6.9" iPhone required; 13" iPad required too unless we mark the app iPhone-only. HANDOFF says iPad is a target, so plan on both. Take them from the simulator once it exists.
- **Age rating** questionnaire: answer "None" to medical/treatment information; the app states it is not medical advice.
- **App Privacy** labels (Apple's questionnaire): collected and linked to you — Email, Name, User ID, Health & Fitness (diet, weight), User Content (diary). Not used for tracking. No analytics, no ads.
- **Privacy Policy URL** https://logpal-two.vercel.app/privacy · **Support URL** https://logpal-two.vercel.app
- **Review notes**: Apple signs in to test. Create a demo account (email + password, confirmed) and put its credentials in the review notes. Say plainly that meal scan estimates from the description, not the photo.

## 5. Review risks worth knowing

- **4.2 Minimum functionality** — Apple rejects "a website in a wrapper". LogPal has a 233k-food offline database, camera scanning, and no browser chrome, which is well past that line, but the reviewer must not see a loading page waiting on the network. Bundling `dist` handles it.
- **4.8** — Sign in with Apple, above. Non-negotiable.
- **5.1.1(v)** — account deletion, done pending the SQL.
- **5.1.1(iii)** — the camera prompt text must say what the camera is for. Covered by item 2 in §3.
- Health claims — the app already says nothing is medical advice, and calories are "estimates from standard equations". Keep it that way in the listing.

## 6. Regenerating the icon

```bash
cd ~/Documents/Projects/logpal
qlmanage -t -s 1024 -o public/icons public/icons/icon.svg && mv public/icons/icon.svg.png public/icons/icon-1024.png
sips -s format jpeg -s formatOptions 100 public/icons/icon-1024.png --out /tmp/i.jpg && sips -s format png /tmp/i.jpg --out public/icons/icon-1024.png
for s in 512 192 180 32; do sips -z $s $s public/icons/icon-1024.png --out public/icons/icon-$s.png; done
cp public/icons/icon-180.png public/apple-touch-icon.png && cp public/icons/icon-32.png public/favicon.png
```
