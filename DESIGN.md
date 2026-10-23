# LogPal — the visual system

Written 2026-10-23, after the user asked for a sleeker, more professional
interface and, specifically, for the "AI tendencies" to be put aside in favour
of what the best trackers actually do. This is the brief that came out of
looking at them. Read it before changing anything visual; `tokens.css` and the
shared classes in `global.css` are its implementation.

## What was studied

The App Store screenshots of eight apps, viewed at full size rather than
described: Cal AI, MyFitnessPal (the 2025 "Today" redesign), Lifesum, Yazio,
Lose It!, MacroFactor, Cronometer and Gentler Streak. Plus the trade writing
on fitness-dashboard UX and on what makes machine-generated interfaces look
generic. The screenshots are not kept in the repo.

## What the professional ones have in common

1. **Content on white.** A near-white neutral ground, pure white cards, a soft
   low shadow or a hairline. Nothing is tinted. The brand colour is a detail
   on white, never the ground (Cal AI, MFP, Lifesum, Lose It, Cronometer all
   do this; Yazio and MacroFactor are the dark-mode equivalents, true black
   with #1C-ish cards).
2. **One hero number.** Calories remaining, large (36–52px, weight 700–800,
   tight tracking), with a ring or arc beside it. Eaten and goal are small
   figures around it, never competing with it.
3. **Macros as three equal units** in a row, each with its own colour, a
   small ring or bar, and "96 / 158g" in bold-over-grey.
4. **A dated week strip** at the top: seven circles with the day number
   inside, today marked, logged days ringed.
5. **A streak pill** top right: flame plus count, in a white pill.
6. **The day's log as rows**: an icon or photo in a tinted square at the left,
   the meal or food in 15–16px semibold, a grey sub-line, the calories in bold
   at the right, and a round "+" where nothing is logged yet.
7. **A white floating pill tab bar** with the add button in or beside it, the
   active tab in the brand colour, inactive in grey.
8. **System type.** SF Pro on iPhone, used at Apple's own sizes: large title
   32–34/800, section 20/700, body 15, secondary 13, caption 11–12. Numbers
   are the display weight of the same face. No webfont, no rounded variant.
9. **Colour means something.** Protein, carbs and fat each own a hue;
   water, steps and sleep too. Everything else is black, grey and white, plus
   the one accent.
10. **Buttons are pills.** Full-width, 52px tall, radius 999, with the one
    committing button filled and the rest outlined in a hairline.

## What was identified as the machine look, and is now banned here

- Purple-to-indigo gradients, glows, radial washes behind rings.
- Glass cards (translucent fills with blur) and borders made of
  `rgba(255,255,255,.1)`.
- A tinted page ground (the old lavender wash) and a gradient masthead.
- Three identical cards in a row as a reflex, a centred hero ring floating in
  empty space, decorative hairlines standing in for structure.
- Webfonts chosen to look "modern" (Inter, Manrope, Sora) in place of the
  platform face.
- Emoji as icons.

## The decisions

| Thing | Decision | Why |
|---|---|---|
| Ground | `#F4F4F7`, cool neutral | Every studied app; cool to honour the user's standing rule against warm greys |
| Cards | White, radius 20, `--shadow-card` | Cal AI's cards exactly; soft enough that the page reads flat |
| Accent | `#5B5BD6` blue violet, kept | Chosen by the user on a real board. Used for: calorie ring, add button, active tab, links, the selected day. Never a background larger than a pill |
| Macros | protein coral `#E5533D`, carbs amber `#F2A33A`, fat blue `#3B82F6` | Cal AI's mapping; three hues clearly apart from each other and from the accent; red/orange against blue survives colourblindness |
| Water / steps / sleep | cyan, green, purple | Conventional, and none collide with fat's blue or the accent |
| Type | System stack, display weight for numbers | Reference apps; matches the phone |
| Gutter | 16px | Apple's layout margin; cards and lists align to it |
| Nav | White pill, 6 tabs + centred violet FAB | Kept from before; restyled to Cal AI's weight and colour logic |
| Home | Header (date, title, streak, settings) → week strip → widget board → meal rows | The order the studied apps use, and the widget board stays because it was asked for |

## Rules for new screens

- Start from `.card`, `.row`, `.banner`, `.btn`, `.pill`, `.meal`,
  `.stat-icon`. Do not invent a new surface.
- Side margin is `var(--gutter)` everywhere. Inside a card, 18px.
- One hero figure per screen, in 32px or larger. Everything else steps down.
- Colour only where it means something. If a new element needs a colour, ask
  which of the eight tokens it is; if none, it is grey.
- No gradients, no blur, no glow, no emoji. Icons are the stroke set in
  `Icon.tsx`.
- Verify on a phone-width viewport in both themes before calling it done.

## What a page of numbers was still missing (added the same day)

The first pass was clean and the user's verdict was "neat, but empty". Looking
again at the reference screenshots, the difference was never the layout: it
was that every one of them has *life* on the page that ours lacked. Four
things were added, each a pattern taken from a specific app:

- **A greeting and one sentence about the day** (Lifesum's "Good morning"
  card, MFP's coach), computed from the day's own figures in
  `lib/dayInsight.ts`. One rule fires; short sentences; it never tells anyone
  what to eat.
- **A one-tap "Log again" rail** of recent foods (MacroFactor's recents, the
  quick-log advice in every UX piece read). A repeat meal is the common case.
- **A mark beside every food** (MacroFactor's pictograms): a food-group icon
  on its group's tint, decided from the name in `lib/foodIcon.ts`. Lists stop
  reading as spreadsheets.
- **Recipes with photographs that fit the calories left** (Lifesum's plans,
  Cal AI's photo rows), from the catalogue, favouring protein when protein is
  behind. The one place Home shows a picture of food.

Plus a weight widget with a trend line, which every weight-loss app puts on
its first screen.

## The colour decision (2026-10-23)

Five alternative accents (forest, navy, terracotta, teal, plum) and two
violet studies were put on the real Home screen and judged with peers. The
choice was **Violet bold**: the accent stays, and more of the page carries
colour. In the app this is the block at the end of `global.css` headed
"colour on the page": the calorie card is solid accent with white figures,
each stat tile is washed in its own colour with a solid icon disc, the macro
figures are set in their colours, and the greeting, streak, week and active
tab are tinted. The rule from the first pass still holds: the ground is white
and the accent is never a surface larger than one card.
