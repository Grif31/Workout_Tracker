# Workout Tracker — Project TODO

A living checklist for everything left to build, fix, and ship.
Check off items as you complete them.

---

## 🔧 1. Finish In-Progress Features
> These are half-done — the database columns or models exist but aren't wired up yet.

- [x] **Wire `exercise_template_id` into workout logging**
  - [x] Update `POST /api/workouts` to accept and save `exercise_template_id` per exercise
  - [x] Update `PUT/PATCH /api/workouts/<id>` to save `exercise_template_id` on edit
  - [x] Update WorkoutLog frontend component to send `exercise_template_id` when an exercise from the library is selected

- [x] **Wire `order` into exercises and sets when saving**
  - [x] Update `POST /api/workouts` to save `order` on each exercise and set
  - [x] Update `PUT/PATCH /api/workouts/<id>` to persist order on edit
  - [x] Update WorkoutLog frontend to send `order` index for each exercise and set

- [x] **Bodyweight Log — backend**
  - [x] Add `GET /api/bodyweight` — return all entries for current user (newest first)
  - [x] Add `POST /api/bodyweight` — log a new weight entry
  - [x] Add `DELETE /api/bodyweight/<id>` — remove an entry

- [x] **Bodyweight Log — frontend**
  - [x] Add bodyweight logging form to Profile screen (navigates to BodyweightScreen)
  - [x] Add bodyweight progress chart (react-native-gifted-charts LineChart)
  - [x] Auto-update `User.bodyweight` snapshot whenever a new entry is logged

- [x] **Personal Records — backend**
  - [x] On `POST /api/workouts`, after saving sets, compute and upsert PRs (`max_weight`, `estimated_1rm`, `max_reps`) for each exercise
  - [x] Add `GET /api/personal-records` — return all PRs for the current user
  - [x] Add `GET /api/personal-records/<exercise_template_id>` — PRs for one exercise

- [x] **Personal Records — frontend**
  - [x] Show "New PR! 🏆" alert after saving a workout when records are broken
  - [x] Display PRs on the Exercise Detail stats tab (future: swap computed stats for cached PersonalRecord table)

---

## 📊 2. Analytics & Progress Tracking
> Charts and stats to make the app genuinely useful for tracking progress.

- [x] **Dashboard charts**
  - [x] Weekly volume chart (total lbs lifted per week, line or bar)
  - [x] Workout frequency heatmap or bar chart (workouts per week)
  - [x] "Last 7 days" summary card (workouts completed, total volume, total sets)

- [x] **Exercise progress charts** (Exercise Detail screen — Stats tab)
  - [x] Estimated 1RM over time (line chart)
  - [x] Max weight over time (line chart)

- [x] **Bodyweight chart**
  - [x] Weight over time line chart on the bodyweight screen

- [x] **Apply lbs / kg unit preference throughout**
  - [x] `weight_unit` is stored on `User` and read from AuthContext
  - [x] Apply unit label in WorkoutLog column header
  - [x] Apply unit label in WorkoutDetails set display
  - [x] Apply conversion in ExerciseDetail stats, history, and charts
  - [x] Apply conversion in DashboardScreen volume pills and Progress tab

---

## 💪 3. In-Workout Experience
> Features that improve the actual workout logging flow.

- [x] **Workout timer**
  - [x] Auto-start elapsed timer when WorkoutLog opens
  - [x] Display formatted duration (e.g. "42 min") during logging
  - [x] Save duration automatically on submit

- [x] **Rest timer between sets**
  - [x] Tap a set row to start a countdown rest timer
  - [x] Configurable rest duration (default 90s)
  - [x] Vibrate / alert when rest is complete

- [x] **Set type support**
  - [x] Add set type selector per set: Normal / Warmup / Drop Set / To Failure
  - [x] Send `set_type` to backend (column added in future migration)
  - [x] Display set type labels in WorkoutDetails and ExerciseDetail history

- [x] **Drag-to-reorder exercises in workout log**
  - [x] Long-press an exercise name to enter drag mode and reorder exercises
  - [x] Update the `order` field on each exercise when the list is reordered
  - [x] Use `react-native-draggable-flatlist` (already compatible with the gesture handler setup)

- [x] **Drag-to-reorder exercises when creating a template or routine**
  - [x] Long-press an exercise row in `CreateRoutineScreen` to drag and reorder it
  - [x] Long-press an exercise row in `TemplateDetailScreen` to drag and reorder it
  - [x] Persist the updated order when saving the template / routine day

- [x] **Create workout template button missing**
  - [x] Add a "New Template" button to the Exercises screen so users can create a standalone template without going through a routine
  - [x] Navigates to a blank `TemplateDetailScreen` (or a dedicated create flow) with an empty exercise list


- [x] **Workout details visual polish**
  - [x] Add a summary bar showing total exercises, total sets, and total volume for the workout
  - [x] Render each exercise as a card (matching the workout log form style) instead of a plain text block
  - [x] Style each set row inside the card consistently with the log form (set number badge, reps, weight columns)

- [x] **Workout settings panel in log form**
  - [x] Add a settings/gear section at the top of the WorkoutLog form for session-level preferences
  - [x] Toggle: auto-start rest timer when a set is checked off
  - [x] Toggle: vibrate on rest timer complete (vs. silent)

- [x] **Cardio workout support**
  - [x] Add a "Cardio" exercise type to the workout log (alongside strength sets)
  - [x] Cardio entries track: activity (Run / Bike / Row / etc.), duration (minutes), distance, and optional intensity (pace or watts)
  - [x] Add `exercise_type` column (`strength` / `cardio`) to the Exercise model
  - [x] Update `POST /api/workouts` and `PUT/PATCH /api/workouts/<id>` to accept cardio entries
  - [x] Show cardio rows in WorkoutDetails and ExerciseDetail history (distance + duration instead of reps/weight)
  - [x] Add cardio stats to Exercise Detail screen (total distance, avg pace over time)

- [x] **GPS cardio tracking — complete setup**
  > `GPSCardioScreen.tsx` exists and the "Track Activity" button is wired on DashboardScreen, but the screen requires a custom dev build (`npx expo run:ios` / `npx expo run:android`). It does **not** work in Expo Go because `react-native-maps` and `expo-location` in background mode are unavailable there.
  - [x] Run `npx expo run:ios` / `npx expo run:android` to get GPS + maps working in development
  - [x] Verify live location tracking, pace display, and route polyline rendering on a real device
  - [x] Confirm the saved workout appears correctly in WorkoutDetails with distance, duration, and route map

---

## 👤 4. Profile & Settings
> Completing the profile and settings areas.

- [x] **Settings screen**
  - [x] Unit toggle: lbs ↔ kg
  - [x] Default rest timer duration
  - [x] Account section: change password link, logout button
  - [x] App version display

- [x] **Profile picture upload**
  - [x] Use `expo-image-picker` to select a photo
  - [x] Upload to backend (add `POST /api/me/avatar` endpoint or store base64)
  - [x] Display profile picture on ProfileScreen and DashboardScreen

- [x] **Profile stats summary**
  - [x] Total workouts, total volume lifted, longest streak on ProfileScreen

- [x] **Personal records tab on Profile**
  - [x] Add a "Records" section to ProfileScreen listing all-time bests per exercise
  - [x] Wire `GET /api/personal-records` (already exists) into the Profile screen UI

- [ ] **Social login — complete Google & Facebook setup**
  > Apple Sign-In works end-to-end. Google and Facebook buttons exist in `SocialAuthButtons.tsx` and the backend endpoint (`POST /api/auth/social`) is built, but Google/Facebook buttons currently show a "Coming Soon" alert because `EXPO_PUBLIC_GOOGLE_CLIENT_ID` and `EXPO_PUBLIC_FACEBOOK_APP_ID` are not configured.
  - [ ] Set up a Google OAuth client ID (Google Cloud Console) and add `EXPO_PUBLIC_GOOGLE_CLIENT_ID` to `.env`
  - [ ] Wire `@react-native-google-signin/google-signin` in the frontend to get the ID token and pass it to `/api/auth/social`
  - [ ] Set up a Facebook App ID and add `EXPO_PUBLIC_FACEBOOK_APP_ID` to `.env`
  - [ ] Wire the Facebook auth SDK in the frontend
  - [ ] Test full sign-in flow for each provider on a real iOS and Android device

---

## ⭐ Pre-Launch Features
> Features identified as important pre-launch gaps compared to top fitness apps (Strong, Hevy, Fitbod). Prioritised by impact.

### 1. Plate Calculator
> Pure-frontend utility — no backend changes needed.

- [x] **Utility function** (`utils/plateCalc.ts`)
  - [x] `plateCalc(targetWeight, barWeight, availablePlates[])` — returns array of `{ plate, count }` pairs sorted heaviest to lightest per side
  - [x] Default plate set: 45, 35, 25, 10, 5, 2.5 lb (or 20, 15, 10, 5, 2.5, 1.25 kg)
  - [x] Handle edge cases: weight below bar weight (show "just the bar"), remainder that can't be loaded exactly (show nearest loadable + note)
  - [x] Respect user's `weight_unit` preference throughout

- [x] **Trigger — weight input icon** (`components/workout/SetRow.tsx`)
  - [x] Show a small barbell icon button adjacent to the weight `TextInput` when the field has a non-empty value
  - [x] Icon only appears on strength sets (not cardio rows)
  - [x] Tapping the icon opens the plate calculator modal pre-filled with the current weight value
  - [x] Accept `onOpenPlateCalc(weight: string) => void` prop; pass current `set.weight`

- [x] **PlateCalculatorModal** (`components/PlateCalculatorModal.tsx`) — bottom sheet modal
  - [x] **Bar diagram** — visual representation of a loaded barbell:
    - Horizontal bar rod drawn across the full width
    - Plate rectangles rendered on each side, largest plates tallest and closest to center, decreasing outward
    - Each plate rectangle labelled with its weight
    - Use standard plate colours: 45=red, 35=yellow, 25=green, 10=white/grey, 5=blue, 2.5=black
  - [x] **Bar selector** — segmented toggle at the top: Standard (45 lb) · Short (35 lb) · EZ Bar (20 lb) · No Bar (0 lb)
    - Selecting a bar updates the diagram instantly
    - Persist last-used bar selection to AsyncStorage (`plate_calc_bar`)
  - [x] **Available plates toggle** — grid of plate chips below the diagram
    - Each chip shows the plate weight; tap to toggle on/off (greyed out = not available)
    - Calculator only uses toggled-on plates
    - Persist per-user plate availability to AsyncStorage (`plate_calc_plates`)
  - [x] **Text summary** — below the diagram: "2 × 45 · 1 × 25 · 1 × 5 per side" (or "Just the bar" / "Cannot be loaded exactly — nearest: X lb")
  - [x] Close button or tap-outside to dismiss

---

### 2. Apple Health / Google Fit Integration
> Writes workout sessions to the system health app after each save.

- [x] **iOS — HealthKit** (`utils/healthKit.ts`)
  - [x] Install `react-native-health` (compatible with EAS build)
  - [x] Request `HKWorkoutTypeIdentifier` write permission on first use
  - [x] On workout save: write a workout session (type: strength training or cardio, start/end time, estimated calories)
  - [x] Handle permission denied gracefully (no crash, no repeat prompt)

- [x] **Android — Health Connect** (`utils/healthConnect.ts`)
  - [x] Install `react-native-health-connect`
  - [x] Request exercise session write permission
  - [x] On workout save: write `ExerciseSession` record with start/end time and exercise type
  - [x] Handle permission denied gracefully

- [x] **Settings toggle** (`screens/ProfileTab/SettingsScreen.tsx`)
  - [x] Add "Sync to Apple Health" (iOS) / "Sync to Health Connect" (Android) toggle
  - [x] Persist preference to AsyncStorage (`health_sync_enabled`)
  - [x] Only write to health app when toggle is on

---

### 3. Per-Exercise Notes
> Users need to record cues, pain notes, or reminders per exercise — not just per workout.
> **Frontend is already built** — `ExerciseEntry.notes` exists in types, `ExerciseBlock` renders the inline `TextInput`, and `onUpdateNotes` is wired in WorkoutLog. Only the backend persistence is missing.

- [x] **Backend**
  - [x] Add `notes` (Text, nullable) column to `Exercise` model (`models.py`)
  - [x] Generate and apply migration
  - [x] Update `POST /api/workouts` to read and save `notes` from each exercise entry in the payload
  - [x] Update `PATCH /api/workouts/<id>` to persist exercise notes on edit
  - [x] Include `notes` in `GET /api/workouts/<id>` response per exercise (`Exercise.to_dict()`)

- [x] **Frontend — logging** (`components/workout/ExerciseBlock.tsx`)
  - [x] Notes icon in exercise 3-dot menu ("Add Notes") expands an inline `TextInput`
  - [x] `notes` field on `ExerciseEntry` type; `onUpdateNotes` wired through WorkoutLog → ExerciseBlock

- [x] **Frontend — display**
  - [x] Send `notes` per exercise in the workout submit payload (`WorkoutLog` submit handler)
  - [x] Show exercise note in WorkoutDetails if present (italic, below exercise name)
  - [x] Show exercise note in ExerciseDetail session history if present

---

### 4. Onboarding Flow
> First-run experience to capture goals, walk through key features, and optionally generate a starter routine via AI. Critical for 7-day retention.

- [x] **OnboardingScreen** (`screens/Auth/OnboardingScreen.tsx`)
  - [x] Step 1 — Goal: chip selector (chat UI)
  - [x] Step 2 — Experience: Beginner / Intermediate / Advanced
  - [x] Step 3 — Weekly frequency: days per week picker
  - [x] Step 4 — Optional AI routine: calls `POST /api/ai/generate`; "Skip" bypasses

- [x] **Feature tutorial** (`screens/Auth/OnboardingTutorialScreen.tsx`)
  - [x] 6 slides with icon, title, body text
  - [x] Dot pagination indicator at the bottom; Next to advance
  - [x] "Skip" visible on every slide; "Get Started" replaces "Next" on the last slide
  - [x] Skip and Get Started set `onboarding_complete = 'true'` and navigate to AppTabs

- [x] **Persistence**
  - [x] Store `onboarding_complete`, `user_goal`, `user_experience`, `user_days_per_week` in AsyncStorage
  - [x] Pre-populate AI generation defaults via `coach_settings` key (already used in TrainingScreen)

- [x] **Navigation gate** (`navigation/RootNav.tsx`)
  - [x] On first login, if `onboarding_complete` is not set, show OnboardingScreen before AppTabs
  - [x] After goal steps complete, show OnboardingTutorialScreen
  - [x] On complete or skip, set `onboarding_complete = 'true'` and navigate to AppTabs

---

### 5. Workout Share Image
> Branded card users can post to Instagram / X after a workout. High viral potential, low effort.

- [x] **Install** `react-native-view-shot` + `expo-sharing`

- [x] **WorkoutShareCard component** (`components/WorkoutShareCard.tsx`)
  - [x] Styled card: Aretē branding, workout name, date, volume, top 3 exercises, PR badge if any PRs set
  - [x] Always dark card with theme accent color for stats and accent bar

- [x] **Share button on WorkoutSummaryScreen**
  - [x] Add "Share Workout" button below "View Full Details"
  - [x] Tap: capture `WorkoutShareCard` with `react-native-view-shot` → open native share sheet via `expo-sharing`
  - [x] Brief loading state while capturing

---

### 6. Data Export (CSV)
> Lets users download their full workout history — builds trust and removes "data lock-in" concern.

- [x] **Backend** (`routes/workout_routes.py`)
  - [x] Add `GET /api/workouts/export` — `@jwt_required()`
  - [x] Returns CSV: `date, workout_name, duration_min, exercise_name, set_number, set_type, reps, weight, volume` — one row per set
  - [x] Response headers: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="workouts.csv"`

- [x] **Frontend** (`screens/ProfileTab/SettingsScreen.tsx`)
  - [x] Add "Export Data" row in the account section of Settings
  - [x] Tap: fetch `/api/workouts/export`, write to file via `expo-file-system`, open share sheet via `expo-sharing`
  - [x] Show activity indicator while downloading; toast on error

---

## 🔒 5. Security & Production Readiness
> Required before real users are on the app.

- [x] **CORS lockdown**
  > Right now the Flask backend accepts requests from *any* website or app. Once deployed, a bad actor could build a site that calls your API using a logged-in user's credentials from their browser. Locking CORS to your app's production domain means only your Expo app (and your own domains) can talk to the backend.
  - [x] Replace `CORS(app)` (allows all origins) with a whitelist of your production domain(s) via `CORS_ORIGINS` env var

- [x] **Rate limiting**
  > Without rate limiting, an attacker can try thousands of username/password combinations per second against `/api/login` until they get in (a "brute force" attack). `flask-limiter` adds a simple rule like "max 10 login attempts per minute per IP", making brute force attacks impractical.
  - [x] Add `flask-limiter` to `POST /api/login` and `POST /api/signup` to prevent brute force

- [x] **JWT token expiry + refresh flow**
  > Currently, a JWT token lives forever — if someone steals a token (from a compromised device or a network intercept), they have permanent access to that user's account. Short-lived access tokens (e.g. 15 min) limit the damage window. The refresh token silently gets a new access token in the background so the user never has to log in again during normal use.
  - [x] Set `JWT_ACCESS_TOKEN_EXPIRES` in Flask config (e.g. 15 min)
  - [x] Add `POST /api/refresh` endpoint using a refresh token
  - [x] On the frontend, detect 401 responses and silently refresh the token before retrying

- [x] **Centralised error handling**
  > Without this, Flask crashes return raw Python tracebacks (leaking internal file paths and library versions to anyone who can see the response), and inconsistent error shapes make the frontend harder to handle. A single `@app.errorhandler` ensures every error returns clean `{ "message": "..." }` JSON. Structured logging lets you search and alert on errors in production (e.g. via Sentry) instead of tailing raw logs.
  - [x] Add `@app.errorhandler` for 400, 401, 404, 500 in Flask returning consistent JSON
  - [x] Replace all bare `except Exception` blocks with specific exception types
  - [x] Add structured logging (Python `logging` module or Sentry)

- [x] **Frontend error handling**
  > If an API call fails silently, the user just sees a blank screen or stale data with no explanation. A React error boundary catches JavaScript crashes and shows a friendly recovery screen instead of a white crash. Network error toasts tell the user "something went wrong, try again" so they don't think the app is broken. Token expiry handling automatically boots the user to the login screen if their session can't be renewed.
  - [x] Add a top-level React error boundary component
  - [x] Add network error toasts (show a banner when API calls fail)
  - [x] Handle token expiry on the frontend — redirect to login if refresh fails

- [x] **Pagination**
  > Without pagination, `GET /api/workouts` fetches every workout a user has ever logged in one request. After a year of daily use that could be 300+ workouts with all their exercises and sets — slow to load, heavy on the server, and a bad experience on slow connections. Pagination loads a small page at a time and fetches more as the user scrolls.
  - [x] Add `?page=` and `?per_page=` params to `GET /api/workouts`
  - [x] Update ProfileScreen and DashboardScreen to paginate workout history

- [ ] **Server-side premium enforcement (post-launch)**
  > Premium is currently enforced only on the client: `is_pro = True` is hardcoded in `stats_routes.py` `strength_score`, so the API serves premium fields (greek score breakdown, big6, muscle groups) to any authenticated request. Decision (2026-06-12): launch iOS-only with client gating (PurchaseContext fails closed — no key / Android → not premium), do real enforcement after launch.
  - [ ] Add `is_premium` (Boolean, default False) to `User` + migration
  - [ ] `POST /api/webhooks/revenuecat` — verify the `Authorization` header against a `REVENUECAT_WEBHOOK_SECRET` env var; set `user.is_premium` from `INITIAL_PURCHASE` / `RENEWAL` / `EXPIRATION` / `CANCELLATION` events (`app_user_id` = our user id, set via `Purchases.logIn`)
  - [ ] Configure the webhook URL + secret in the RevenueCat dashboard
  - [ ] Replace `is_pro = True` in `strength_score` with `user.is_premium`

---

## 📱 6. App Store / Play Store Submission
> Everything needed to actually submit to Apple and Google.

- [x] **App assets**
  - [x] Design and export app icon (1024×1024 for iOS, 512×512 for Android)
  - [x] Design splash screen
  - [x] Add all required icon sizes via Expo config

- [x] **app.json / app.config.js**
  - [x] Set proper `bundleIdentifier` (iOS) and `package` (Android)
  - [x] Set `version` and `buildNumber` / `versionCode`
  - [x] Declare required permissions (only what's actually needed)
  - [x] Set `scheme` for deep linking

- [x] **EAS Build setup**
  - [x] Install and configure EAS CLI (`npm install -g eas-cli`)
  - [x] Run `eas build:configure`
  - [x] Set up build profiles for preview and production
  - [x] Test a production build on a real device

- [x] **Legal requirements (both stores require these)**
  - [x] Write and host a Privacy Policy (what data is collected and why)
  - [x] Write Terms of Service
  - [x] Link to both in the Settings screen and in store listing

- [ ] **Store listings**
  - [ ] Write App Store description (short + long)
  - [ ] Write Play Store description
  - [ ] Prepare screenshots (iPhone 6.9", iPhone 6.5", Android tablet)
  - [ ] Choose category (Health & Fitness) and age rating

- [x] **Backend hosting**
  - [x] Deploy Flask backend to a cloud host (Railway, Render, Fly.io, etc.)
  - [x] Set up PostgreSQL in production (not SQLite)
  - [x] Set `DATABASE_URL`, `JWT_SECRET_KEY` as environment secrets
  - [x] Point `EXPO_PUBLIC_API_URL` to the live backend URL

---

## 🤖 7. AI Coach
> AI-powered workout generation based on user preferences.

- [x] **Coach Settings UI** (Training tab in Exercises screen)
  - [x] Days per week selector (1–7)
  - [x] Training goal chips (Hypertrophy / Strength / Endurance / General)
  - [x] Experience level chips (Beginner / Intermediate / Advanced)
  - [x] Settings persist to AsyncStorage

- [x] **AI generation backend** (`POST /api/ai/generate`)
  - [x] Calls Claude Haiku to generate structured routine or template JSON
  - [x] Matches exercise names to ExerciseTemplate IDs
  - [x] Creates routine (with days + templates) or standalone template

- [x] **Improve AI generation**
  - [x] Let user preview the generated routine before saving
  - [x] Allow regeneration / manual edits before confirm
  - [x] Add ANTHROPIC_API_KEY setup instructions to README

---

## 💪 8. Strength Score
> Percentile-based strength ranking that tells users where they rank among all lifters. Pro feature.

- [x] **Add gender to User model**
  - [x] Add `gender` column (`'male'` | `'female'` | `null`) to `User` in `models.py`
  - [x] Generate and apply migration
  - [x] Add gender field to `SettingsScreen` (Male / Female / Prefer not to say) — required to see strength score
  - [x] `PATCH /api/me` to save gender

- [x] **Strength standards data** (`src/utils/strength_standards.py`)
  - [x] Percentile lookup tables for all major exercises (male + female), based on bodyweight ratio
  - [x] Big 6: Squat, Bench Press, Deadlift, Overhead Press, Barbell Row, Pull-up
  - [x] All other tracked lifts: Front Squat, Sumo Deadlift, Romanian Deadlift, Incline Bench, Close Grip Bench, Power Clean, Hip Thrust, Dumbbell Bench, Dumbbell Row, Dips, etc.
  - [x] Epley 1RM estimation formula: `weight × (1 + reps / 30)`
  - [x] Percentile interpolation function given a bodyweight ratio + gender + exercise

- [x] **`StrengthScoreSnapshot` model** (`models.py`)
  - [x] Fields: `id`, `user_id` (FK), `score` (float — overall percentile 0–100), `created_at`
  - [x] Write a snapshot whenever the score endpoint is called (max once per 24h per user)
  - [x] Migration for new table

- [x] **Backend endpoint** (`src/routes/stats_routes.py`)
  - [x] `GET /api/stats/strength-score` — requires gender + bodyweight set; returns per-exercise percentiles + overall
  - [x] Overall = three-tier weighted average (equal weight within each tier, skip exercises with no data): Big 6 = 70%, compound-secondary = 20%, isolation = 10%; missing tiers are dropped and the remaining weights renormalize automatically
  - [x] `GET /api/stats/strength-score/history` — returns `[{ date, score }]` from `StrengthScoreSnapshot`

- [x] **`StrengthScoreScreen`** (`screens/TrainingTab/StrengthScoreScreen.tsx`)
  - [x] Overall percentile hero at top: "Top X% of lifters"
  - [x] Gender gate: if gender not set, show prompt to add gender in Settings
  - [x] Big 6 section: each exercise shows name, estimated 1RM, percentile rank, progress bar — "No data" grayed out if not logged
  - [x] Supplemental exercises section below (collapsed "More lifts")
  - [x] Score-over-time line chart at bottom
  - [x] Add to `TrainingStack` + `navigation/types.ts`

- [x] **Entry point in Training tab**
  - [x] Add a Strength Score card in the Training tab progress section that navigates to `StrengthScoreScreen`

---

## ✨ 9. Future Features
> Not needed for launch, but good to keep in mind.

- [x] **Dark mode — auto-detect system setting**
  - [x] On app start, read `Appearance.getColorScheme()` as the default if no AsyncStorage preference is saved
  - [x] Subscribe to `Appearance.addChangeListener` so the theme switches instantly when the device setting changes
- [x] Push notifications (rest timer alerts, workout reminders)
- [x] Workout notes
- [x] Muscle group body diagram on Exercise Detail — highlight primary/secondary muscles
- [ ] **Supersets** — group two exercises together in a workout so they alternate A/B sets and share a rest timer
  - [ ] Add `superset_group` field (nullable int) to the `Exercise` model; exercises sharing the same value are paired
  - [ ] Update `POST /api/workouts` and `PUT/PATCH /api/workouts/<id>` to persist `superset_group`
  - [ ] Update WorkoutLog to let users pair exercises into a superset (e.g. long-press → "Pair as superset")
  - [ ] Render superset pairs as alternating A/B rows in WorkoutLog and WorkoutDetails
- [ ] **Workout streaks and achievement badges**
  - [x] Weekly workout streak (consecutive weeks meeting weekly goal)
  - [x] Current weekly streak displayed on dashboard (🔥 badge)
  - [x] Longest weekly streak on Profile screen
  - [x] Daily workout streak (consecutive days with a workout) — backend + dashboard
  - [x] Longest daily streak tracked in backend and shown in streak modal
  - [x] Monthly workout streak (consecutive months meeting monthly goal, goal = weekly goal × 4)
  - [x] Streak type selector modal on dashboard (weekly / monthly / daily)
  - [ ] Achievement badges (e.g. "First workout", "10-week streak", "100 workouts")
  - [ ] Badge showcase on Profile screen

---

## 💎 10. Premium Analytics
> Advanced stats gated behind Aretē Premium. Free users see locked placeholders. All features require the muscle-volume endpoint (`GET /api/stats/muscle-volume`) already built.

### Muscle Volume & Recovery

- [x] **Weekly muscle volume card** (free tier)
  - [x] Sets per muscle group this week, sorted by most sets
  - [x] Simple proportional bars, last-trained date per muscle
  - [x] "Not trained this week" divider with untrained muscles below
  - [x] ⓘ info tooltip explaining working sets

- [x] **MEV / MAV / MRV zone bars** (premium)
  - [x] Segmented zone bar per muscle showing where user sits relative to Minimum Effective Volume → Maximum Adaptive Volume → Maximum Recoverable Volume
  - [x] Color-coded: gray = below MEV, accent = on track, orange = high, red = overreaching
  - [x] Zone label (Below target / On track / High / Overreaching) per muscle
  - [x] Free teaser row → Paywall

- [ ] **Muscle training frequency** (premium)
  > 2×/week per muscle group is optimal for hypertrophy — 1× produces roughly half the gains.
  - [ ] Add `session_count` per muscle group to `GET /api/stats/muscle-volume` (`db.func.count(db.distinct(Workout.id))`)
  - [ ] Show sessions column alongside set count in muscle volume card
  - [ ] Highlight orange if frequency = 1 session this week, green if ≥ 2

- [ ] **4-week muscle volume trend** (premium)
  > Consistent volume progression over weeks is the primary hypertrophy driver.
  - [ ] Extend `GET /api/stats/muscle-volume` with `?history=4w` param — return 4-element array of weekly set counts per muscle
  - [ ] Show trend arrow next to each muscle row: ↑ trending up / → stable / ↓ trending down
  - [ ] Arrow color: green for up, textSecondary for stable, orange for down

- [ ] **Weekly volume vs last week — fatigue monitor** (premium)
  > Volume spikes >15–20% week-over-week are a leading cause of overuse injury.
  - [ ] `GET /api/stats/muscle-volume` already returns `last_week_total` — use it
  - [ ] Show a banner below the muscle card: green "On track ↑8%", yellow "High jump ↑24% — consider recovery", red "⚠️ Potential detraining — 40% of last week"
  - [ ] Thresholds: >20% increase = yellow, >35% increase = red, <40% of last week = red

---

### Training Split & Balance

- [ ] **Push / Pull / Legs split balance** (premium)
  > Pull:Push ratio should be ≥ 1:1, ideally 1.5:1 to prevent shoulder imbalances.
  - [ ] Pure frontend calculation — group `muscle_sets` from existing endpoint into:
    - Push: Chest + Shoulders + Triceps
    - Pull: Back + Biceps + Forearms
    - Legs: Quads + Hamstrings + Glutes + Calves
    - Core: Core
  - [ ] Horizontal stacked bar showing set distribution across groups
  - [ ] Pull:Push ratio badge — color green if ≥ 1:1, yellow if 0.7–1:1, red if < 0.7:1

---

### Strength Progression

- [ ] **PR velocity — strength gain rate** (premium)
  > Beginners gain 5–10%/month, intermediate 2–5%, advanced <2%. A plateau (<1% over 8 weeks) signals need for program change or deload.
  - [ ] Backend: add `GET /api/stats/pr-velocity` — for each exercise with ≥ 2 PR snapshots over 12 weeks, compute slope of estimated_1rm over time (lbs/month) using linear regression on `PersonalRecord` or existing `exercise_stats` history
  - [ ] Frontend: show "Progress Rate" stat on `ExerciseDetailScreen` stats tab (+X lbs/month)
  - [ ] Color: green if gaining, yellow if plateau (<1%/month for 8 weeks), gray if insufficient data

- [ ] **Workout density — volume per minute** (premium)
  > Increasing density (same volume, shorter time) is a form of progressive overload and a proxy for training efficiency.
  - [ ] Backend: extend `GET /api/stats/progress` buckets to include `density` field (total volume ÷ total duration in minutes; skip workouts with no duration)
  - [ ] Frontend: add "Density" as a 4th metric option in the chart metric selector (alongside Volume / Sets / Workouts)
  - [ ] Y-axis label: "lbs/min" or "kg/min" per user preference

---

## 👥 11. Social & Followers
> Follower system, leaderboards, and activity feed. Build in this order — each subsection depends on the one above.
>
> **Design choice: followers (asymmetric), not friends (mutual).** You follow someone with one tap — no request/accept flow. Privacy is handled by `profile_visibility` per user. Feed and leaderboard show people you follow.

### 10a. Follow System — Backend
> The data layer everything else depends on. A `Follow` row is directional: `follower_id` follows `following_id`. No status field needed — following is immediate.

- [ ] **`Follow` model** (`models.py`)
  - [ ] Add `Follow` table: `id`, `follower_id` (FK → user, `ondelete='CASCADE'`), `following_id` (FK → user, `ondelete='CASCADE'`), `created_at`
  - [ ] Unique constraint on `(follower_id, following_id)` to prevent duplicate follows
  - [ ] Indexes on `follower_id` and `following_id` for fast lookups

- [ ] **Migration** — create `follows` table

- [ ] **Follow routes** (`routes/social_routes.py`) — all `@jwt_required()`
  - [ ] `POST /api/follow/<int:user_id>` — follow a user; 400 if already following, 400 if following self, 404 if user not found
  - [ ] `DELETE /api/follow/<int:user_id>` — unfollow; 404 if not following
  - [ ] `GET /api/following` — list users the current user follows (avatar, username, streak)
  - [ ] `GET /api/followers` — list users who follow the current user
  - [ ] `GET /api/users/search?q=` — search users by username prefix (exclude self); return `id`, `username`, `avatar_url`, `is_following` bool

- [ ] **Register blueprint** in `app.py`

### 10b. Follow System — Frontend
> Three screens wired into the Profile tab stack.

- [ ] **`FollowingScreen`** (`screens/ProfileTab/FollowingScreen.tsx`)
  - [ ] `GET /api/following` on focus; show avatar + username + streak badge per user
  - [ ] Tap a row → `UserProfileScreen`
  - [ ] "Unfollow" swipe action or long-press context menu
  - [ ] "Find People" button → `UserSearchScreen`

- [ ] **`UserSearchScreen`** (`screens/ProfileTab/UserSearchScreen.tsx`)
  - [ ] Debounced search input → `GET /api/users/search?q=`
  - [ ] Results list: avatar, username, `is_following` state drives "Follow" / "Following" button
  - [ ] `POST /api/follow/<id>` on tap; button flips to "Following" immediately (optimistic update)

- [ ] **`UserProfileScreen`** (`screens/ProfileTab/UserProfileScreen.tsx`)
  - [ ] Read-only view: avatar, username, follower count, current streak, total workouts, total volume
  - [ ] Stats visible only if user's `profile_visibility` is not `private` (see §9d)
  - [ ] Follow / Unfollow button in header
  - [ ] Recent shared workouts list (taps into feed post detail)

- [ ] **Add entry point** to `ProfileScreen` — "Following" count row that navigates to `FollowingScreen`

- [ ] **Navigation types** — add all three screens to `ProfileStackParamsList` in `navigation/types.ts`

### 10c. Leaderboards — Backend
> Aggregate stats across users the current user follows. Runs weekly queries — keep them efficient.

- [ ] **Leaderboard route** (`routes/social_routes.py`)
  - [ ] `GET /api/leaderboard?metric=<metric>&range=<range>`
    - `metric`: `volume` (total lbs/kg lifted) | `workouts` (count) | `streak` (current streak)
    - `range`: `week` (default) | `month` | `alltime`
  - [ ] Response: ordered array of `{ user_id, username, avatar_url, value }` including the current user
  - [ ] Only include followed users whose `profile_visibility` is not `private` (see §9d)
  - [ ] Cap at 50 results to avoid query timeouts

### 10d. Privacy Controls — Backend + Frontend
> Required before any social data is visible. Default to followers-only, never fully public.

- [ ] **`profile_visibility` column** on `User` model: `'followers'` (default) | `'public'` | `'private'`
- [ ] **Migration** — add `profile_visibility` column
- [ ] **Enforce in `GET /api/leaderboard`** — skip users whose visibility is `private`
- [ ] **Enforce in `GET /api/users/search`** — omit users with `private` visibility from results; still show them if the current user already follows them
- [ ] **Enforce in `UserProfileScreen`** — hide stats sections if user is `private` and you don't follow them
- [ ] **Privacy setting in `SettingsScreen`**
  - [ ] Add "Profile Visibility" row with three options: Public / Followers Only / Private
  - [ ] `PATCH /api/me` with `{ profile_visibility }` on change (already accepted by the me endpoint)
  - [ ] Explain each option inline (e.g. "Private — only you can see your stats")

### 10e. Leaderboard Screen — Frontend
> The main social surface. Lives in a new Social tab or as a tab within the Profile screen.

- [ ] **`LeaderboardScreen`** (`screens/SocialTab/LeaderboardScreen.tsx`) — top tab inside the Social tab, alongside `FeedScreen`
  - [ ] Metric selector: Volume / Workouts / Streak (segmented control)
  - [ ] Range selector: This Week / This Month / All Time
  - [ ] Ranked list: position number, avatar, username, value, delta vs. last period (optional)
  - [ ] Current user's row is highlighted and always visible (pin to bottom if off-screen)
  - [ ] Empty state if not following anyone — "Follow people to see how you stack up" → `UserSearchScreen`

- [ ] **Push notification** (optional, post-launch): "You've been overtaken on the leaderboard!" via Expo push (reuse existing `push_service.py`)

---

### 10f. Workout Posts & Activity Feed — Backend
> Users can choose to share a completed workout with their followers. Sharing is always opt-in — workouts are private by default.

- [ ] **`WorkoutPost` model** (`models.py`)
  - [ ] Fields: `id`, `user_id` (FK → user), `workout_id` (FK → workout, `ondelete='CASCADE'`), `caption` (Text, nullable), `created_at`
  - [ ] Unique constraint on `(user_id, workout_id)` — a workout can only be posted once
  - [ ] Index on `user_id` and `created_at` for efficient feed queries

- [ ] **Migration** — create `workout_posts` table

- [ ] **Post routes** (`routes/social_routes.py` or new `routes/feed_routes.py`) — all `@jwt_required()`
  - [ ] `POST /api/workouts/<int:workout_id>/share` — create a `WorkoutPost`; accept optional `{ caption }`; 400 if already shared, 403 if not owner
  - [ ] `DELETE /api/posts/<int:post_id>` — delete own post (unshare); 403 if not owner
  - [ ] `GET /api/feed?page=<n>&per_page=<n>` — paginated posts from users you follow, ordered by `created_at DESC`; join `Workout` for summary fields (`name`, `date`, `duration`, `volume`); skip posts from users with `private` visibility
  - [ ] `GET /api/feed/<int:post_id>` — single post with full workout exercises + sets (for detail view)

- [ ] **Reactions** (likes) — optional, add after feed is working
  - [ ] `PostReaction` model: `id`, `post_id` (FK), `user_id` (FK), `created_at`; unique on `(post_id, user_id)`
  - [ ] `POST /api/posts/<id>/react` — toggle like (create if absent, delete if present)
  - [ ] Include `reaction_count` and `user_has_reacted` in feed response

### 10g. Workout Posts & Activity Feed — Frontend

- [ ] **Share prompt on `WorkoutSummaryScreen`**
  - [ ] Add "Share with Followers" button below "View Full Details"
  - [ ] Tapping opens a small sheet: optional caption `TextInput` + Share / Cancel buttons
  - [ ] On share: `POST /api/workouts/<id>/share`; show a brief confirmation toast; button changes to "Shared ✓" and becomes disabled
  - [ ] If user follows nobody yet, show "Follow someone first" instead of the share button

- [ ] **`FeedScreen`** (`screens/SocialTab/FeedScreen.tsx`)
  - [ ] Paginated list of posts from followed users, newest first; infinite scroll with `onEndReached`
  - [ ] Each **post card** shows:
    - User's avatar + username + relative time (e.g. "2 h ago")
    - Caption (if set)
    - Workout summary: name, duration, volume, exercise count
    - Top 3 exercises as chips (e.g. "Bench Press · Squat · Deadlift")
    - PR badge if any PRs were set (`prs` field on post)
    - Like button with count
  - [ ] Tap card → read-only `WorkoutDetails` view for that workout (`GET /api/feed/<post_id>`)
  - [ ] Pull-to-refresh
  - [ ] Empty state: "No posts yet — follow people or share your own workout"

- [ ] **Unshare** — long-press own post card → "Remove post" confirmation; calls `DELETE /api/posts/<id>`

- [ ] **Push notification** — when a user shares a workout, send a push to their followers via `push_service.py`: "Griffin just finished 'Push Day A' 💪"
  - [ ] Fire from the `POST /api/workouts/<id>/share` handler after committing
  - [ ] Batch-fetch follower device tokens; reuse `send_push()`
  - [ ] Tapping notification deep-links to the post in `FeedScreen`

- [ ] **Navigation** — add `FeedScreen` and `LeaderboardScreen` as top tabs inside a dedicated **Social tab** (5th bottom tab, positioned to the right of Dashboard); add `SocialStack` / `SocialTab` to `AppTabs.tsx` and all screen types to `navigation/types.ts`; tab order: Dashboard · Training · Social · Exercises · Profile

---

## 🏆 12. PR Dashboard
> A dedicated screen for viewing personal records — recent PRs across all exercises plus workout-level records (best single-workout volume, best single-workout rep count) that aren't tracked as per-exercise PRs today.

- [ ] **Backend — workout-level records**
  - [ ] Add a query/endpoint (e.g. `GET /api/personal-records/workout-bests`) returning the user's highest `Workout.volume` and highest total-reps-in-a-workout (sum of `reps` across all sets in one workout), each with the workout id/name/date
  - [ ] Decide whether these are stored (a `workout_id` + type row, similar to `PersonalRecord`) or computed on read — computed is simpler and avoids a migration if query cost is acceptable

- [ ] **Backend — recent PRs feed**
  - [ ] Extend or reuse `GET /api/personal-records` to support "recent" ordering (already has a `created_at`/date on each record — confirm and sort by it) so the dashboard can show a chronological feed, not just current bests per exercise
  - [ ] Include the source workout on each PR — `PersonalRecord.set_id` → `Set` → `Exercise` → `Workout` already links back; join it so each PR row carries `workout_id`, workout name, and date without an extra round trip
  - [ ] Add a "days since last PR" value per exercise (`achieved_at` on the most recent `PersonalRecord` row for that `exercise_template_id`) — surfaces lifts that have stalled
  - [ ] Add a PR streak stat — consecutive workouts (or weeks) with at least one PR logged, distinct from the existing workout-attendance streak; compute from `PersonalRecord.achieved_at` grouped by workout/week

- [ ] **`PRDashboardScreen`** (new screen, likely `screens/ProfileTab/` alongside `PersonalRecordsScreen.tsx`, or a tab within it)
  - [ ] "Recent PRs" list — chronological feed of PR events (exercise name, PR type, value, date), reusing `PR_TYPE_LABELS` conventions from `WorkoutSummaryScreen.tsx`
  - [ ] Each PR card taps through to the workout it happened in (`WorkoutDetails`) using the joined `workout_id`
  - [ ] "Workout Records" section — best single-workout volume, best single-workout rep count (card each, tap to view that workout in `WorkoutDetails`)
  - [ ] Entry point from `ProfileScreen` (near or merged with existing Personal Records section)
  - [ ] Momentum context instead of a flat list — e.g. "3 PRs this month" count and/or a small trend line per exercise, so the screen shows progress, not just a log
  - [ ] PR streak badge and per-exercise "X days since last PR" shown alongside the recent feed
  - [ ] Filter "Recent PRs" by type via chips (Weight / Reps / Time / Distance), mirroring the muscle-group chip pattern in `ExerciseList.tsx`
  - [ ] "Share PR" button on a PR card — reuse the `react-native-view-shot` + `expo-sharing` capture flow already built for `WorkoutShareCard`

- [ ] **Near-PR hint during logging** (`WorkoutLog.tsx` / `SetRow.tsx`) — while a set is focused, if the entered weight/reps is within ~5% of that exercise's current PR, show a small inline hint (e.g. "5 lbs from your PR"). Reuses the existing `prevSet` ghost-text plumbing in `SetRow.tsx`; surfaces the PR moment while it's still actionable instead of only after saving

---

## 📅 13. Weekly Summary
> A recap card summarizing the user's past week — workouts, volume, distance, PRs, bodyweight change. Surfaces automatically on the Dashboard at the start of each new week, and is always viewable from the Progress section.

- [x] **Backend** (`routes/stats_routes.py`)
  - [x] Add `GET /api/stats/weekly-summary?week=<iso-week or date>` (default: most recently completed week) returning: workout count, total volume, total reps, total cardio distance (per unit), PRs earned that week, bodyweight change (first vs. last entry in the week, or vs. prior week's last entry)
  - [x] Only include fields the user actually has data for that week (e.g. omit distance if no cardio logged) so the frontend can conditionally render sections
  - [x] Include muscle group breakdown for the week — reuse the `muscle_sets` query from `GET /api/stats/muscle-volume`, scoped to the summary's week, to surface most-trained muscle group
  - [x] Include which days of the week had a workout (array of dates or weekday booleans) for a Mon–Sun consistency dot row
  - [x] Include total training time — sum of `Workout.duration` across the week's workouts
  - [x] Include "most improved lift" — the exercise with the largest estimated-1RM increase over the week (compare first vs. last `estimated_1rm` PR snapshot in range, or recompute from sets) — recomputed from `Set` data via Epley 1RM (this week's best vs. last week's best), since `PersonalRecord` rows have no history
  - [x] Include a 4-week rolling average (volume, workouts) alongside the single prior-week comparison, so the week-over-week delta isn't thrown off by one unusually big or skipped week
  - [x] Include avg RPE for the week, only when the user has RPE enabled (`workout_show_rpe_${uid}`) and has logged any RPE values that week
  - [x] Include total calories burned for cardio activities — turned out NOT to need new persistence; ported `cardioCalories.ts`'s MET-table formula into Python and recompute weekly from already-stored `Set.cardio_duration`/`distance` fields

- [x] **Dashboard surfacing**
  - [x] On app open, if it's a new week (Mon by default, or user's configured week start) and last week has ≥1 workout logged and the summary hasn't been shown yet, show the Weekly Summary card/modal
  - [x] Persist "last shown week" to AsyncStorage (per-user key) so it only appears once per week
  - [x] Dismiss/close leads back to normal Dashboard

- [x] **`WeeklySummaryScreen` or card** (Progress section of Training tab)
  - [x] Always-accessible entry point to view the most recent (or a past) weekly summary, not just the auto-popup
  - [x] Stat rows conditionally rendered per the backend response: Workouts, Volume, Distance, PRs earned (list), Bodyweight change
  - [x] Reuse `PR_TYPE_LABELS` / stat card styling patterns from `WorkoutSummaryScreen.tsx` for visual consistency
  - [x] Show delta vs. the prior week (▲/▼ %) for workouts and volume — reuse the `last_week_total` comparison pattern already computed in `GET /api/stats/muscle-volume`
  - [x] Also show the 4-week rolling average alongside the single-week delta, so a spike/dip reads in context rather than in isolation
  - [x] Tie workout count to the user's `workout_weekly_goal_${uid}` — show "3/4 workouts toward your goal" instead of a bare number
  - [x] Surface the current weekly streak (already tracked, dashboard 🔥 badge) inside the summary card
  - [x] Most-trained muscle group line ("Chest was your focus this week")
  - [x] Mon–Sun dot row showing which days had a workout
  - [x] Total training time stat alongside Volume/Reps
  - [x] "Most improved lift" callout when applicable (exercise + 1RM gain)
  - [x] Avg RPE stat, shown only when the user has RPE enabled and logged any that week
  - [x] Calories burned stat (cardio weeks only), once the backend persists/derives it

- [ ] **Push the recap, don't just wait for app open** — fire a push via the existing APScheduler re-engagement job (`app.py`) each week alongside the in-app popup, so a user who doesn't open the app Monday still gets "Your week: 4 workouts, 12,400 lbs 💪"; tapping deep-links into `WeeklySummaryScreen`

---

## 🧠 14. Smart Training Assists
> Newer feature ideas that build on infrastructure already in place — set types, the coach injury profile, and the AI generation endpoint.

- [ ] **Auto warm-up set suggestions** (`WorkoutLog.tsx`)
  - [ ] When a user enters their first working-set weight for an exercise, offer to auto-insert 2–3 warm-up sets (e.g. 40% / 60% / 80% of that weight) using the existing `set_type: 'W'` support
  - [ ] Rounds suggested weights to the user's plate increment (`weightDelta`, already used for the −/+ keyboard buttons)
  - [ ] One-tap "Add warm-ups" action, editable/removable like any other set afterward

- [ ] **Exercise substitution for flagged injuries** (`CoachProfileModal.tsx` injuries field + `ai_routes.py`)
  - [ ] `GET /api/exercises/<id>/alternatives` — same primary `muscle_group`, different equipment, excluding exercises that hit the user's flagged injury area (reuse the injury list already collected in the coach profile)
  - [ ] Surface a "Swap exercise" option in `ExerciseBlock`'s 3-dot menu that opens a small picker of alternatives instead of the full exercise library
  - [ ] AI coach already asks about injuries — use the same data here instead of collecting it twice

- [ ] **Plateau / deload nudge** (depends on §10 "PR velocity" being built first)
  - [ ] When `GET /api/stats/pr-velocity` reports a plateau (<1%/month over 8 weeks) for a lift the user trains regularly, show a one-time dismissible card on `CoachScreen`: "Bench Press has plateaued — consider a deload week"
  - [ ] Tapping it could pre-fill an AI-generated deload routine via the existing `POST /api/ai/generate` flow (lower volume/intensity for a week)
