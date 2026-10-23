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

## 1. Done so far

**2026-10-13:** app icon set, web manifest and Apple meta tags, the `/privacy`
page (still carrying `CONTACT_EMAIL` as a placeholder in two places), a
Privacy link on About, in-app account deletion with typed confirmation, and
the `delete_own_account()` SQL at the bottom of `supabase/schema.sql`.

**2026-10-23, the native shell.** Everything that does not need Xcode:

| What | Where |
|---|---|
| Capacitor 8 installed, iOS project generated with **Swift Package Manager** (no CocoaPods on this Mac, none needed) | `capacitor.config.ts`, `ios/` |
| The web build, food database included, copied into the app bundle on every `npm run ios`; the app searches fully offline, about 45 MB | `ios/App/App/public` (ignored by git, regenerated) |
| Every iOS icon and splash size, light and dark, from `resources/` | `ios/App/App/Assets.xcassets` |
| Camera permission text, the `logpal://` URL scheme, portrait-only on iPhone, the encryption question answered | `ios/App/App/Info.plist` |
| Sign-in leaves the app through the system browser and returns by deep link (Google refuses embedded web views) | `src/lib/native.ts`, `src/lib/supabase.ts`, `src/screens/Auth.tsx` |
| **Sign in with Apple** button, shown in the app only | `src/screens/Auth.tsx` |

Two scripts: `npm run ios` builds the web app and copies it into the iOS
project; `npm run ios:open` opens that project in Xcode. (`npm run ios:sync`
also re-resolves the Swift packages; only needed when a plugin is added, and
it can hang on a keychain prompt, so it is not the default.)

**Xcode 27.1 is installed and the app builds and runs in the iPhone 18 Pro
Simulator (verified 2026-10-23):** sign-in screen with the Apple button, the
system-browser sign-in sheet opening to Google, onboarding, and Home with
the status bar and home indicator cleared.

The bundle id is `com.logpal.app`, a placeholder. It must match the App ID
you register in the developer portal and cannot change after the first
upload, so decide it before step 7 below and tell me if it should differ.

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

## 3. Left for when Xcode and the developer account exist

1. **Supabase → Authentication → URL Configuration → Redirect URLs:** add
   `logpal://auth`. Without it the phone's sign-in completes at Google and
   never comes back. (Yours; it needs your login.)
2. **Supabase → Sign In / Providers → Apple:** paste the Services ID, Team
   ID, Key ID and the key from the developer portal (step 7). The button is
   already in the app and errors with "unsupported provider" until this is
   done.
3. **Open the project** with `npm run ios:open` (or open
   `ios/App/App.xcodeproj`), select the App target → Signing & Capabilities,
   tick Automatically manage signing and pick your Team. Add the
   **Sign in with Apple** capability there too.
4. Run it in the Simulator from Xcode, then on your phone over the cable.
   The barcode decode loop, never verified on a real camera, gets its first
   real test here.
5. Product → Archive → Distribute → App Store Connect → TestFlight on your
   phone first, then submit.

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
