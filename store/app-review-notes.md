# App Review notes (paste into App Store Connect → version page → App Review Information → Notes)

Drafted 2026-11-03 in answer to the Guideline 2.1 "Information Needed" rejection of 1.0 (build 4).
Covers items 2 to 6 of Apple's list. Item 1 (the screen recording) goes in the Attachment field on the same page.

---

LogPal is a free calorie and macro tracker for people who want to log what they eat, drink and do each day, see it against goals they set themselves, and watch the trend over weeks. Target audience: adults tracking diet, weight, water, steps, sleep or intermittent fasting, optionally alongside friends. It is a general wellness app, not a medical device, and gives no medical advice, diagnosis or treatment. There are no in-app purchases, subscriptions or ads.

HOW TO REVIEW
No account is needed: tap "Continue as guest" on the first screen and every feature except the social ones works on the device. The demo account in Sign-In Information above has a full diary and friends. First-run setup asks about body, goal and activity, then offers an optional "Meal Scan" step (photograph your hand as a portion-size reference; "Skip for now" is at the bottom).
Main tabs: Home (a board of widgets you arrange), NutriScan (photograph a Nutrition Facts label; read on the device), Plan (goals, meals, recipes), Progress (weight and charts), Connect (friends, crews, weekly challenges) and Settings. The + button logs food (search, barcode, meal photo), water, exercise, weight and sleep.

Account registration: first screen, "Create account" (email) or "Sign in with Apple". After sign-up the app asks for a username, a name, and "Who can see your progress": Private (default), Public percentages, or Public everything.
Account deletion: Settings, tap your name at the top, "Delete my account", confirm. This removes the auth user and every row of their data on the server immediately (a Supabase function, delete_own_account) and signs the device out.
Apple Health (optional, off by default): Settings > Apple Health. The system Health Access sheet appears. Steps, weight and workouts are read in (with distance and elevation when the source recorded them); water, weight and nutrition are written out. Turning the switch off stops both. Health data never leaves the device and is never sent to our servers.
Camera: used by the barcode scanner, NutriScan, Meal Scan, the profile photo and the hand reference photo. Barcode frames are decoded on the device and discarded. The profile photo and the hand photo are stored with the user's profile; the hand photo is never shown to anyone. Meal photos are not stored.
Meal Scan does not use any AI or vision service: the user describes the plate in words and the estimate comes from the on-device food database. The hand photo is a size reference the user can give once at setup.

EXTERNAL SERVICES
- Supabase (supabase.com): authentication (email, Sign in with Apple, Google) and the per-user database behind cloud sync, friends, crews and challenges. Row-level security scopes every table to the signed-in user.
- Open Food Facts (openfoodfacts.org): the public food and barcode database used for search and barcode scanning.
- USDA FoodData Central: bundled in the app; no network call.
- Apple HealthKit: optional, on-device only.
- Tesseract.js: the nutrition-label reader runs entirely on the device; photos never leave the phone.
- Recipe photos are stock images loaded from Pexels.
No ad networks, analytics SDKs, AI services or payment processors.

USER-GENERATED CONTENT
Users choose a username and may add a display name, a short bio (160 characters) and a profile photo. The numbers they share (percentages of goals, or exact figures, per their privacy setting) are generated from their own diary. Crews have a name and an emoji or photo chosen by the person who creates them. There is no messaging, no comments, no public feed; the only interaction between users is following (which a private account must accept), a fixed set of emoji "nudges", and crew/challenge standings. Accounts are private by default. A user can decline or remove a follower, unfollow, leave a crew, block by setting the account private, and report problems to logpal.support@gmail.com; the account owner can delete the account and all content at any time.

REGIONS
The app behaves identically in every region. Language follows the device (English, Spanish, French, German, Portuguese, Italian, Chinese, Japanese) and units can be switched between metric and US.

REGULATED CONTENT
None. No medical claims and no protected third-party material.

SCREEN RECORDING
A recording captured on an iPhone running the current iOS release, starting from launch and showing the guest flow, account creation, the privacy choice, food and water logging, Apple Health linking and account deletion, is in the Attachment field below.

---

## What to record on the iPhone (Control Center → Screen Record), 4 to 6 minutes, one take, build 27 or later

1. Start recording on the home screen, then open LogPal from its icon.
2. Tap "Continue as guest". Go through setup: body, goal, and on "Make Meal Scan smarter" tap "Scan my hand", take the photo, pick a size, Continue. Start tracking.
3. Tap +, search a food (e.g. "oatmeal"), pick "1 serving", add it. Tap + again and log water.
4. Tap + → Meal Scan: photograph a plate, describe it, see the estimate. (Shows the camera.)
5. Settings → sign in → "Create account" with a throwaway email → username, name, then the "Who can see your progress" step (leave Private) → Finish.
6. Settings → Apple Health → turn on → allow on the Health sheet.
7. Connect tab: search a username, send a follow request; open Crews and Challenges once each.
8. Settings → Privacy & sharing: show the three options.
9. Settings → tap your name → Delete my account → confirm. The app returns to the sign-in screen.
10. Stop recording. AirDrop the .mp4 to the Mac, then on the version page: App Review Information → Attachment → Choose File.

Keep the phone in portrait, Do Not Disturb on, and do not speed up or trim the video; Apple wants to see the real pace.
