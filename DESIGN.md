---
version: alpha
name: Aretē
description: >-
  Design system for Aretē: Strength & Cardio Log, an iOS/Android workout tracker
  (React Native) and its marketing site at aretefitnessapp.com. Dark-first,
  Apple-native neutrals, one user-chosen accent, and gold reserved for achievement.
  The code is the source of truth: src/workout-tracker-native/context/ThemeContext.tsx,
  theme/spacing.ts, theme/typography.ts, constants/prColors.ts, constants/greekRanks.ts,
  constants/strengthRanks.ts, constants/shareCardTheme.ts. BRAND.md holds voice, logo
  and copy rules. App values are React Native points, written here as px (1px = 1pt).

colors:
  # Brand accent. Users pick one of 8 presets in the app; Green is the default and
  # the only accent used outside the app (website, App Store art, share cards).
  primary: "#30D158"            # Green, dark mode and all marketing
  on-primary: "#000000"
  primary-light-mode: "#1C7F35" # Green, light mode (the bright value is unreadable on white)
  on-primary-light-mode: "#FFFFFF"

  # Dark theme (DARK_BASE)
  dark-background: "#141416"
  dark-surface: "#1C1C1E"
  dark-border: "#38383A"
  dark-input-border: "#6E6E73"
  dark-text-primary: "#FFFFFF"
  dark-text-secondary: "#8E8E93"
  dark-placeholder: "#636366"
  dark-danger: "#FF453A"
  dark-on-danger: "#000000"
  dark-warmup: "#FF9500"
  dark-dropset: "#BF7FF0"

  # Light theme (LIGHT_BASE)
  light-background: "#F2F2F7"
  light-surface: "#FFFFFF"
  light-border: "#E5E5EA"
  light-input-border: "#8E8E93"
  light-text-primary: "#000000"
  light-text-secondary: "#6C6C70"
  light-placeholder: "#AEAEB2"
  light-danger: "#D70015"
  light-on-danger: "#FFFFFF"
  light-warmup: "#B25000"
  light-dropset: "#9A3FC7"

  # Fixed-dark surfaces: website and share cards
  ink: "#0D0D0D"
  ink-surface: "#1C1C1E"
  ink-divider: "#2C2C2E"
  ink-text: "#FFFFFF"
  ink-text-muted: "#8E8E93"
  ink-text-footer: "#636366"

  # PR gold: personal records only
  pr-gold: "#F9DE73"            # PR_GOLD: dark surfaces (dark theme, share cards, site)
  pr-gold-on-light: "#8A6D00"   # colors.prGold in light mode, text and icons
  pr-gold-border-on-light: "#B8941F" # colors.prGoldBorder in light mode
  pr-gold-bg: "#FFF3C4"         # PR_GOLD_BG, cream banner fill
  pr-gold-text: "#7A6000"       # PR_GOLD_TEXT, only on pr-gold-bg

  # Top-tier gold: the Aretē Greek Rank and the Legend score tier. Not PR gold.
  rank-gold: "#FFD700"

  # Greek Rank (badge and bar colors; text uses the per-mode variants in greekRanks.ts)
  rank-neophyte: "#888888"
  rank-athlete: "#4A9EFF"
  rank-hero: "#4CAF50"
  rank-demigod: "#FF9800"
  rank-olympian: "#9C27B0"
  rank-titan: "#E53935"

  # Strength / Endurance Score tiers (SCORE_RANK_COLORS; Legend is rank-gold)
  tier-novice: "#9CA3AF"
  tier-beginner: "#38BDF8"
  tier-intermediate: "#34D399"
  tier-advanced: "#FB923C"
  tier-elite: "#C084FC"

typography:
  # App: the OS font (SF Pro on iOS, Roboto on Android). typography.ts sets no fontFamily.
  display-number:
    fontFamily: system-ui
    fontSize: 28px
    fontWeight: 700
  title:
    fontFamily: system-ui
    fontSize: 30px
    fontWeight: 700
  stat-value:
    fontFamily: system-ui
    fontSize: 22px
    fontWeight: 700
  headline-md:
    fontFamily: system-ui
    fontSize: 20px
    fontWeight: 700
  body-lg:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
  body-md:
    fontFamily: system-ui
    fontSize: 15px
    fontWeight: 400
  body-sm:
    fontFamily: system-ui
    fontSize: 14px
    fontWeight: 400
  label-sm:
    fontFamily: system-ui
    fontSize: 11px
    fontWeight: 600
  button:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 600
  # Marketing: Archivo (website, App Store art, social). Never inside the app.
  marketing-headline:
    fontFamily: "'Archivo Black', 'Arial Black', sans-serif"
    fontSize: 56px
    fontWeight: 400
    letterSpacing: -0.01em
    lineHeight: 1.05
  marketing-subhead:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif"
    fontSize: 22px
    fontWeight: 700
  marketing-eyebrow:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif"
    fontSize: 13px
    fontWeight: 600
    letterSpacing: 0.08em
    fontVariation: "'wdth' 112"
  marketing-slogan:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif"
    fontSize: 19px
    fontWeight: 600
    letterSpacing: 0.22em
    fontVariation: "'wdth' 112"
  marketing-stat:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif"
    fontSize: 48px
    fontWeight: 800
    fontVariation: "'wdth' 75"
  marketing-body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif"
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.55

rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 52px
  button-primary-light-mode:
    backgroundColor: "{colors.primary-light-mode}"
    textColor: "{colors.on-primary-light-mode}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 52px
  button-destructive:
    backgroundColor: "{colors.dark-danger}"
    textColor: "{colors.dark-on-danger}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
  button-destructive-light-mode:
    backgroundColor: "{colors.light-danger}"
    textColor: "{colors.light-on-danger}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text-primary}"
    rounded: "{rounded.md}"
    padding: 16px
  card-light-mode:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text-primary}"
    rounded: "{rounded.md}"
    padding: 16px
  card-caption:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text-secondary}"
    typography: "{typography.body-sm}"
  card-caption-light-mode:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text-secondary}"
    typography: "{typography.body-sm}"
  screen:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-text-primary}"
    padding: 16px
  screen-light-mode:
    backgroundColor: "{colors.light-background}"
    textColor: "{colors.light-text-primary}"
    padding: 16px
  input:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text-primary}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 44px
  input-light-mode:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text-primary}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 44px
  set-tag-warmup:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-warmup}"
    typography: "{typography.label-sm}"
  set-tag-warmup-light-mode:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-warmup}"
    typography: "{typography.label-sm}"
  set-tag-dropset:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-dropset}"
    typography: "{typography.label-sm}"
  set-tag-dropset-light-mode:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-dropset}"
    typography: "{typography.label-sm}"
  pr-banner:
    backgroundColor: "{colors.pr-gold-bg}"
    textColor: "{colors.pr-gold-text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 12px
  pr-text:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.pr-gold}"
  pr-text-light-mode:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.pr-gold-on-light}"
  share-card:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.xl}"
    width: 360px
  share-card-stats:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.ink-text-muted}"
  share-card-banner:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.pr-gold}"
  share-card-footer:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-text-footer}"
  site-page:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-text}"
    typography: "{typography.marketing-body}"
  site-cta:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: 16px
  site-eyebrow:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.primary}"
    typography: "{typography.marketing-eyebrow}"
  site-slogan:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-text-muted}"
    typography: "{typography.marketing-slogan}"
  site-headline:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-text}"
    typography: "{typography.marketing-headline}"
  site-subhead:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink-text}"
    typography: "{typography.marketing-subhead}"
  site-stat:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.primary}"
    typography: "{typography.marketing-stat}"
  site-divider:
    backgroundColor: "{colors.ink-divider}"
    textColor: "{colors.ink-text}"
  # Rank colors fill rings, bars and badge outlines. The rank letter and name are
  # drawn on a normal surface in rankTextColor(name, color, mode), never on the fill.
  rank-ring-arete:
    backgroundColor: "{colors.rank-gold}"
  rank-ring-titan:
    backgroundColor: "{colors.rank-titan}"
  rank-ring-olympian:
    backgroundColor: "{colors.rank-olympian}"
  rank-ring-demigod:
    backgroundColor: "{colors.rank-demigod}"
  rank-ring-hero:
    backgroundColor: "{colors.rank-hero}"
  rank-ring-athlete:
    backgroundColor: "{colors.rank-athlete}"
  rank-ring-neophyte:
    backgroundColor: "{colors.rank-neophyte}"
  tier-chip-novice:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.tier-novice}"
  tier-chip-beginner:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.tier-beginner}"
  tier-chip-intermediate:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.tier-intermediate}"
  tier-chip-advanced:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.tier-advanced}"
  tier-chip-elite:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.tier-elite}"
  placeholder-text:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-placeholder}"
  placeholder-text-light-mode:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-placeholder}"
  hairline:
    backgroundColor: "{colors.dark-border}"
    textColor: "{colors.dark-text-primary}"
  hairline-light-mode:
    backgroundColor: "{colors.light-border}"
    textColor: "{colors.light-text-primary}"
  field-edge:
    backgroundColor: "{colors.dark-input-border}"
    textColor: "{colors.dark-text-primary}"
  field-edge-light-mode:
    backgroundColor: "{colors.light-input-border}"
    textColor: "{colors.light-text-primary}"
  pr-laurel-light-mode:
    backgroundColor: "{colors.pr-gold-border-on-light}"
    textColor: "{colors.light-text-primary}"
---

# Aretē Design System

## Overview

Aretē is Greek for excellence earned through effort, and the interface should feel like a well-kept training log: calm, dense with real numbers, and quietly proud when something is earned. It is a tool used mid-workout with sweaty hands and a rest timer running, so clarity and big touch targets beat decoration.

- **Dark-first, Apple-native.** Neutrals follow iOS system grays. The app follows the phone's light or dark setting (or a user override), and every screen must work in both. The website and share cards are always dark.
- **One accent, chosen by the user.** Eight presets (Green, Blue, Purple, Orange, Red, Pink, Teal, Indigo) re-theme the whole app. Green is the default and the only accent used outside the app. Never hardcode an accent: in code it is `colors.accent`.
- **Gold means achievement, and nothing else.** PR gold marks personal records; rank gold marks the top tier of a ladder. Neither is ever decoration, a button, or an accent.
- **Numbers are the hero.** Weights, reps, scores and PRs carry the emotion. Celebrate with the number, not with exclamation marks, emoji or confetti everywhere.
- **Greek progression is the brand's spine.** Neophyte → Athlete → Hero → Demigod → Olympian → Titan → Aretē. Greek names are for ranks only; features keep plain names ("Coach", not "Oracle").

Voice, naming, logo and copy rules live in `BRAND.md`. This file covers the visual system.

## Colors

The palette is high-contrast neutrals, one accent, and two reserved golds.

- **Accent (`primary`, #30D158 dark / #1C7F35 light).** The single most important action on a screen, selected states, progress fills. Text on the dark-mode accent is black; on the light-mode accent it's white. All 8 presets follow the same pattern (see `ACCENT_PRESETS`). Marketing always uses #30D158 on #0D0D0D; never put bright green text on a light background.
- **Neutrals.** Dark: background #141416, surface #1C1C1E, border #38383A, text #FFFFFF / #8E8E93. Light: background #F2F2F7, surface #FFFFFF, border #E5E5EA, text #000000 / #6C6C70. Text-field edges and switch tracks use the stronger `input-border` gray because the hairline border is too faint to find a field by (3:1 minimum).
- **Semantic.** Danger, warm-up and drop-set each have a darker light-mode value so they read as text on white (4.5:1). Set-type tags are text, so they use these colors as text, not fills.
- **PR gold.** `pr-gold` #F9DE73 on dark surfaces. On light surfaces it is 1.3:1, so light mode uses `pr-gold-on-light` #8A6D00 for text and icons and `pr-gold-border-on-light` #B8941F for borders and laurels. In code, always `colors.prGold` / `colors.prGoldBorder` on themed surfaces; the raw `PR_GOLD` constant only on surfaces that are dark in both themes (share cards). The cream banner is `pr-gold-bg` #FFF3C4 with `pr-gold-text` #7A6000, which is only for that cream.
- **Rank gold #FFD700.** Only the Aretē Greek Rank and the Legend score tier. Never for PRs.
- **Rank and tier colors.** The listed values are badge, ring and bar colors. As text they fail contrast on one side or the other, so rank names use `rankTextColor()` and tier names `scoreRankTextColor()`, which pick a per-mode text color. The Strength Score and Endurance Score share one tier ladder and its colors; they never use Greek Rank colors.
- **Fixed-dark (`ink`).** The website (#0D0D0D body) and share cards use their own dark palette, identical in either theme. The in-app dark background is the slightly lighter #141416; don't mix the two blacks on one surface.
- **Hardcoded colors.** In app code everything is a theme token. The only approved literals are white text on a solid colored fill and the modal backdrop `rgba(0,0,0,0.6)`.

## Typography

Two systems that never mix.

- **App: the OS font.** SF Pro on iOS, Roboto on Android; the app loads no custom font, so it respects Dynamic Type and feels native. Scale (`typography.fontSize`): 11 micro labels and badges · 14 secondary text · 16 primary body · 20 screen titles · 22 stat values · 28 display numbers. Also `title` 30, `body` 15, `button` 16/600. Bold for titles and numbers, regular for body; avoid a third weight on one screen.
- **Marketing: Archivo.** Headlines in Archivo Black (sentence case, -0.01em). Subheads Archivo Bold. Eyebrows, small labels and the slogan in Archivo SemiBold at 112% width, uppercase, 0.08em tracking (0.22em for the slogan). Big stat numbers in Archivo ExtraBold at 75% width. Body in the system stack. Load: `https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wdth,wght@62..125,600..800&display=swap`.
- **Never** set paragraphs or buttons in Archivo Black, add a second display face, or use round geometric fonts (Poppins, Montserrat) next to Archivo's squared shapes.
- **Numbers.** Weights read "225 lbs" (lowercase unit, with a space). Sets are written reps before weight. PR dates are mm/dd/yyyy. These are deliberate; don't reformat them.

## Layout

- **Spacing scale:** 4 · 8 · 16 · 24 · 32 (`spacing.xs` to `spacing.xl`). Screen gutters are 16. Cards pad 16; items inside a card are 8 apart; sections are 24 apart.
- **Touch targets:** at least 44×44. Set rows, steppers and checkboxes are used mid-set and one-handed; extend small icons with `hitSlop` rather than shrinking the target.
- **Density.** Data screens (workout log, history, PRs, progress) are dense lists of cards and rows. Moments (workout summary, rank up, onboarding) get air and one hero number.
- **Lists.** Long lists are virtualized (`FlatList`). Headers containing charts or forms are passed as a built element, not a bare render function.
- **Phones first.** The app is phone-only. The website is mobile-first and must not scroll horizontally at 390px.

## Elevation & Depth

The app is flat. Depth comes from surface color and hairlines, not shadows.

- **Layers:** background → surface (cards) → borders (1px hairline in `border`). In dark mode the surface is lighter than the background; in light mode the surface is white on a gray background.
- **Shadows mean "floating".** Only things above the page get a shadow: a row lifted while dragging, toasts, the undo bar, sheets and modals. A card in a list never has one.
- **Modals** sit on a `rgba(0,0,0,0.6)` backdrop.
- **Glows** are reserved for achievement: the PR laurel glow and the soft radial glow behind the wordmark on the splash screen.

## Shapes

- **Radius scale:** 8 chips and small cards, inputs · 12 cards and modals · 16 large containers · 20 share cards · full for pills and circles (`radius` in `theme/spacing.ts`). Some older code uses raw radii (14, 20, 4); new code uses the scale.
- **Keep corners consistent within a view.** Don't mix sharp and rounded cards on one screen.
- **Website:** cards 14 to 18, CTA buttons fully rounded pills.
- **Motifs:** the laurel branch (`components/LaurelWreath.tsx`, hand-drawn SVG, gold) flanks PRs and rank achievements; the trophy (Ionicons) is the secondary PR marker. The barbell-A monogram is the logo; never substitute a dumbbell.

## Components

- **Buttons.** One primary (accent fill) per screen, Title Case labels, 16/600. Secondary actions are plain accent-colored text or outlined. Destructive actions use `danger` with its own text color (`dangerText`), because some accents' text colors fail on red.
- **Cards.** Surface fill, 12 radius, 16 padding, hairline border where cards sit on the same color. No shadow.
- **Inputs.** Surface fill with the stronger `input-border` edge, 8 radius, 44 minimum height, placeholder in `placeholder`. Numeric fields (weight, reps) open the number pad.
- **Set rows.** Reps before weight. Set-type tags (W warm-up, D drop, F failure) are colored text, not filled chips.
- **PR banner.** Cream `pr-gold-bg` with `pr-gold-text`, laurel branches on either side, copy like "New PR: Max Weight". Only for a real PR or rank up, never an ordinary workout.
- **Rank badges and tier chips.** Always paired with a letter or icon (Greek Rank: N, A, H, D, O, T, Ā; score tiers: outline shapes up to a filled star), so color never identifies a tier by itself.
- **Score screens.** Strength and Endurance share `ScoreRing` and `PercentileBar`; presentation changes go there, in tier colors.
- **Share cards.** 360 wide, #0D0D0D, 20 radius, a 5px accent bar across the top, white wordmark top left, one hero number in the accent (42/800), a stats row on #1C1C1E with #2C2C2E dividers, footer "aretefitnessapp.com" in #636366. Always the bright dark-mode accent. Gold banner only for PRs and rank ups.
- **Website.** #0D0D0D page, Archivo headlines, green uppercase eyebrows, a pill-shaped green CTA with black text, product screenshots with realistic data (never an empty state), no stock fitness photography.
- **Motion.** Purposeful and quick. Entrances ease out (never ease in); most UI motion lands within 300ms. Decorative motion respects Reduce Motion: `Animated` goes through `motionTiming`/`motionSpring` in `utils/motion.ts`, `LayoutAnimation` through `utils/layoutAnimation.ts`, and Reanimated code must check Reduce Motion itself. Gesture-driven or interruptible motion uses Reanimated + Gesture Handler. Haptics land on the same frame as the visual event (light impact on a snap or a set check, success notification on a PR).

## Do's and Don'ts

- Do use theme tokens (`colors.*`, `spacing`, `typography`, `radius`) for every value in app code.
- Do test every screen in light and dark mode and with at least two accents (Green and Indigo, the weakest in dark mode).
- Do keep 4.5:1 contrast for text and 3:1 for icons, borders and field edges.
- Do give each screen one primary action and one hero number at most.
- Do use real numbers in celebrations: "Your bench press is up 10 lbs."
- Don't use gold (PR or rank) for anything that isn't an achievement, and don't confuse the two golds.
- Don't hardcode hex colors in app code beyond white-on-fill text and the modal backdrop.
- Don't add shadows to cards in a list, gradients to the logo, or a second display typeface.
- Don't use emoji, exclamation marks or em dashes in user-facing copy. Title Case for buttons, titles and alert titles; sentence case with a period for messages.
- Don't place the wordmark on an accent fill or on a photo without a 60% dark overlay.
- Don't animate things users see dozens of times a session (logging a set, typing a weight) beyond instant feedback.
