# Changelog

## 1.1.2 (2026-08-05)

### New: Share Your Strength Score
- Share your current Strength Score and rank as an image, right from the Strength Score screen.
- Ranking up now comes with its own shareable "Rank Up!" card.

### Improved: Performance
- Workout logging feels smoother — typing in a set no longer redraws every other exercise in the workout.
- Dashboard, Exercises, and related screens load faster by showing your cached data instantly while refreshing in the background.

### Bug Fixes
- Fixed workout volume being undercounted for bodyweight and weighted-bodyweight exercises (Pull-ups, Dips, etc.) — past workouts have been recalculated.
- Fixed a potential error when scheduling rest-timer or workout reminders with notifications disabled.

## 1.1.1 (2026-07-31)

### Redesigned: Exercise Details
- The inline Strength Score card is now colored by your rank and shows your percentile in a circle — tap it to see the same lift breakdown as the Strength Score screen, without leaving the page.
- Swipe left/right between Overview, Charts, and History instead of only tapping the tabs.
- Muscle Breakdown diagram is bigger and moved above the Primary/Secondary labels, with primary and secondary muscles shown in different shades and matching color swatches next to each label.
- Stats are now split into Lifetime Stats (Workouts, Total Sets, Total Reps) and Personal Records, instead of one mixed grid.
- 161 exercises — Bench Press, Squat, Deadlift, Pull Up, and more — now have real, hand-written "How to perform" instructions instead of generic muscle-group text.
- Added Chin Up to the exercise library.

### Improved: Progress Tab
- Progress is now the tab you land on when opening the Training tab.
- The "working sets" info icon now opens a full explanation of MEV/MAV/MRV volume zones with a per-muscle-group reference table, instead of a plain alert.
- Fixed weekly set counts sometimes displaying with the decimal (".5") wrapped onto its own line.

### New: Onboarding
- Added a Welcome screen at the start of the tutorial with the Aretē logo, pronunciation guide, and tagline, plus Start Tutorial / Skip options.
- New units and personal info steps during onboarding (height/weight units, optional age/gender/bodyweight).

### Bug Fixes
- Fixed Privacy Policy and Terms of Service pages returning a 404.
- Default distance unit is now miles app-wide, with a full audit of distance-unit handling across GPS runs, calorie estimates, and history.
- Fixed cardio calorie estimates using the wrong distance unit.
- Fixed personal records sometimes showing duplicated entries.
- Fixed "Running" not appearing when searching the exercise list.
- Fixed cardio personal record taps leading to a 404.
- Fixed a mismatch between live and saved GPS pace on runs.
- Added a "View History" option to the 3-dot menu on run workout details.
- Fixed Weekly Summary showing cardio personal records in the wrong distance unit.
- Settings now shows the correct app version instead of a stale hardcoded one.

## 1.1.0 (2026-07-27)

### New: Weekly Summary
- A new recap screen for your most recently completed week — workouts, volume, reps, training time, muscle balance (with a pie chart), and personal records, with a "Past Weeks" calendar to browse earlier weeks.
- Shows your weekly streak, progress toward your weekly workout goal, a 4-week rolling average, most-trained muscle group, average RPE, and estimated calories burned.
- Most Improved Lift and Most Improved Cardio callouts — only surfaces a lift/activity when you've hit a genuine new all-time best that week, not just a better-than-average week.
- Share your week — a shareable recap card for social/messages, including your most-improved lift.
- Tap any Personal Record to jump straight to that exercise's full stats and history.

### Redesigned: Strength Score
- Smoothed age-adjustment curve and new entrance animations.
- The score card is now collapsible — opens showing just your score and rank, tap to reveal your strongest/weakest relative lifts, age adjustment, and bodyweight freshness.
- New "More Lifts" page showing exactly which supplemental lifts are tracked vs. not yet logged, grouped by compound/isolation, with your logged 1-rep max shown where available.
- "Score Over Time" now has a 1M/3M/6M/All date range picker and always includes today's score.

### Bug Fixes
- Fixed swipe-to-delete sometimes leaving the wrong set row open.
- Fixed a sign-out bug and a bug when swiping to discard a workout.
- Exercise GIFs now display correctly in the app; added search to the GIF picker and fixed logo casing.

## 1.0.2

- (see git history prior to this file's creation)

## 1.0.1

- (see git history prior to this file's creation)
