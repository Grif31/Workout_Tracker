# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

A broad mix of lifters, from people building the habit to experienced lifters who log every set; no single experience level is primary. Most train strength, and some also run or ride. The core scene is mid-workout in a gym: phone in one hand, often sweaty, a rest timer running, logging a set in the seconds between sets. Away from the gym they review progress, check their rank and scores, and plan the next workouts.

## Product Purpose

Aretē: Strength & Cardio Log (short name Aretē) is a workout tracker for strength and cardio. Users log workouts set by set (or by GPS for runs and rides), keep personal records, follow routines, and see where they stand and how they are progressing. The name is Greek for excellence earned through effort; the slogan is "Pursue Excellence". Success is a user who keeps logging for months because the app makes their progress visible and worth pursuing.

## Positioning

Three things together set Aretē apart from other loggers (Strong, Hevy and similar), and design work should protect all three:

- **Greek Rank progression:** one earned rank, Neophyte → Athlete → Hero → Demigod → Olympian → Titan → Aretē, built from consistency, strength, volume and dedication. It turns training into a long ascent.
- **Strength and Endurance Scores:** percentiles against real standards for the user's bodyweight, sex and age, per lift and overall (strength) and for running distances (endurance), with six tiers from Novice to Legend.
- **An AI Coach on the user's own data:** insights, templates and full routines generated from their whole training history, goals, equipment and schedule.

Fast, reliable logging is the baseline every screen must respect, not the differentiator.

## Operating Context

- Logging happens one-handed between sets, with glances lasting seconds; it must survive interruptions (minimizing a workout to a bottom bar, the app being backgrounded or killed, offline gyms with an offline save queue).
- One session at a time: a lifting workout or a GPS run, never both.
- The rest timer, Live Activities, widgets and notifications extend the workout outside the app.
- Review happens later: Home (this week, active routine), Progress (scores, trends, muscle volume, exercise library), Coach (plans and AI), Profile (Greek Rank, PRs, history).
- Results are shared outside the app as image share cards (PRs, workouts, weekly summary, scores, cardio).

## Capabilities and Constraints

- React Native (Expo) app, live on the iOS App Store; built for Android too, but the Play Store launch has not happened. Backend: Flask on Railway. Marketing site and legal pages at aretefitnessapp.com.
- Free core logging; Premium (iOS in-app purchase) unlocks the AI Coach generation features and extra customization.
- Users choose light, dark or system appearance and one of eight accent colors; every screen must work in both appearances and with every accent.
- Exercise types: strength (reps × weight), cardio (duration, distance, pace) and timed holds. Set types: normal, warm-up, drop, failure; optional RPE.
- Weights display in the user's unit (lbs or kg). Sets read reps before weight and PR dates read mm/dd/yyyy; both are deliberate.
- Terminology and copy rules are fixed in `BRAND.md` (word list: workout, PR, Greek Rank, Strength Score, Endurance Score, routine, template, bodyweight).

## Brand Commitments

- Name and identity rules, voice, logo, slogan and copy rules: `BRAND.md`. Visual system: `DESIGN.md`.
- Voice: confident, not hype; specific numbers over enthusiasm; second person. No emoji, exclamation marks or em dashes in user-facing copy.
- Gold is reserved for achievement (PR gold for personal records, rank gold for the top tier).
- Greek vocabulary is for ranks only; features keep plain names ("Coach").

## Evidence on Hand

- Live App Store listing (id6744030558) and real app screenshots in `src/brand/shots/` used on the homepage.
- A seeded demo account on production (12 weeks of training) for realistic screenshots and App Review.
- No testimonials, reviews, user counts, press or benchmark claims exist yet. Do not invent any.

## Product Principles

1. **Logging never waits.** Anything on the workout screen must be fast, one-handed and interruption-proof; delight never slows a set.
2. **Show where they stand, with real numbers.** Scores, ranks and PRs are concrete and earned, never vague praise.
3. **Achievement is rare and marked.** Gold, laurels and celebration appear only for real PRs and rank ups, so they keep their meaning.
4. **The Coach works from the user's data.** Advice cites the user's own numbers and stays within their goals, equipment and constraints.
5. **Native and calm.** Feel like a well-made iOS app: system font, familiar patterns, quiet surfaces, with the brand in the details.

## Accessibility & Inclusion

Target: qualify for the App Store Accessibility Nutrition Labels (TODO.md §26), including VoiceOver, Larger Text, Sufficient Contrast and Reduced Motion. Text meets 4.5:1 contrast and icons and field edges 3:1, in both appearances and every accent. Decorative motion stops under Reduce Motion. Rank and tier colors are always paired with a letter or icon.
