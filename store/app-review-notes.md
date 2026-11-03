# App Review notes (paste into App Store Connect → version page → App Review Information → Notes)

Drafted 2026-11-03 in answer to the Guideline 2.1 "Information Needed" rejection of 1.0 (build 4).
Covers items 2 to 6 of Apple's list. Item 1 (the screen recording) goes in the Attachment field on the same page.

---

LogPal is a calorie and macro tracker for people who want to log what they eat, drink and do each day, see it against goals they set, and watch the trend over weeks. Target audience: adults tracking diet, weight, water, steps, sleep or intermittent fasting. It is a general wellness app, not a medical device, and gives no medical advice.

HOW TO REVIEW
No account is needed: tap "Continue as guest" on the first screen and every feature except Friends works on the device. The demo account in Sign-In Information above has a full diary. Main flows: Home (a board of widgets you can rearrange), Diary (search foods, scan a barcode, photograph a Nutrition Facts label, log water), Progress (weight and charts), Fasting timer, Settings.

Account registration: first screen, then "Create account" (email) or "Sign in with Apple".
Account deletion: Settings, tap your name at the top, "Delete account", confirm. This removes the auth user and every row of their data on the server immediately (a Supabase function, delete_own_account) and signs the device out.
Apple Health (optional, off by default): Settings > Apple Health, or the Steps screen > "Link with Apple Health". The system Health Access sheet appears. Steps, weight and workouts are read in; water, weight and nutrition are written out. Turning the switch off stops both. Health data never leaves the device and is never sent to our servers.

EXTERNAL SERVICES
- Supabase (supabase.com): authentication (email and Sign in with Apple) and the per-user database behind cloud sync and Friends. Row-level security scopes every table to the signed-in user.
- Open Food Facts (openfoodfacts.org): the public food and barcode database used for search and barcode scanning.
- Apple HealthKit: optional, on-device only.
- Tesseract.js: the nutrition-label reader runs entirely on the device; photos never leave the phone.
- Recipe photos are stock images loaded from Pexels.
No ad networks, analytics SDKs, AI services or payment processors. No in-app purchases; the app is free.

USER-GENERATED CONTENT
The only user-generated content is a username and the numeric daily figures (calories, water, steps) a person chooses to share with followers they have approved. There is no free text, messaging, comments, photos or public feed. Follow requests must be accepted; a user can decline or remove a follower, unfollow, or set their profile to private at any time from the Friends screen.

REGIONS
The app behaves identically in every region. Language follows the device (English, Spanish, French, German, Portuguese, Italian, Chinese, Japanese) and units can be switched between metric and US.

REGULATED CONTENT
None. No medical claims and no protected third-party material.

SCREEN RECORDING
A recording captured on an iPhone running the current iOS release, starting from launch and showing the guest flow, account creation, food and water logging, Apple Health linking and account deletion, is in the Attachment field below.

---

## What to record on the iPhone (Control Center → Screen Record), 3 to 5 minutes, one take

1. Start recording on the home screen, then open LogPal from its icon.
2. Tap "Continue as guest". Log a food (search), log water, open Steps.
3. Settings → sign in → "Create account" with a throwaway email. Finish setup.
4. Steps screen → "Link with Apple Health" → allow on the Health sheet.
5. Friends: search a username, send a follow request (shows the only social feature).
6. Settings → tap your name → Delete account → confirm. The app returns to the sign-in screen.
7. Stop recording. AirDrop the .mp4 to the Mac, then on the version page: App Review Information → Attachment → Choose File.
