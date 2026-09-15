# Aretē Brand Guide

Source of truth for Aretē's brand identity — name, voice, logo, color, and
type. Grounded in what's already shipped (homepage copy, in-app theme
tokens, App Store listing) rather than invented from scratch. A polished
visual version of this lives in the companion Artifact (ask Claude for the
link, or re-publish from `BRAND.md` + the design pass below).

---

## Name

**Aretē** — *ē* is a Unicode macron-e (U+0113, `&#x113;`), not a plain "e".
Use the macron in all UI copy, marketing copy, and prose. Drop it only where
the character set can't render it (e.g. file names, bundle identifiers,
URLs) — those already use the plain-ASCII **Arete** / **arete** form
(`aretefitnessapp.com`, `com.aretefitness.app`).

From Greek ἀρετή (*arete*) — "excellence" or "virtue," specifically the
excellence realized through struggle and pursuit rather than given. That's
the whole positioning: the app doesn't just log workouts, it measures your
pursuit of excellence and marks your progress toward it.

---

## Slogan

> **Pursue Excellence**

The official slogan (adopted September 2026; already live in the homepage
`<title>`). It is the name translated into an instruction: *aretē* means
excellence, and the slogan tells you what to do with it. It stands on its
own without the app beside it and doesn't go stale as features change.

### Usage

**Do**
- Set it in title case, two words, no trailing period when it stands alone:
  **Pursue Excellence**.
- Pair it with the wordmark on dark grounds, slogan set below the mark.
- Uppercase is fine in eyebrows and small labels: **PURSUE EXCELLENCE**.

**Don't**
- Reword it: not "Pursuing Excellence," "Pursue Your Excellence," or
  "Excellence Pursued."
- Add to it: no "Pursue Excellence!" or "Pursue Excellence with Aretē."
- Join it to another line with a dash. When it needs a partner line, use a
  period (see the extended line below).

### Supporting lines

**Extended line** (homepage hero today): use where the product needs naming
alongside the slogan. Sentence case with periods, since it reads as two
sentences.

> **Pursue excellence. Track every rep.**

**Descriptor line** (FAQ / App Store style, one sentence, use when a fuller
explanation is needed):

> Aretē is a workout tracking app focused on helping you measure and pursue
> excellence in your training. Log strength and cardio workouts, track
> personal records, monitor progress over time, and get AI-generated
> programs tailored to your goals.

### Considered, not chosen

These were slogan candidates. They are retired as slogans but still usable
as feature or campaign headlines, always below the slogan:

| Line | Best fit now |
|---|---|
| **Rise through the ranks.** | Greek Rank feature headline (Neophyte → Aretē) |
| **Measure your excellence.** | Strength Score and progress screens |
| **Excellence, logged.** | Workout-complete moments |
| **Every rep counts toward the ascent.** | Rank-up and PR celebration copy |
| **Train like it matters.** | Most generic. Avoid unless the others read too gamified for a placement |

---

## Voice

Pulled from the existing homepage/FAQ copy — this is the tone already in
production, not a new invention:

- **Confident, not hype-y.** "Aretē is a workout tracking app focused on
  helping you measure and pursue excellence" — states what it is and does,
  no exclamation points, no "revolutionary."
- **Benefit-first sentences.** Feature descriptions lead with what the user
  gets ("Log strength and cardio workouts, track personal records...")
  before naming the mechanism.
- **Plain, short sentences over jargon** — except where the app's own
  invented vocabulary (Greek Rank, Strength Score, Aretē rank) *is* the
  point; those terms are used directly and explained once, not hedged.
- **Second person, active voice.** "Your Greek Rank is a score from 0–100
  that reflects your overall training excellence..."

### Copy rules

- **Celebrate with the number, not punctuation.** No exclamation marks, no
  emoji in notifications or UI copy. The achievement is the excitement.
- **Errors say what failed and what to do.** Never title an alert just
  "Error", and never stop at "Something went wrong."
- **Confirmations ask a direct question** and say what will be lost.
- **Casing:** Title Case for buttons, screen titles, and alert titles.
  Sentence case, ending in a period, for messages, toasts, and empty states.
- **No em dashes in user-facing text.** Use a period, colon, or middle dot
  (·). The lone "—" placeholder for a missing value is fine.
- **Empty states point to the next step** instead of only saying "No X yet."
- US spelling ("personalized", not "personalised").

### Copy examples

Real strings from the app, rewritten to the rules above.

**Notifications**

| Where | Now | Rewrite |
|---|---|---|
| Re-engagement push (`app.py`) | "Miss your gains? 💪" / "You haven't logged a workout in a while. Jump back in!" | "Your next PR is waiting" / "It's been over a week since your last workout. Pick up where you left off." |
| Daily reminder (`utils/notifications.ts`) | "Time to work out! 💪" / "Don't forget your workout today." | "Time to train" / "Log today's workout to keep your progress moving." |
| Rest timer (`notifications.ts`, `WorkoutLog.tsx`) | "Rest over. Time to lift! 💪" / "Your rest period has ended." | "Rest over" / "Time for your next set." |
| GPS tracking (`utils/gpsTracking.ts`) | "Aretē — tracking your activity" | "Aretē · Tracking your activity" |

**Celebrations**

| Where | Now | Rewrite |
|---|---|---|
| Workout summary, first workout | "Your first workout. Incredible!" | "Your first workout. The pursuit starts here." |
| Workout summary | "Highest volume workout yet!" | "Your highest-volume workout yet." |
| Workout summary, default | "Great workout!" | "Workout complete." |
| Strength Score rank up | "Rank Up! Demigod" | "You've reached Demigod" |
| PR share card banner | "New Max Weight PR!" | "New PR: Max Weight" |
| Paywall toasts | "Welcome to Premium!" / "Purchases restored!" | "Premium is active." / "Purchases restored." |

**Errors and confirmations**

| Where | Now | Rewrite |
|---|---|---|
| 67 alerts across the app | "Error" / "Something went wrong" | Title names the failure, e.g. "Couldn't Save Template". Body is the server's message when there is one, otherwise "Try again in a moment." When the request never reaches the server, the app shows a single "Network error" banner and no dialog. |
| Form validation (routines, templates, AI workouts) | "Error" / "Please enter a routine name" | "Name Required" / "Add a name for this routine before saving." |
| Dashboard | "Error" / "Failed to load workouts" | "Couldn't Load Workouts" / "Check your connection and try again." |
| Save as template (`WorkoutDetails.tsx`) | "Cannot Save Template" / "None of the exercises in this workout were selected from the exercise library. To create a template, use exercises from the library when logging." | "Can't Save as Template" / "Templates only work with exercises from the library, and this workout doesn't have any." |
| Discard workout (`WorkoutLog.tsx`) | "Discard Workout" / "Are you sure you want to discard this workout?" | "Discard Workout?" / "Your logged sets will be lost." |
| GPS save | "Save Failed" (and "Save failed" elsewhere) | "Save Failed" everywhere (Title Case) |

**Empty states**

| Where | Now | Rewrite |
|---|---|---|
| Coach, templates | "No templates yet" | "No templates yet. Save a workout as a template to reuse it." |
| Coach tab | "No data yet. Log some workouts first" | "No data yet. Log a few workouts to fill this in." |
| Personal Records | "No max-weight records yet." | "No max weight PRs yet. Log a strength workout to set your first." |
| Personal Records, time | "No time records yet. Log a run, ride, or timed hold to see your bests." | Already right. Use as the model. |

### Word list

| Use | Not | Notes |
|---|---|---|
| **workout** | session, training session | "workout" appears about 100 times in the app, "session" 7. Rename "Session Length" (Coach profile) to "Workout Length". The account "Session" section (login) is fine. |
| **exercise** | movement | "lift" is fine in casual strength copy, never as a label. |
| **PR** | record, personal best | "Personal Records" only as a screen or section title. Everywhere else, "PR". |
| **Est. 1RM** / **Estimated 1RM** | e1RM, 1RM PR | A stat and chart label only, never a PR label. Short form in tight labels, long form in chart titles and info text. |
| **Greek Rank** | Greek rank, level, tier | Rank names are always capitalized: Neophyte, Athlete, Hero, Demigod, Olympian, Titan, Aretē. |
| **Strength Score** | strength score, score (on first mention) | |
| **bodyweight** | body weight, Body Weight | One word. Fix the "Body Weight" tab in Measurements. |
| **warm-up** (noun), **warm up** (verb) | warmup | |
| **routine** | plan | A weekly schedule of templates. Marketing copy may say "program" when describing AI-generated routines. |
| **template** | | A saved workout you can start again. |
| **Coach** | AI coach | "AI" is fine when explaining what generates a workout. |
| **log** (one workout or set) / **track** (progress over time) | record (as a verb) | "Log Workout", "Track your PRs". |
| **Delete** / **Remove** / **Discard** | | Delete = gone for good. Remove = taken off a list or workout. Discard = unsaved work thrown away. |
| **lbs**, **kg** | lb, pounds | Lowercase, with a space: "225 lbs". |
| **Premium** | Pro, subscription (in UI) | |
| **Aretē** | Arete | Macron everywhere in copy. |

---

## Logo

Two lockups ship today, both in `src/workout-tracker-native/assets/`:

- **`Arete_name.png`** — full wordmark: a barbell forms the "A," followed
  by "retē" in Archivo Black with the macron over the e.
  Rendered **white**, for dark surfaces (homepage header on `#0D0D0D`,
  splash screen on `#141416`, share cards, Welcome and onboarding screens).
- **`Arete_name_dark.png`** — the same wordmark in ink `#0D0D0D` for light
  surfaces, with the barbell bar set in `#8E8E93` so it still reads as a
  separate bar in front of the "A" (a flat single-color version merges the
  bar, plates, and legs into one shape).
- **`Arete_icon.png`** — icon mark only: the barbell-A monogram, no
  wordmark text. Rendered as a glossy black mark on a light ground. This is
  the app icon / adaptive-icon foreground / notification icon source.
- **`Arete_splash.png`** — the wordmark centered on the app's dark launch
  background (`#141416`), used as the Expo splash screen image.

**Construction:** the "A" crossbar is a literal barbell (weight plates as
the crossbar ends) — the monogram *is* the equipment, not a barbell icon
placed next to a letter. Keep that construction intact if the mark is ever
redrawn or resized; don't substitute a generic dumbbell glyph.

**Wordmark typeface:** "retē" is set in **Archivo Black**, outlined into
shapes in the logo files, so it isn't a live font. The barbell "A" is
custom-drawn and doesn't come from any font. Archivo Black is also the
marketing headline face (see Typography), so headlines and the logo share
one voice.

### Clear space

The unit **x** is the height of the lowercase "e" in the wordmark (about
38% of the wordmark's total height). Keep at least **1x** of empty space on
every side of the wordmark: no text, edges, or other graphics inside it.
For the icon mark alone, keep clear space equal to the width of one weight
plate.

### Minimum size

| Mark | Digital | Print |
|---|---|---|
| Wordmark | 28 px tall (about 72 px wide) | 20 mm wide |
| Icon mark | 20 px | 6 mm |

Below the wordmark minimum the macron and the gaps in the barbell stop
reading. Switch to the icon mark instead of shrinking further.

### Source files

Vector masters exported from Figma live in `src/workout-tracker-native/assets/`:

| File | Size | Use |
|---|---|---|
| `Arete_name.svg` | Vector | Master. Use for anything large: App Store, social, print, web |
| `Arete_name_dark.svg` | Vector | Ink master, generated from `Arete_name.svg` (white → `#0D0D0D`, bar `#EFEFEF` → `#8E8E93`, group opacity removed) |
| `Arete_name@4x.png`, `Arete_name_dark@4x.png` | 1472 × 572 | For tools that can't take SVG |
| `Arete_name.png`, `Arete_name_dark.png` | 368 × 143 | In-app and homepage only |

Never upscale the 368 px PNGs. In the white master, the "A" and barbell
are drawn at 95% opacity, slightly softer than "retē"; keep that as is.
If the wordmark changes in Figma, re-export the SVG and regenerate the ink
version from it instead of editing the ink files by hand.

### Color variants

| Variant | File | Use on |
|---|---|---|
| White | `Arete_name.png` | Dark neutrals: `#0D0D0D`, `#141416`, `#1C1C1E` |
| Ink | `Arete_name_dark.png` | Light neutrals: `#F2F2F7`, `#FFFFFF`, `PR_GOLD_BG` |

Don't place either variant on an accent color fill or on a photo without a
dark overlay of at least 60% opacity.

### Don't

- Stretch, squash, rotate, or skew the mark.
- Recolor it outside the two variants above, including accent colors and
  PR gold.
- Add outlines, drop shadows, or gradients to the mark. The one approved
  effect is the soft radial glow *behind* the wordmark on the splash screen.
- Separate the barbell from the "A," or replace it with a dumbbell or other
  equipment.
- Retype "retē" in a live font, change the spacing between the "A" and
  "retē," or drop the macron.

### Slogan lockup

The wordmark with **Pursue Excellence** set below it, both centered:

- **Slogan type:** Archivo SemiBold (600) at 112% width, uppercase,
  letter-spacing 0.22em.
- **Slogan size:** font size equal to 0.16 × the wordmark's height
  (about 19 px under a 120 px tall wordmark).
- **Gap:** 1x (the "e" height) between the bottom of the wordmark and the
  top of the slogan.
- **Slogan color:** `#8E8E93` under the white wordmark, `#6C6C70` under the
  ink wordmark.
- **Clear space and minimum size:** 1x clear space around the whole lockup.
  Don't use the lockup below 48 px wordmark height, where the slogan drops
  under 8 px. Use the wordmark alone instead.

---

## Color

### Brand accent

The app doesn't have one fixed "brand color" in the traditional sense —
users pick their own accent from 8 presets, and the whole UI re-themes
around it. For anything *outside* the app where one fixed color is needed
(marketing site, App Store graphics, social), **Green is the canonical
default** — it's what the homepage CTA button and section labels already
use.

Each preset has a dark-mode and a light-mode shade. The bright dark-mode
colors are unreadable on light backgrounds, so light mode uses a deeper
shade with white text:

| Preset | Dark mode | Text on fill | Light mode | Text on fill |
|---|---|---|---|---|
| **Green (default)** | `#30D158` | `#000000` | `#1C7F35` | `#FFFFFF` |
| Blue | `#007AFF` | `#000000` | `#006BE0` | `#FFFFFF` |
| Purple | `#BF5AF2` | `#000000` | `#A922EE` | `#FFFFFF` |
| Orange | `#FF9F0A` | `#000000` | `#C93400` | `#FFFFFF` |
| Red | `#FF453A` | `#000000` | `#D70015` | `#FFFFFF` |
| Pink | `#FF375F` | `#000000` | `#D30F45` | `#FFFFFF` |
| Teal | `#5AC8FA` | `#000000` | `#0576AA` | `#FFFFFF` |
| Indigo | `#5E5CE6` | `#FFFFFF` | `#5E5CE6` | `#FFFFFF` |

**No Yellow preset.** Removed September 2026. In dark mode it was nearly
identical to the Aretē rank gold (`#FFD700`), and a yellow dark enough to
read in light mode lands on PR gold's hue. Gold is reserved for
achievement. Anyone who had picked Yellow falls back to Green.

### Accent contrast

WCAG contrast ratios. **4.5** is the minimum for normal text, **3.0** for
large text, icons, and button shapes.

| Preset | Dark: accent on `#141416` | Dark: text on fill | Light: accent on `#F2F2F7` | Light: text on fill |
|---|---|---|---|---|
| Green | 9.10 | 10.39 | 4.55 | 5.08 |
| Blue | 4.58 | 5.23 | 4.50 | 5.02 |
| Purple | 5.22 | 5.96 | 4.53 | 5.06 |
| Orange | 8.95 | 10.22 | 4.73 | 5.28 |
| Red | 5.40 | 6.16 | 4.83 | 5.38 |
| Pink | 5.22 | 5.96 | 4.80 | 5.35 |
| Teal | 9.70 | 11.08 | 4.50 | 5.03 |
| Indigo | 3.64 | 5.06 | 4.54 | 5.06 |

- **Light-mode shades** keep each preset's hue, darkened to 4.5 on
  `#F2F2F7`, except Orange, Red, and Pink, which use Apple's
  increased-contrast shades so the warm colors stay distinct from each other.
- **Known gaps:** Indigo in dark mode (3.64) is fine for icons and large
  text but too dark for small accent-colored text. Blue on dark card
  surfaces (`#1C1C1E`) is 4.24, borderline for small text.
- **Marketing** uses the dark-mode Green on `#0D0D0D`. Never set bright
  Green text on a light background.

### Gold — achievement signal

Two distinct golds, used for two distinct things. Don't conflate them:

| Token | Hex | Use |
|---|---|---|
| `PR_GOLD` | `#f9de73` | Personal-record indicators — trophies, laurel borders, PR banners |
| `PR_GOLD_TEXT` | `#ad9206` | Dark text/laurel color on gold or surface backgrounds |
| `PR_GOLD_BG` | `#FFF3C4` | Cream background for PR banners |
| **Aretē rank gold** | `#FFD700` | The single highest Greek Rank ("Aretē" itself) — brighter, more saturated than PR gold, deliberately reserved for the pinnacle rank so it reads as rarer |

### Neutrals — dark (default surface for marketing + share cards)

| Token | Hex | Use |
|---|---|---|
| Background | `#0D0D0D` / `#141416` | Homepage body / in-app dark background (two close-but-distinct blacks — homepage and share cards use `#0D0D0D`, in-app theme uses `#141416`) |
| Surface | `#1C1C1E` | Cards, stat rows, elevated panels |
| Border | `#2C2C2E` / `#38383A` / `#3A3A3C` | Hairlines, dividers, card borders (darkest→lightest as emphasis increases) |
| Text primary | `#FFFFFF` / `#F2F2F7` | Headings, primary copy |
| Text secondary | `#8E8E93` | Captions, muted labels, dates |
| Text tertiary | `#636366` / `#3A3A3C` | Footer copy, least-emphasis text |

### Neutrals — light

| Token | Hex | Use |
|---|---|---|
| Background | `#F2F2F7` | App background |
| Surface | `#FFFFFF` | Cards, elevated panels |
| Border | `#E5E5EA` | Hairlines |
| Text primary | `#000000` | Headings, primary copy |
| Text secondary | `#6C6C70` | Captions, muted labels |
| Placeholder | `#AEAEB2` | Input placeholder text |

### Semantic (same in both modes)

| Token | Hex | Meaning |
|---|---|---|
| Danger | `#FF3B30` (light) / `#FF453A` (dark) | Destructive actions, errors |
| Warm-up set | `#FF9500` | Warm-up set indicator |
| Drop set | `#AF52DE` | Drop-set indicator |

---

## Typography

Two type systems: **Archivo** for marketing (headlines, the slogan, labels,
and stats outside the app), and **the OS system font** for the app UI and
all body text. The app itself loads no custom font.

- **Wordmark** — Archivo Black, outlined into the logo files (see Logo
  section above).
- **Product UI** — system default: San Francisco on iOS, Roboto on Android
  (`typography.ts` sets no `fontFamily`, so it inherits the OS default).
  Scale:

  | Token | Size |
  |---|---|
  | `fontSize.xs` | 11 — micro labels, axis text, badges |
  | `fontSize.sm` | 14 — secondary body text |
  | `fontSize.md` | 16 — primary body text |
  | `fontSize.lg` | 20 — screen titles |
  | `fontSize.xl` | 22 — stat values, large labels |
  | `fontSize.xxl` | 28 — display numbers |
  | `title` | 30 |
  | `body` | 15 |
  | `button` | 16, weight 600 |

### Marketing type

For the homepage, App Store screenshots, social posts, and this guide. One
family, Archivo, with the system font for body text:

| Role | Face | Setting |
|---|---|---|
| Headlines | **Archivo Black** | Sentence case, letter-spacing -0.01em |
| Subheads | **Archivo Bold** (700) | Normal width, sentence case |
| Slogan, eyebrows, small labels | **Archivo SemiBold** (600) | 112% width, uppercase, letter-spacing 0.22em (slogan) or 0.08em (labels) |
| Big stat numbers | **Archivo ExtraBold** (800) | 75% width |
| Greek Rank names | **Archivo Black** | In the rank's color |
| Body | **System font** | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif` |

**Loading:**
`https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wdth,wght@62..125,600..800&display=swap`

**Fallbacks:** `'Archivo Black', 'Arial Black', sans-serif` for headlines;
`Archivo` followed by the system stack for everything else.

**Don't** set paragraphs or buttons in Archivo Black, and don't add a second
display face. Round geometric fonts (Poppins, Montserrat) clash with
Archivo's squared shapes.

---

## Iconography & motifs

- **Laurel branch** (`components/LaurelWreath.tsx`) — flanks PR callouts
  and rank achievements. Gold-colored, hand-drawn SVG paths (not an icon
  font). This is the single most distinctive recurring visual motif in the
  product beyond the logo itself.
- **Trophy** — secondary achievement marker (Ionicons `trophy`/
  `trophy-outline`), used alongside or instead of the laurel for PR counts
  and stats.
- **Greek Rank ladder** — the core progression system and a brand pillar,
  not just a feature:

  | Rank | Color |
  |---|---|
  | Neophyte | `#888888` |
  | Athlete | `#4A9EFF` |
  | Hero | `#4CAF50` |
  | Demigod | `#FF9800` |
  | Olympian | `#9C27B0` |
  | Titan | `#E53935` |
  | **Aretē** (pinnacle) | `#FFD700` |

  The naming convention (mortal → hero → divine → the abstract virtue
  itself) mirrors the brand's Greek-excellence framing end to end — worth
  keeping in mind for any future feature that adds tiers, badges, or
  progression language.

---

## Identity reference

| | |
|---|---|
| Domain | `aretefitnessapp.com` |
| Support email | `support@aretefitnessapp.com` |
| iOS bundle ID | `com.aretefitness.app` |
| Android package | `com.aretefitness.app` |
| Deep link scheme | `aretefitness://` |
| App Store | [apps.apple.com/app/id6744030558](https://apps.apple.com/app/id6744030558) |
| Expo project ID | `356b88e9-4302-43fc-b50a-6d83030b8fa6` |
