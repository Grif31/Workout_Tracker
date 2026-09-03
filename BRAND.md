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

## Tagline & positioning

**Primary tagline** (live on the homepage today):

> **Pursue excellence. Track every rep.**

**Short form** (page titles, tight spaces — also live today, in the
homepage `<title>`):

> **Pursue Excellence**

**Descriptor line** (FAQ / App Store style, one sentence, use when a fuller
explanation is needed):

> Aretē is a workout tracking app focused on helping you measure and pursue
> excellence in your training — log strength and cardio workouts, track
> personal records, monitor progress over time, and get AI-generated
> programs tailored to your goals.

### Additional slogan options (drafted, not yet shipped anywhere)

Kept in the same register as the primary tagline — short, imperative or
declarative, tied to a real mechanic in the app rather than generic fitness
talk. Pick one to promote, or keep the primary as the only canonical one:

| Option | Ties to |
|---|---|
| **Measure your excellence.** | Echoes the FAQ's "measure and pursue excellence" line directly |
| **Rise through the ranks.** | The Greek Rank system (Neophyte → Aretē) — most distinctive mechanic in the app |
| **Excellence, logged.** | Core workout-logging feature, wry/short |
| **Every rep counts toward the ascent.** | Rank progression + PR culture together |
| **Train like it matters.** | Most generic of the set — only use if the others read too "gamer" for a given placement |

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

---

## Logo

Two lockups ship today, both in `src/workout-tracker-native/assets/`:

- **`Arete_name.png`** — full wordmark: a barbell forms the "A," followed
  by "reté" in a bold, rounded geometric sans with the macron over the e.
  Rendered **white**, for dark surfaces (homepage header on `#0D0D0D`,
  splash screen on `#141416`). There is currently no dark-on-light variant
  of the wordmark — on a light surface, use the icon mark instead or place
  the wordmark on a dark chip.
- **`Arete_icon.png`** — icon mark only: the barbell-A monogram, no
  wordmark text. Rendered as a glossy black mark on a light ground. This is
  the app icon / adaptive-icon foreground / notification icon source.
- **`Arete_splash.png`** — the wordmark centered on the app's dark launch
  background (`#141416`), used as the Expo splash screen image.

**Construction:** the "A" crossbar is a literal barbell (weight plates as
the crossbar ends) — the monogram *is* the equipment, not a barbell icon
placed next to a letter. Keep that construction intact if the mark is ever
redrawn or resized; don't substitute a generic dumbbell glyph.

**Wordmark typeface:** a bold/black-weight rounded geometric sans (visually
closest to **Poppins ExtraBold/Black** or **Montserrat Black** — rounded
terminals on the "r," "e," "t"). This is baked into the PNG, not a live app
font — if the wordmark needs to be reset in text at some point, Poppins
Black is the closest safe substitute available on Google Fonts.

**Minimum clear space / don't-do's** aren't formally defined yet — no
documented minimum size, safe area, or "don't stretch/recolor/rotate" rules
exist in the codebase today. Worth establishing before the mark appears
outside the app and homepage (App Store assets, social, merch).

---

## Color

### Brand accent

The app doesn't have one fixed "brand color" in the traditional sense —
users pick their own accent from 9 presets, and the whole UI re-themes
around it. For anything *outside* the app where one fixed color is needed
(marketing site, App Store graphics, social), **Green is the canonical
default** — it's what the homepage CTA button and section labels already
use.

| Preset | Hex | Text-on-fill |
|---|---|---|
| **Green (default)** | `#30D158` | `#000000` |
| Blue | `#007AFF` | `#FFFFFF` |
| Purple | `#BF5AF2` | `#FFFFFF` |
| Orange | `#FF9F0A` | `#000000` |
| Red | `#FF453A` | `#FFFFFF` |
| Pink | `#FF375F` | `#FFFFFF` |
| Teal | `#5AC8FA` | `#000000` |
| Yellow | `#FFD60A` | `#000000` |
| Indigo | `#5E5CE6` | `#FFFFFF` |

### Gold — achievement signal

Two distinct golds, used for two distinct things. Don't conflate them:

| Token | Hex | Use |
|---|---|---|
| `PR_GOLD` | `#f9de73` | Personal-record indicators — trophies, laurel borders, PR banners |
| `PR_GOLD_TEXT` | `#ad9206` | Dark text/laurel color on gold or surface backgrounds |
| `PR_GOLD_BG` | `#FFF3C4` | Cream background for PR banners |
| **Aretē rank gold** | `#FFD700` | The single highest Greek Rank ("Aretē" itself) — brighter, more saturated than PR gold, deliberately reserved for the pinnacle rank so it reads as rarer |

> Note: `CLAUDE.md` currently documents `PR_GOLD` as `#FFE066` /
> `PR_GOLD_TEXT` as `#7A5800` — that's stale against
> `constants/prColors.ts`, which is the real source of truth and what's
> reflected here. Worth a follow-up fix to `CLAUDE.md` itself.

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

Two separate type systems, deliberately: a **display face for the logo
only**, and **the OS system font for everything else**. There is no custom
webfont/app font loaded anywhere in the codebase — this is a real choice
already in place, not a gap.

- **Wordmark / display** — bold rounded geometric sans (see Logo section
  above). Logo-only; never used for running UI text.
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

- **Marketing site** (`legal_routes.py` homepage) — system-ui stack:
  `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif`.

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
