# Changelog

## 1.1.8 (Unreleased)

### New: Best Efforts
- Activities you track with GPS now find your fastest 400m, 800m, 1K, mile, 5K and longer distances inside the activity, plus the farthest you went in 10, 20, 30 and 60 minutes. They show on the activity's details screen.
- Your personal records use these real times, and so does your Endurance Score for runs. A fast mile in the middle of a longer run now counts as a mile PR. Before, every distance was worked out from the whole run's average pace, which undercounted interval sessions.
- Time spent paused doesn't count toward a best effort.
- If you edit a tracked activity's distance or time by hand, its best efforts are removed, since they came from the GPS recording you corrected.
- Best efforts apply to activities tracked from this update on. Earlier ones don't have the timing data needed.

### New: Cardio This Week
- If you log cardio, Home shows your distance, time and number of activities since Monday. Distance follows your GPS distance setting, in miles or kilometers.
- Cardio logged as time without distance, like a bike or rower session, shows your total time instead.

### Improved: Measurements
- Measurements now show their unit: inches if you use lbs, centimeters if you use kg. Switching units converts your measurements along with your weights.
- Each measurement shows how much it has changed since your last entry and since your first.
- Tap any bodyweight or measurement entry to edit it, and pick a date to log an entry for an earlier day.
- Bodyweight shows your 7-day average on the Current card and as a line on the chart.
- Add a note when you upload a progress photo, and use Compare to see two photos side by side, with the days between them.
- The measurement form fits above the keyboard, and tapping outside a field or the arrow next to the title closes the keyboard.

### Improved: Profile
- If you log cardio, your Profile shows your total activities and distance, or total time for cardio logged without distance.

### Improved: Streak
- The streak sits at the top of Home, centered above your greeting, with a new flame that dims when your streak is at zero.
- The streak number shows straight away instead of counting up each time Home opens.

### Bug Fixes
- The keyboard no longer gets stuck open when logging bodyweight or measurements, and fields no longer hide behind it.
- Replacing an exercise during a workout no longer leaves the workout unresponsive until the app is restarted.
- Starting a workout from a template or routine now gives the same workout from Home, Coach, and the routine or template screen, with exercise demos and your programmed sets, reps and RPE every time.

## 1.1.7 (2026-09-17)

### New: Endurance Score
- Runners now get an Endurance Score, the running counterpart to the Strength Score. Your best pace at each distance is ranked against pace standards for your gender, with the same tiers and rank colors as the Strength Score.
- Every run also scores the shorter distances inside it, so a 5K gives you a mile time too. Endurance distances (5K and up) count for 70 percent of the score and speed distances (400m to 1 mile) for 30 percent, and whichever tier you have no times for drops out.
- Each distance shows your finish time and the time the next rank asks for. From 5K up your pace shows too, in min/mi or min/km to match your GPS distance setting.
- The score tracks over time on its own chart, and it can be shared the same way as the Strength Score.
- Tap a distance to see where your time ranks, how much faster the next rank is, and the time every rank takes at that distance.
- Find it on the Coach tab's Progress view, under your Strength Score, or from the Greek Rank screen.

### Changed: Greek Rank
- Everyone now gets a Greek Rank, even without gender or bodyweight in their profile. Your rank is earned by training: Consistency counts for 40%, Dedication for 30% and Volume for 30%.
- The top two ranks also ask for ability. Titan needs a Strength or Endurance Score at the 50th percentile or higher, and Aretē needs the 80th. Until you reach it you stay one rank below, and the Greek Rank screen shows what unlocks the next one.
- If you were Titan or Aretē without the score for it, your rank now shows one step lower.
- The breakdown shows your Strength and Endurance scores with the higher one highlighted, and a lock or check for each top rank. Both score screens are one tap away from it.
- The Volume part of your Greek Rank now measures how much training you do, not how many workouts you log. It counts your working sets plus cardio time, where 3 minutes of cardio counts as one set. Warm-up sets don't count, and a single workout counts for at most 40.
- A short session now counts for less than a full one. If your sessions are typically full length, your rank will barely change.

### Improved: Swipe to Delete
- Swiping a set to delete it now shows a trash icon that grows as you reach the point where letting go will delete, and the delete button sits flush against the set.

### Improved: Readability
- Accent colors are easier to read in both light and dark mode, with deeper shades in light mode.
- Share cards stay bright when the app is in light mode.

### Improved: Messages
- Error messages now say what went wrong, such as "Couldn't Save Routine", instead of just "Error".
- Losing your connection shows a single message instead of an extra alert.
- Notifications, celebrations and confirmations are clearer and point to your next step.

### Improved: Workout Details
- The summary now shows total reps, and volume as an exact figure instead of a rounded shorthand. Volume and duration sit on their own row above exercises, sets and reps.

### Improved: Strength Score
- Tap a lift to see the weight every rank takes, with your current rank highlighted.
- A one-rep max you actually lifted is now labeled as your 1RM instead of an estimate.
- On the Coach tab, the Strength Score circle is labeled as your Strength Score and shows your rank above the number.
- Score charts on the Strength and Endurance Score screens fit the screen instead of scrolling sideways, however long your history.
- The score card at the top of both score screens opens and closes smoothly.

### Improved: AI Coach
- Insights name what actually improved, with before and after numbers, drawing on your recent PRs for lifts, rep records, holds and cardio.
- The Coach points out your most-trained lifts that haven't had a PR in three weeks.
- Insights are checked against your own data before they're shown, so the Coach doesn't cite numbers you never logged.
- Generated workouts, routines and insights follow Aretē's voice.

### Improved: Offline Saves
- A workout or GPS activity saved without a connection now shows a clearer message that stays up longer.
- Home shows a card while workouts are waiting to upload, explaining why they're not in your history yet, with a Try Now button.
- Editing a workout while offline shows a banner, since edits need a connection to save.

### Bug Fixes
- The Greek Rank screen now opens centered on your current rank every time.
- A minimized workout's timer no longer counts time twice, and a paused timer stays paused.
- This week's stats, streaks, the Dashboard calendar and the weekly summary now roll over at your midnight. In the Americas they had been moving to the new week on Sunday afternoon or evening.
- Your Greek Rank no longer dips at the start of each week before your first workout.
- Exercises in a saved routine or AI plan keep the order you arranged them in.
- A workout saved offline while earlier ones were uploading is no longer lost.
- If a weight unit change fails to save, the setting switches back instead of showing the wrong unit.
- Deleting a bodyweight entry, measurement or progress photo now tells you when it fails.
- The Strength and Endurance Score screens now show how long ago your score was updated correctly in every timezone, instead of always "just now" or hours off, and a late-evening point on the score chart no longer lands on the next day.
- AI Coach now refers to your actual Greek Rank. It had been working one out from your Strength Score, which could name the wrong rank.
- Changing your weight unit in Settings no longer clears the gender on your profile. That was quietly hiding your Strength Score until you re-saved your profile.
- Paces that round up to a full minute now read correctly. A 4:59.7 pace showed as "4:60" on run details, the GPS tracker, exercise stats and share cards.
- The age-adjusted badge no longer appears when the credit is too small to show, where it read "+0%".
- Tapping a day in the Dashboard calendar now shows the same workout cards as Recent Workouts, with PR counts, exercise and rep counts, and the muscles worked.
- Workout volume now converts to kilograms when that is your unit, instead of showing the pound figure with a kg label.

### Security & Privacy
- Deleting your account now also deletes your progress photos, and the final confirmation says what gets deleted.
- Your custom exercises can no longer be seen by other users.
- Google sign-in is verified more strictly, and a deleted account can no longer stay signed in.

### Changed
- The first Strength Score tier is now called Novice instead of Noobie.
- The Yellow accent has been removed. If you were using it, your accent is now Green.
- Estimated 1RM is no longer offered as a PR pin on your profile. A pin that used it now shows as an empty slot you can refill.

## 1.1.6 (2026-09-11)

### New: Swipe to Delete Sets
- Swipe a set all the way to the left and let go to delete it. A shorter swipe still reveals the Delete button, and the button grows as you pull so you can see when letting go will delete.
- Adding or removing a set now animates, with the rows below sliding into place instead of jumping.

### Improved: Templates & Routines
- A new template is only created when you tap Save Template, so backing out no longer leaves an empty template behind. Right after saving, a prompt offers to log it.
- Pick several exercises at once when adding to a template or a routine day.
- Saving a template or routine now shows a brief confirmation that disappears on its own, with no alert to dismiss.
- New routines start with Day 1 already added.
- Adding or removing days and exercises in a routine animates smoothly.
- A template's Save button now sits at the bottom, under Add Exercise.

### Improved: Active Routine Card
- The Dashboard's routine card now shows the day you're due to train next, with a Log button right there. It tracks which days you've already done this week, resets to day 1 each new week, and picks the earliest day you haven't finished if you train out of order.
- The card header shows how many days are in the routine, and expanding it marks the days you've already completed this week.
- On the Coach tab, tapping the routine card now opens the routine itself instead of expanding a list.

### Improved: Workout History & PRs
- Workout history rows on your profile now read as plain text instead of bubbles.
- PR lists on the workout details and summary screens use the same gold outline as the rest of the app, and expand and collapse smoothly.

### Improved: Set Type Picker
- The picker is now a compact grid instead of a tall list, so it takes up far less of the screen.

### Bug Fixes
- Fixed workouts failing to save with an "internal server error" when a set's rep count contained a decimal point. The workout is no longer lost, and the reps field now only accepts whole numbers.
- Fixed expandable lists collapsing in a jerky way, where the contents lingered over a card that had already shrunk.

## 1.1.5 (2026-09-03)

### New: Endurance Score
- Running now counts toward your Greek Rank. Your best times on running exercises are scored against pace standards for each distance, and the rank's performance slot takes whichever is stronger — lifting or running — so a cardio-focused athlete has a real path to Aretē.
- Runners who haven't logged a weigh-in still get an Endurance Score and a Greek Rank; only the strength percentile waits on bodyweight.

### New: Set Type Picker
- Tapping a set's type badge now opens a labeled picker — Normal, Warm-up, Drop set, Failure — instead of silently cycling through the options.

### Redesigned: Coach Tab
- New hero header: your coach profile (goal, setup, injuries) shown at a glance, with the whole card tapping through to edit it.
- Your rank is now a pill that jumps straight to the Strength Score screen.

### Redesigned: PR Banner & Share Cards
- The "New PR!" banner has a cleaner gold-outline look, and the workout, PR, and score share cards now share a consistent frame.

### Improved
- Bodyweight-exercise volume now scales by movement — push-ups, sit-ups, pull-ups and the like each count a realistic fraction of your bodyweight toward volume instead of a flat figure.
- The "Home Barbell" equipment option in your coach profile is now labeled "Home Gym".

### Bug Fixes
- Fixed the exercise 3-dot menu sticking open and blocking taps on the rest of the card.
- The live-workout notification no longer clears a workout you'd pre-filled but not yet started.
- Fixed the muscle breakdown not showing when opening an exercise's history from the Workout Log.

## 1.1.4 (2026-08-28)

### New: Drag-to-Reorder Exercises
- Reorder exercises in a workout by dragging them into place — open Reorder Mode from the Exercises section header instead of tapping Move Up/Down repeatedly.

### New: Workout Summary Highlights
- Beat your all-time workout volume or rep total? The summary screen calls it out at the top instead of the generic "Great workout!"
- See a progress bar toward your next Greek Rank right on the workout summary.

### Improved: Strength Score
- Uses your actual logged one-rep max when you have one, instead of always defaulting to the formula-estimated value — a real, achieved single now takes priority over an estimate that can overshoot it.
- Tier colors and icons are now distinct from Greek Rank, so it's clear at a glance which ranking system a badge belongs to.
- Rank-up celebrations now match the color of the rank you just reached.
- Muscle group scores use the same weighting as your overall score.
- New "lbs to next rank" stat shows exactly how close you are to ranking up.
- Score history now backfills from your past PRs, so your progress chart isn't empty on day one.

### Redesigned: Dashboard & Active Routine
- The Active Routine card now looks the same on the Dashboard and Training tab, and expands with a smooth animation.
- Cleaner greeting header — a long name now moves to its own line instead of splitting awkwardly across two.

### Bug Fixes
- Fixed a crash during long GPS-tracked activities.
- Fixed the bottom tab bar flashing when opening GPS Track Activity.
- Fixed a duplicate workout being created when minimizing in the Training tab, then resuming and saving from the Dashboard.
- Warm-up sets now count toward Personal Records, matching the "New PR!" banner that already fired for them.
- Fixed the monthly streak showing 0 even when past months already met your goal.
- Fixed a chart value label wrapping onto two lines when tapping a bar on the Progress tab's 6-month/1-year view.
- Added a confirmation before deleting an exercise from a workout.
- Fixed the PR Progression date format and a truncated "Workout" column header.

## 1.1.3 (2026-08-24)

### New: PR Dashboard
- A dedicated Personal Records dashboard — tap the gold Personal Records box on your Profile to open it.
- See your recent PRs from the past week, a streak counter, PRs this month, and how much weight/reps you've added this week at a glance.
- "Time Since Last PR" surfaces exercises you haven't set a record in for a while, broken out by Weight, Reps, Time, and Distance.
- Pin your favorite lifts to see a live progress chart right on the dashboard — pin as many PR types per exercise as you like (e.g. both Max Weight and Rep Record for the same lift).
- Tap any PR to see its full history — a chart and table of every time you've beaten it, with a picker to switch between weights and metrics.
- Filter everything by Weight, Reps, Time, or Distance.
- Share any PR as an image.

### New: Prefill Previous Sets toggle
- New workout setting — when you add an exercise, it can pre-fill the sets with your reps/weight from last time. Toggle it off if you'd rather start blank.

### Improved: AI Coach
- Add notes for the AI Coach to consider when generating a routine or template.
- Insights now factor in your experience level and goals.

### Improved: Strength Score
- Cardio-only users (no tracked strength lifts yet) now get a valid Strength Score based on consistency and volume, instead of an error.

### Bug Fixes
- Fixed "New PR!" banners re-appearing for the same exercise when it's logged in more than one block of a workout (supersets).
- Fixed the map failing to load on Android during GPS cardio tracking.

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
