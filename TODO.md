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

### 7. Apple Watch Connectivity
> Native watchOS companion app for logging and tracking workouts from the wrist, synced live with the iPhone app. Requires a separate watchOS target and EAS build — not available in Expo Go.

**Phase 1 — heart rate via HealthKit (done, needs device verification).** No watchOS target, no Swift, no `WCSession`: the Watch records via its own Workout app and writes to Apple Health, and Aretē reads avg/max bpm back at save time. Any wearable that writes to Health works, not just an Apple Watch.

- [x] Replace `react-native-health` with `@kingstinct/react-native-healthkit` — the old library is an old-arch bridge module, dead under RN 0.83's bridgeless-only runtime, which is why `HEALTH_SYNC_ENABLED` was false
- [x] `Workout.avg_heart_rate` / `max_heart_rate` columns + migration `o3p4q5r6s7t8`, schema validation, POST/PATCH wiring
- [x] `utils/heartRate.ts` pure aggregation + `utils/heartRateSync.ts` post-save PATCH
- [x] Heart rate row on the workout detail summary card
- [ ] **Verify on device** — EAS build → TestFlight → confirm the Settings Health toggle grants permission and a watch-recorded workout shows bpm. Nothing below this line is worth starting until this passes
- [ ] Android heart rate: Health Connect exposes it too; mirror `heartRateSync.ts` in `healthConnect.ts`
- [ ] Show HR on the workout summary + share card, and consider an HR zone breakdown

**Phase 2 — native watch app (not started).** Everything below needs a Mac (Xcode + watchOS simulator) or a very slow blind EAS loop, plus a real Watch for `HKWorkoutSession` behaviour the simulator can't reproduce.

- [ ] **Watch app scaffolding**
  - [ ] Add a watchOS target (evaluate RN watch-connectivity libraries vs. a native SwiftUI watch app) via EAS build config
  - [ ] Minimal watch UI: current exercise name, current set (weight/reps), rest timer, Complete Set button
- [ ] **iPhone ↔ Watch sync**
  - [ ] Bridge `WorkoutSessionContext` (active exercise, sets, rest timer state) to the watch over `WCSession`
  - [ ] Sets completed on the watch push back into the phone's live session and save through the existing `POST /api/workouts` flow — no separate backend endpoint needed
  - [ ] Rest timer start/pause/remaining stays in sync in both directions
- [ ] **Standalone watch actions**
  - [ ] Complete Set / Skip Set / Start Rest Timer directly from the watch
  - [ ] Haptic tap on rest timer completion
- [ ] **Heart rate (stretch)**
  - [ ] Read live heart rate from the watch during a workout; store avg/max HR on the saved workout (new column + migration)

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

- [x] **Server-side premium enforcement (post-launch)** (built 2026-10-13, off until `PREMIUM_ENFORCED`; see §21 Phase 4)
  > Premium is currently enforced only on the client: `is_pro = True` is hardcoded in `stats_routes.py` `strength_score`, so the API serves premium fields (greek score breakdown, big6, muscle groups) to any authenticated request. Decision (2026-06-12): launch iOS-only with client gating (PurchaseContext fails closed — no key / Android → not premium), do real enforcement after launch.
  - [x] Add `is_premium` (Boolean, default False) to `User` + migration
  - [x] `POST /api/webhooks/revenuecat` — verify the `Authorization` header against a `REVENUECAT_WEBHOOK_SECRET` env var; set `user.is_premium` from `INITIAL_PURCHASE` / `RENEWAL` / `EXPIRATION` / `CANCELLATION` events (`app_user_id` = our user id, set via `Purchases.logIn`)
  - [x] Configure the webhook URL + secret in the RevenueCat dashboard (2026-10-14: test event answered 200; both secrets set on Railway)
  - [x] Replace `is_pro = True` in `strength_score` with `user.is_premium`

- [ ] **Per-set payload validation on workout routes**
  > `WorkoutSchema` types `exercises` as a bare `fields.List(fields.Dict())`, so **nothing inside an exercise or a set is validated** — arbitrary JSON goes straight into typed columns. This directly caused the 2026-09-10 production incident: a decimal `reps` value (Integer column) stayed a float in memory because SQLAlchemy doesn't coerce on assignment, `int()`-truncated in the max_reps PR lookup, matched no set, and a bare `next()` raised `StopIteration` — a 500 that rolled the whole workout back and silently lost the user's session (18 crashes over the visible 7-day log window, likely months in reality). Fixed in `6d70fc8` by coercing `reps` at all four assignment sites, but that hardens **one field**; the same class of bug is still open for every other set field.
  - [ ] Add a real `SetSchema` (reps Int, weight Float, rpe Int 1-10, cardio_duration Float, distance Float, distance_unit OneOf(km|mi), intensity Float, elevation_gain Float, set_type OneOf(N|W|D|F), order Int, id Int) and an `ExerciseEntrySchema` (name, exercise_template_id, exercise_type OneOf, order, notes, route_polyline, sets)
  - [ ] Nest them into `WorkoutSchema` / `UpdateWorkoutSchema` so `exercises` is `fields.List(fields.Nested(ExerciseEntrySchema))` instead of `fields.Dict()`
  - [ ] Marshmallow coerces on load, so this also removes the need for the manual `_coerce_reps` helper in `workout_routes.py` — drop it once the schema handles it
  - [ ] Decide the failure mode deliberately: a 400 with a field-level message is more correct than today's silent coercion, but check `WorkoutLog`'s offline queue replay first — a stricter backend could start rejecting payloads that queued under the old lenient rules
  - [ ] Same treatment for `RoutineSchema.days` and `WorkoutTemplateSchema`, which have the identical bare-Dict hole

- [ ] **Railway static volume shadows git-tracked static files**
  > Found 2026-07-29 while fixing the Privacy Policy/Terms 404 bug. Railway has a persistent volume mounted at `/app/static` (for `static/avatars/` and `static/progress_photos/`, so uploads survive redeploys), but mounting it at the whole `static/` directory instead of just those two subfolders means it shadows every other git-tracked static asset that isn't already present on the volume — a new file committed under `src/static/` will silently 404 in production even though it's correctly in the deployed image. `legal_routes.py`'s `/privacy`/`/terms` dodge this entirely by rendering in-memory strings instead of reading from disk, but any *future* static file (or a fix that reverts to `send_from_directory`) will hit this again.
  - [ ] Reconfigure the Railway volume to mount only at `/app/static/avatars` and `/app/static/progress_photos` instead of the whole `static/` directory, so git-tracked static files stop being shadowed
  - [ ] Confirm existing uploaded avatars/progress photos on the current volume still resolve correctly after remounting (path contents should carry over since the subpaths are unchanged)

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

- [x] **Muscle training frequency** (premium) (built 2026-10-08, see §21 Phase 3)
  > 2×/week per muscle group is optimal for hypertrophy — 1× produces roughly half the gains.
  - [ ] Add `session_count` per muscle group to `GET /api/stats/muscle-volume` (`db.func.count(db.distinct(Workout.id))`)
  - [ ] Show sessions column alongside set count in muscle volume card
  - [ ] Highlight orange if frequency = 1 session this week, green if ≥ 2

- [x] **4-week muscle volume trend** (premium) (built 2026-10-08)
  > Consistent volume progression over weeks is the primary hypertrophy driver.
  - [ ] Extend `GET /api/stats/muscle-volume` with `?history=4w` param — return 4-element array of weekly set counts per muscle
  - [ ] Show trend arrow next to each muscle row: ↑ trending up / → stable / ↓ trending down
  - [ ] Arrow color: green for up, textSecondary for stable, orange for down

- [x] **Weekly volume vs last week — fatigue monitor** (premium) (built 2026-10-08)
  > Volume spikes >15–20% week-over-week are a leading cause of overuse injury.
  - [ ] `GET /api/stats/muscle-volume` already returns `last_week_total` — use it
  - [ ] Show a banner below the muscle card: green "On track ↑8%", yellow "High jump ↑24% — consider recovery", red "⚠️ Potential detraining — 40% of last week"
  - [ ] Thresholds: >20% increase = yellow, >35% increase = red, <40% of last week = red

---

### Training Split & Balance

- [x] **Push / Pull / Legs split balance** (premium) (built 2026-10-08)
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

- [x] **PR velocity — strength gain rate** (premium) (built 2026-10-08)
  > Beginners gain 5–10%/month, intermediate 2–5%, advanced <2%. A plateau (<1% over 8 weeks) signals need for program change or deload.
  - [ ] Backend: add `GET /api/stats/pr-velocity` — for each exercise with ≥ 2 PR snapshots over 12 weeks, compute slope of estimated_1rm over time (lbs/month) using linear regression on `PersonalRecord` or existing `exercise_stats` history
  - [ ] Frontend: show "Progress Rate" stat on `ExerciseDetailScreen` stats tab (+X lbs/month)
  - [ ] Color: green if gaining, yellow if plateau (<1%/month for 8 weeks), gray if insufficient data

- [x] **Workout density — volume per minute** (premium) (built 2026-10-08)
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

- [x] **Backend — PR history foundation** (built 2026-08-11; design differs from the original sketch below because `PersonalRecord` rows are upserted in place — beaten PRs were never kept, so a history table was required)
  - [x] `PREvent` append-only table (`models.py` + migration `j8k9l0m1n2o3`): one row per PR moment with `previous_value` (beaten value, null on first PR) and a direct `workout_id` FK (the `set_id → Set → Exercise → Workout` chain breaks on set deletion — `SET NULL`)
  - [x] Every PR upsert branch in `workout_routes.py` (strength / cardio / duration) also appends a `PREvent`
  - [x] `_recompute_prs_for_templates` rewritten as a chronological replay through the same upsert helpers, so edit/delete rebuilds both current PRs and the event chain consistently
  - [x] `flask backfill-pr-events` CLI command (app.py) — replays all workouts for existing users (dry-run by default, `--apply` to write, `--force` to rebuild); **must be run against prod after deploy** or existing users see an empty dashboard

- [x] **Backend — dashboard + history endpoints** (`personal_record_routes.py`)
  - [x] `GET /api/personal-records/dashboard` — one round trip: paginated `recent_events` feed (with `improved_by` sign-normalized so cardio best_time deltas read positive; `estimated_1rm` excluded per the never-surface-as-PR rule; `?type=weight|reps|time|distance` filter), `workout_bests` (best single-workout volume + total reps, computed on read — no migration), and `stats` (PRs this month, PR streak = consecutive weeks with ≥1 PR, per-exercise days-since-last-PR for the 10 most-trained lifts)
  - [x] `GET /api/personal-records/history?exercise_template_id=&pr_type=` — ascending progression rows for the over-time tables/sparklines; `estimated_1rm` allowed here (as an "Est. 1RM trend" metric, never labeled a PR)

- [x] **`PRDashboardScreen`** (`screens/ProfileTab/PRDashboardScreen.tsx`, built 2026-08-12; visually revamped 2026-08-13 — "trophy case" direction)
  - [x] **"This Week's PRs" feed** — `GET /api/personal-records/dashboard` scopes `recent_events` to the last 7 days by default (`RECENT_FEED_WINDOW_DAYS` in `personal_record_routes.py`), **falling back to the user's most recent PRs regardless of age when the week is empty** (scoped to whichever type filter is active) so a quiet week doesn't leave the dashboard looking dead. The response's `recent_events_scope` (`'week'` \| `'all_time'`) tells the frontend which framing applies — title becomes "Recent PRs" (from "This Week's PRs") and a "No new PRs this week — here's your most recent" note appears above the feed when it's showing a fallback. Momentum stats (streak/this-month/days-since-last-PR) are unaffected — computed from the full history, not this window. An empty feed always means zero PRs of that (filtered) type have *ever* been recorded, since the fallback already exhausted all-time history first. Per-type icon badge, exercise name, PR label, value with a gold delta pill, relative date ("Today"/"Yesterday")
  - [x] Each PR card taps through to `WorkoutDetails` (ProfileStack has its own copy — no cross-tab hop needed)
  - [x] Filter chips (All / Weight / Reps / Time / Distance) re-filter the feed in place — header/hero/records/stalled/pins stay mounted, no full-page reload; a small inline spinner shows next to the section title while the new page loads
  - [x] "Workout Records" section — best single-workout volume + best rep count cards, icon badge each, tap to view the workout
  - [x] **Entry point: the whole Personal Records box on `ProfileScreen`** (`renderPRBar`) — the 3 switchable pinned-PR cards (unchanged swap-to-change-exercise behavior) now sit inside one tappable gold-**bordered** box (`colors.surface` fill, `PR_GOLD` border — not a filled gold background); tapping anywhere on it opens the PR Dashboard (nested swap-button `TouchableOpacity`s claim the touch responder first, so they don't also trigger navigation — standard RN behavior, not DOM bubbling). Dashboard header's right slot is a "View All" link (replacing the removed customize gear — see below) → `PersonalRecordsScreen`, the "all current bests" reference view, which also keeps its own gold banner back into the Dashboard
  - [x] Hero card — laurel-flanked weekly PR streak as the focal number, gold-bordered card, with PRs-this-month / total-PRs as a secondary row below a divider
  - [x] "Time Since Last PR" section — days-since-last-PR rows for the 10 most-trained lifts, urgency icon/color at 14d (watch) and 30d (stale, `colors.warmup`), tap → progression view. Own All/Weight/Reps/Time/Distance filter chips (independent of the feed's own chips above), switching client-side with no extra fetch — the dashboard endpoint already returns each exercise's `by_type` breakdown (per-category last-PR date + `weight_context`, grouped server-side by `(exercise_template_id, pr_type, weight_context)` so the most-recent weight is reported for `max_reps`, `null` when that exercise has never earned a PR of that type — those exercises drop out of a type-filtered view rather than showing a misleading "stalled since forever")
  - [x] **3-dot menu per feed card** ("View Chart" / "Share PR") replacing the two separate inline icons — same floating-`Modal` + tap-position pattern as `WorkoutLog.tsx`'s exercise menu; "Share PR" still renders `PRShareCard` (`components/PRShareCard.tsx`, modeled on `WorkoutShareCard`) off-screen via the existing `captureAndShare` helper
  - [x] **`PRProgressionScreen`** (`screens/ProfileTab/PRProgressionScreen.tsx`) — laurel-flanked "current best" hero card (with total improvement since the first recorded PR) atop a per-exercise PR-over-time **table** (Date | Value | Δ | Workout, newest first, current-best row marked with a trophy icon, rows tap → workout) + sparkline (react-native-gifted-charts), metric chips (Max Weight / Est. 1RM / Rep Record / Best Time / Best Distance / Longest Hold, shared list in `PR_METRIC_OPTIONS`) and per-weight / per-milestone context chips; shared value/delta formatting in `utils/prFormat.ts`
  - [x] ~~Customizable dashboard~~ — **removed 2026-08-18**: the gear icon → drag-to-reorder/hide-sections modal (`pr_dashboard_layout_${uid}`) was replaced by the "View All" link in that same header slot; sections now always render in a fixed order (hero, records, stalled, pinned progression)
  - [x] **Pinned Progression section** — pin/unpin exercises from `PRProgressionScreen`'s header (max 6, `pr_dashboard_pins_${uid}`, helper in `utils/prPins.ts`); each pinned card fetches its own history and renders a live sparkline + current value/delta (default series picked by `pickDefaultPrSeries` in `utils/prFormat.ts` — highest-priority metric with any events, most-recently-PR'd weight/milestone context), tap → full progression view
  - [x] **Consistent gold section headers** (`components/GoldSectionRule.tsx`, built 2026-08-19) — promoted from `PRDashboardScreen`'s original local `SectionHeader` (gold icon + uppercase label, a PR-gold sibling of the app-wide `SectionRule`) into a shared component, then applied everywhere a PR-gold section exists: all four Dashboard sections incl. the "This Week's PRs"/"Recent PRs" feed title (now with an icon + optional trailing `right` accessory for the filter-loading spinner), a new "Progression" header on `PRProgressionScreen` (previously had **no** section labeling at all above its chart+table), and `PersonalRecordsScreen`'s muscle-group headers (Max Weight/Max Reps sorted by muscle) + per-exercise headers (Time tab) — previously a fourth, different plain-strip style
  - [x] **`PersonalRecordsScreen` rows tap through to Progression** (built 2026-08-19) — every row across all three tabs (Max Weight default + by-muscle, expanded Max Reps accordion entries, Time tab) now navigates to `PRProgressionScreen`; previously this was the one PR surface with no path to a chart. The Max Reps accordion header still toggles expand/collapse unchanged — only the expanded weight/reps rows underneath it navigate
  - [x] **Real axes + `isAnimated` on both charts** (built 2026-08-19) — `PRProgressionScreen`'s chart and the Dashboard's pinned-card sparklines were axis-less "shape only" sparklines; both now show a recessive x-axis (compact `M/D` labels via new `fmtChartDate` in `utils/prFormat.ts`, one per data point) and y-axis (value ticks, dashed rules), plus `isAnimated` on mount. Y-axis ticks are guaranteed whole numbers via a new `formatChartYLabel` helper (`roundToDigits={0}` alone can still leave a fractional label on the offset-derived bottom tick) — used as `formatYLabel` on both charts. Progression's chart also dropped `disableScroll` — a long history now scrolls horizontally instead of squeezing labels until they collide, matching `StrengthScoreScreen`'s established chart convention (`yAxisLabelWidth`, `xAxisTextNumberOfLines`, muted `colors.border`/`colors.textSecondary` axis styling)
  - [x] **Progression pre-selects the metric/context actually tapped** (built 2026-08-20) — every entry point into `PRProgressionScreen` (feed card, feed 3-dot menu, stalled row, pinned card, all `PersonalRecordsScreen` rows) now passes the specific `prType`/`weightContext` that was tapped through new optional `PRProgression` route params, instead of always landing on the highest-priority metric; the fetch effect only falls back to the old auto-pick (`PR_METRIC_OPTIONS` priority order) when the seeded type turns out to have no history for that exercise (e.g. `time` is ambiguous between `best_time`/`max_duration` and is deliberately left unseeded, via `stalledCategoryToPrType` in `utils/prFormat.ts`). "Time Since Last PR" rows also gained a subtitle: in "All" mode it names which category (Weight/Reps/Time/Distance) actually produced the shown day-count — and whenever that category is Reps (in "All" mode or with the Reps segment active) it also shows the weight the rep record was set at (the category-selection logic itself was revised 2026-08-23, see below)
  - [x] **Pinned Progression moved above Time Since Last PR; both PR-type pickers switched from pill chips to a segmented control** (built 2026-08-22) — fixed section order is now Hero → Workout Records → Pinned Progression → Time Since Last PR → feed. The independent All/Weight/Reps/Time/Distance pickers (stalled section + feed) are now one connected 5-segment bar instead of two rows of separate pill buttons — same state/behavior, just a single bordered bar with hairline dividers between segments and the active one accent-tinted. Later promoted into a shared, generic `components/SegmentedControl.tsx` (see below) once `PRProgressionScreen` needed the same picker
  - [x] **Pinned charts animate once per dashboard visit, not on every re-render; pin any PR type per exercise; smarter pickers on Progression** (built 2026-08-22)
    - Pinned Progression's sparkline cards were re-animating (`isAnimated`) on every unrelated dashboard state change (e.g. switching the feed's filter), because `FlatList`'s `ListHeaderComponent` was handed a bare render function — a fresh identity every render, which can force React to remount that subtree. Fixed two ways: (1) `ListHeaderComponent={renderHeader()}` now passes an already-built element instead of the function, and the pinned section was extracted into its own `React.memo`-wrapped `PinnedProgressionSection` component so unrelated state changes don't touch it; (2) belt-and-suspenders — a `pinsAnimatedRef` in `PRDashboardScreen` flips true after the charts' first real-data paint and is threaded down as `isAnimated={animate}`, so even a forced remount can't replay the entrance animation after the first one for that screen visit
    - **Pin any PR type**, not just one pin per exercise — `PRPin` (`utils/prPins.ts`) gained optional `prType`/`weightContext`; pins are now keyed by `pinMatches`/`pinSlotKey` (exercise + type + context) instead of exercise id alone, so e.g. Max Weight and Rep Record on the same lift can be pinned as two independent cards. `PRProgressionScreen`'s pin button now pins/unpins whatever metric+context is currently selected. Legacy pins (saved before this shipped, no `prType`) loosely match any type on that exercise and keep falling back to `pickDefaultPrSeries`'s old auto-pick
    - **`PRProgressionScreen` picker overhaul**: the metric selector (Max Weight/Est. 1RM/Rep Record/etc.) switched from wrapping chips to the new shared `SegmentedControl`; the weight/milestone context selector (rep records per weight, cardio bests per milestone) replaced its wrapping chip row with a horizontal snapping list — the selected value sits centered under a marker, tap or scroll-and-settle to pick a different one
    - Fixed the progression table's "Workout" column header wrapping onto two lines on narrow screens (`numberOfLines={1}`)
    - Fixed the pinned sparkline chart overflowing its card: gifted-charts renders `yAxisLabelWidth` *in addition to* the `width` prop (the y-axis label column sits outside the plot area), so the plot width now reserves for it (`PIN_CHART_PLOT_W = PIN_CHART_W - PIN_CHART_Y_LABEL_W`) instead of sizing the chart to the card's full available width and then adding the label column on top
  - [x] **"Time Since Last PR" All mode now surfaces the STALEST category, not the most recently-hit one** (built 2026-08-23) — the aggregate `days_since_last_pr`/`last_pr_at` per exercise (`personal_record_routes.py`) previously tracked whichever category (Weight/Reps/Time/Distance) had been PR'd most recently; since rep PRs are earned far more easily/often than weight PRs, that trivially meant "All" almost always showed Reps, masking genuinely stalled categories like Weight. The aggregate now tracks whichever category has gone the **longest** without a PR instead, with a new `stalest_category` field telling the frontend which one — `stalledRowCategory` (`PRDashboardScreen.tsx`) now just reads it directly instead of re-deriving a (most-recent, and therefore Reps-biased) winner client-side
  - [x] **Progression's weight-context picker lists contexts smallest to largest** (built 2026-08-23) — `contexts` (`PRProgressionScreen.tsx`) previously listed weights in whatever order they were first PR'd (Map insertion order), now sorted ascending by value for display; which context defaults in when the metric changes is unaffected — computed separately (`firstSeenContext`, the chronologically-first one) so the display sort doesn't also silently change the default selection
  - [x] **Fixed duplicate y-axis labels and misaligned points on narrow-range charts (e.g. Rep Record)** (built 2026-08-23) — both PR charts (`PRProgressionScreen`'s and the Dashboard's pinned sparkline) padded the raw min/max by a percentage and let each tick's *label* round independently (`roundToDigits`/`formatChartYLabel`); for a series spanning only 1-2 reps that could produce ticks like 7, 7.75, 8.5, 9.25, 10 — which round to 7, 8, 9, 9, 10, showing "9" twice — and let labels drift out of sync with where points actually plotted. New `computeChartYAxisRange` (`utils/prFormat.ts`) snaps the whole range to whole-number, evenly-divisible steps up front instead (the same technique `StrengthScoreScreen`'s score-history chart already used, now shared), so both charts derive their axis and their points from the exact same numbers
  - [x] **Pinned card's Rep Record subtitle now says "Max Reps"** (built 2026-08-23) — was reusing `PR_METRIC_OPTIONS`' "Rep Record" label (meant for Progression's own metric picker); the pinned-card subtitle now special-cases `max_reps` to "Max Reps", matching the label this PR type gets everywhere else it's shown
  - [x] **Weekly weight/reps momentum shown next to "This Week's PRs"** (built 2026-08-23) — the dashboard endpoint now sums `value - previous_value` across the last `RECENT_FEED_WINDOW_DAYS` (7) for `max_weight` and `max_reps` `PREvent`s (`stats.weekly_weight_increased`/`weekly_reps_added`; first-ever PRs, with no `previous_value`, don't contribute — same convention as every other `improved_by`-driven delta), independent of the feed's own `?type=` filter so it doesn't flicker/change as the user taps chips. Rendered as a compact "+35 lbs · +8 reps" accessory in the feed's `GoldSectionRule` `right` slot (yields to the filter-loading spinner while one is active), hidden entirely when both totals are zero. `PREvent.improved_by` is a plain Python method, not a DB column, so it can't be summed in SQL — the route recomputes the delta directly from `value`/`previous_value`, which is safe here since neither `max_weight` nor `max_reps` improve downward (only `best_time` does)

- [x] **Near-PR hint during logging** (built 2026-08-12) — `WorkoutLog` prefetches current max-weight PRs once on open (`GET /api/personal-records`); while a strength set is focused (not warm-up/done/bodyweight), a gold hint renders under the row via `nearPrHint` in `utils/prFormat.ts`: within 5% below PR → "5 lbs from your 250 lbs PR", tie → "Ties your … PR", above → "Beats your … PR!". Threaded `WorkoutLog → ExerciseBlock → SetRow` as a focused-set-only prop so ExerciseBlock's `React.memo` still skips untouched exercises

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

- [x] **Exercise substitution for flagged injuries** (built 2026-10-08) (`CoachProfileModal.tsx` injuries field + `ai_routes.py`)
  - [ ] `GET /api/exercises/<id>/alternatives` — same primary `muscle_group`, different equipment, excluding exercises that hit the user's flagged injury area (reuse the injury list already collected in the coach profile)
  - [ ] Surface a "Swap exercise" option in `ExerciseBlock`'s 3-dot menu that opens a small picker of alternatives instead of the full exercise library
  - [ ] AI coach already asks about injuries — use the same data here instead of collecting it twice

- [x] **Plateau / deload nudge** (built 2026-10-08, advice only) (depends on §10 "PR velocity" being built first)
  - [ ] When `GET /api/stats/pr-velocity` reports a plateau (<1%/month over 8 weeks) for a lift the user trains regularly, show a one-time dismissible card on `CoachScreen`: "Bench Press has plateaued — consider a deload week"
  - [ ] Tapping it could pre-fill an AI-generated deload routine via the existing `POST /api/ai/generate` flow (lower volume/intensity for a week)

---

## 🏋️ 15. Exercise Details Upgrade
> Revamp `ExerciseDetailScreen.tsx` — merge About + top-level stats into a single "Overview" tab, replace thin/generic descriptions with real per-exercise content, and polish the tab-switch animation. Grounded in a read of the current file: About and Stats are two separate tabs today (3 tabs total: About / Stats / History), and `description` resolves via a fallback chain (wger.de fuzzy name search → route-param `description`, which no navigation call site actually passes → one of 9 generic per-muscle-group blurbs → a hardcoded generic default) — so almost every exercise ends up with either a possibly-wrong wger match or the same shared paragraph as every other exercise in its muscle group.

- [x] **Merge About + stats into a single "Overview" tab**
  - [x] Collapse the 3-tab layout (About / Stats / History) down to 2 (Overview / History) — Overview combines the muscle pills, `MuscleDiagram`, description, and the single-number stat cards currently in Stats (Estimated 1RM, Max Weight, Max Vol/Set, Max Reps, Total Sets, Total Reps, Workouts for strength; Total Distance, Total Time, Avg Pace, Sessions for cardio)
  - [x] Decide where the three time-series charts (1RM/max-weight/volume over time, currently under Stats' Progress section with a 1M/3M/6M/All range toggle) land in the merged layout — e.g. a collapsible "Show more" below the stat grid (matching the pattern already used on Strength Score's hero card) so Overview doesn't get overly long
  - [x] Handle the cardio/strength asymmetry explicitly — cardio exercises currently get no muscle pills/diagram and no charts at all; decide what (if anything) fills that space in the merged Overview rather than leaving it blank

- [x] **Real per-exercise description content**
  - [x] Replace the wger.de fuzzy-match + generic-muscle-group-blurb fallback chain with actual per-exercise text
  - [x] Decide sourcing: hand-curate for the seeded library exercises vs. one-time AI-generate-and-cache (e.g. a `description` column added to `ExerciseTemplate`, populated once via a backend script, spot-checked before shipping)
  - [x] Keep a sane fallback for custom (user-created) exercises, which have no curated text to draw from

- [x] **Show Strength Score rank inline in Overview**
  - [x] For lifts with strength-standards data, surface the same percentile/rank badge used on `StrengthScoreScreen`'s lift rows directly in Overview, linking out to the full Strength Score screen instead of requiring a separate trip there

- [x] **Smoother tab-switch animation**
  - [x] Replace the current fade-out → swap tab → fade-in (two sequential 100ms `Animated.timing` calls) with a single crossfade (old content fading out while new content fades in at the same time) — still plain RN `Animated`, not Reanimated (worklets crash at runtime in this app)

---

## 🤖 16. AI Coach Upgrade
> Better insights and better-generated workouts, grounded in what the AI Coach context builders actually feed the model today. Insights (`POST /api/ai/insights`) and generation (`POST /api/ai/generate`) are both real Claude Haiku calls with a context-building step, not rule-based — but the context is thinner than it could be: insights never call the existing `compute_most_improved_lift`/`compute_most_improved_cardio` helpers (only Weekly Summary does), and neither insights nor generation know what day of the week it is or what the user's own routine schedule looks like beyond its name — only rolling 7/14/28-day set counts.

- [x] **Feed "most improved lift" (and cardio) into AI Coach, not just Weekly Summary**
  - [x] Call `compute_most_improved_lift`/`compute_most_improved_cardio` (`utils/lift_progress.py`/`utils/cardio_progress.py`) from `_build_insights_context` (`ai_routes.py`) too, and surface a genuine recent win as its own insight rather than relying on the LLM to notice a PR buried in the raw `top_prs` list (which today only includes `estimated_1rm` PRs anyway — no cardio PR types feed insights at all)
  - [x] Also feed the recomputed most-improved result into `_build_user_context` (used by `POST /api/ai/generate`) so newly generated routines/templates can factor in a lift that's trending well (e.g. don't deload something that just hit a new PR)

- [x] **Give the coach real day-of-week / weekly-schedule awareness**
  - [x] Today's insight context only knows raw rolling-7-day set counts per muscle group (`_build_insights_context`) — it has no idea what day it is, and no knowledge of the user's routine schedule beyond its *name* (`active_routine_name`)
  - [x] Read the active routine's day rotation (`RoutineDay`, ordered by `day_order` — there's no weekday field, so "next up" is inferred from workout history via `_routine_rotation_context`, matching the most recent `Workout.name` against a day's `label`) so the coach can tell "Legs: 0 sets so far, but Leg Day is next in rotation" apart from "Legs: 0 sets, no leg day anywhere in this split — genuinely under-trained"
  - [x] Pass the current day-of-week and rotation position into the prompt context, so `_build_insights_prompt`'s MEV/MRV flags (`OVER MRV`, `below MEV`, `not trained recently`) stop firing prematurely for muscles the split simply hasn't reached yet
  - [x] Apply the same day-of-week/rotation awareness in `_build_user_context` — `POST /api/ai/generate`'s "prioritise undertrained muscles" directive had the identical premature-judgment risk

- [x] **RPE-based fatigue signal**
  - [x] Insights currently only flag overreaching by comparing rolling set counts against `MUSCLE_MRV`/`MUSCLE_MEV` — `Set.rpe` is already logged but never read by `_build_insights_context`
  - [x] When recent sets for a muscle group (≥3 RPE-logged sets this week) average 9+ RPE, surface that as its own distinct `HIGH FATIGUE` flag (real fatigue, not just volume) even when set count alone looks fine — gated on RPE data actually being present rather than the on-device `workout_show_rpe_${uid}` toggle, which the backend can't see

- [x] **Distinct color for achievement insights**
  - [x] `renderInsightCard`'s left-border priority color currently only distinguishes `high`/`medium`/everything-else (`colors.danger`/`colors.warmup`/`colors.accent`) — give `type: 'achievement'` its own positive treatment (e.g. `colors.save`) so a genuine win visually reads differently from a routine reminder or neutral suggestion

- [x] **Wire the unused "Notes to Coach" field into generation**
  - [x] `CoachProfile.notes` (the "Notes to Coach" free-text field) is saved from `CoachProfileModal.tsx` but never sent to `POST /api/ai/generate` — `AiGenerateSchema` has no `notes` field at all. Either send it through and let the model factor it in, or remove the input if it's meant to stay cosmetic

---

## ✍️ 17. Copy Polish — Remove Em Dashes from User-Facing Text
> Em dashes (—) are all over UI copy, toasts, empty states, onboarding text, and the legal pages — they read as AI-generated. Swap for a period, comma, or colon depending on the sentence. Code comments are fine as-is (not user-facing); this is about strings a user actually sees. Full audit below, grouped by file.

- [x] **Onboarding & auth**
  - [x] `OnboardingPersonalInfoScreen.tsx:95` — "Totally optional — you can add..." → period
  - [x] `OnboardingTutorialScreen.tsx:53,87,92` — carousel copy ("AI Coach — personalised...", "training — when to push...", "your goals — no fluff.") → colon / period
  - [x] `OnboardingScreen.tsx:89,98,99,261` — AI-onboarding chat bot lines ("Got it —", "Perfect —", "right now —", "your program —") → comma / period
  - [x] `ResetPasswordScreen.tsx:233` — "Sent — check your email" → period

- [x] **Toasts & empty states**
  - [x] `PRProgressionScreen.tsx:52` — "...up to N exercises — unpin one first." → period
  - [x] `PRDashboardScreen.tsx:480,588` — "No new PRs this week — here's..." / "...yet — keep training!" → period
  - [x] `MeasurementsScreen.tsx:316,364,401` — "No entries/measurements/photos yet — tap..." (×3) → period
  - [x] `CreateRoutineScreen.tsx:331` — "No templates yet — create one first" → period
  - [x] `CoachScreen.tsx:788,1183` — "No routines/active routine/data — ..." → period
  - [x] `TemplateDetailScreen.tsx:295` — "No exercises yet — tap Add..." → period
  - [x] `GPSCardioScreen.tsx:333,443,517` — "Screen will stay on —", "Saved offline —", "GPS tracking still works —" → period
  - [x] `WorkoutLog.tsx:1237` — "Saved offline — will sync when connected" → period

- [x] **Coach / Strength Score copy**
  - [x] `CoachScreen.tsx:914,1258,1271` — "Hey {name} —...", subtitle lines → comma / period
  - [x] `WorkingSetsInfoModal.tsx:27,30,31,32,54` — MEV/MAV/MRV definitions → colon per definition, period for the closing caveat
  - [x] `StrengthScoreScreen.tsx:304,309,449,765,786` — bodyweight captions + info modal copy → period / colon; the Epley formula line (786) had two em dashes bracketing a parenthetical, swapped for actual parens

- [x] **PR labels & summaries**
  - [x] `WorkoutSummaryScreen.tsx:192,203,226` — "Your first workout — incredible!", "{exercise} — new {type} PR!" (×2) → period / colon
  - [x] `WorkoutDetails.tsx:460,481` — "{exercise} — {PR label}" (×2) → colon
  - [x] `PersonalRecordsScreen.tsx:317` — "PR Dashboard — recent PRs, streaks & records" → colon
  - [x] `GreekRankIntroScreen.tsx:61` — "...to Aretē — the pinnacle of human achievement." → comma
  - [x] `PaywallScreen.tsx:29` — "AI Coach — generate routines & templates" → colon

- [x] **Legal / public pages (`routes/legal_routes.py`)** — highest visibility, worth doing first
  - [x] Homepage `<title>` and Greek Rank blurb (~line 12, 242)
  - [x] Privacy Policy `<title>` + body (~336, 353, 394–411) — the "Fitness data:" line and every third-party bullet (Anthropic/RevenueCat/Sentry/Resend/Expo/Apple-Google/Railway) use "— description", converted each to a colon after the `<strong>` tag
  - [x] Terms of Service `<title>` + body (~457, 508–509, 515, 538)

- [x] **Backend error messages (lower priority, dev-facing but user-visible on failure)**
  - [x] `ai_routes.py:580,617` — "AI service not configured — add..." / "anthropic package not installed — run..." → period

- [x] **Admin page (internal only, lowest priority)**
  - [x] `admin_routes.py:63` — "Exercise Images — Aretē Admin" → pipe

---

## 🏃 18. Endurance Score
> Cardio counterpart to the Strength Score: pace-percentile ranking for running, feeding the Greek rank's 45% performance slot as `max(strength_overall, endurance_overall)` so cardio-focused users have a real path to Aretē without diluting the strength score. Planned 2026-09-02 (full design discussion in session history).
>
> **Locked decisions:**
> - **Real pace standards** (min/km percentile tables by gender, mirroring `STANDARDS`' bodyweight-ratio tables), not relative-improvement scoring
> - **Running only in v1** — seeded `Running` + `Running (Treadmill)` templates get `standards_key='Running'` (pooled, like Bench Press across equipment). Cycling/rowing/walking still log + earn PRs but don't feed the score. Rowing is the natural fast-follow (Concept2 times are highly standardized) — per-key design already supports adding activities
> - **Two tiers**: Core (5K / 10K / Half / Marathon) 70% + Speed (400m / 800m / 1K / 1 Mile) 30%; missing tier drops and weights renormalize (same as strength). Speed tier is what makes sub-5K-only runners scoreable at all — they generate no core-distance PRs
> - **Best-within-tier, not mean-within-tier** — every stored short-distance `best_time` is linearly-scaled average pace from a longer run (systematically slower than a true effort), and all of a runner's per-distance times derive from the same runs, so a mean double-counts the extrapolation penalty. True interval efforts logged as separate sets DO produce accurate short-distance PRs and naturally dominate via the existing upsert (keeps fastest)
> - **`max()` blend, not average** — a lifter who never runs is completely unaffected; a hybrid athlete gets credit for their stronger discipline; trivially correct when one leg is missing
> - **Endurance-specific age anchors** (WMA age-grading curve), NOT the lifting Masters coefficients in `age_scaling_factor` — running declines differently with age
> - **Lookup is inverted vs. strength** — lower pace = better; interpolate downward, clamp at 99.9 fast / floor 1.0 slow
> - Draft pace table calibrated against recreational race-finisher distributions (sanity anchors, men: sub-20 5K ≈ 90th pct, sub-3:00 marathon ≈ high-90s, median marathon ~4:25; women ~12% slower per breakpoint). Keyed off `CARDIO_DISTANCE_MILESTONES` floats by import (1.60934, 21.0975, 42.195) so the join key can't drift
> - Unit safety verified: `_convert_stored_weights` only touches `max_weight`/`estimated_1rm`/`max_reps` — cardio `best_time`/`best_distance` values stay minutes/km regardless of kg↔lbs switches

### Phase 1 — Backend foundation (runners get a real Greek rank, no new UI) — built 2026-09-03

- [x] **`utils/endurance_standards.py`** (new file — keep the 460-line strength file focused)
  - [x] `PACE_STANDARDS[gender][distance_km][percentile] = min_per_km` for all 8 milestone distances, both genders
  - [x] `compute_pace_percentile(distance_km, gender, pace)` — downward interpolation, strength-style clamping
  - [x] `CORE_DISTANCES` / `SPEED_DISTANCES` tier constants — `CARDIO_DISTANCE_MILESTONES`/`CARDIO_DURATION_MILESTONES` were MOVED here (workout_routes now imports them from this file), so the pace-table keys share the exact floats PR rows are written with
  - [x] `endurance_age_factor(age)` — WMA-based piecewise-linear anchors (same interpolation pattern as `_AGE_FACTOR_ANCHORS`, different values)
  - [x] `compute_endurance_overall(per_distance_percentiles)` — best-within-tier, 70/30, renormalize missing tier
- [x] **Standards-key wiring**
  - [x] `SEEDER_STANDARDS_MAP` += `('running', None)` / `('running', 'treadmill')` → `'Running'`; seed.py's cardio loop now assigns `standards_key` (it never did before)
  - [x] Data migration `l0m1n2o3p4q5` backfilling `standards_key='Running'` on the two seeded global Running templates — applied + verified on local dev DB
- [x] **`strength_score()` updates** (`routes/strength_score_routes.py`)
  - [x] **Split the 422 gate**: `gender` missing → still 422; `bodyweight` missing → strength leg skipped (`overall`/`overall_rank` = `null`, not 0 — StrengthScoreScreen reads `missing_for_strength` to keep its "Log Bodyweight" gate), endurance + Greek rank compute normally
  - [x] `endurance_overall` from `best_time` PRs on `standards_key='Running'` templates (fastest pace per distance across pooled templates, endurance age credit before lookup)
  - [x] `performance = max(strength_overall, endurance_overall)` into `compute_greek_score`'s 45% slot
  - [x] Additive response fields: `endurance_overall`, `endurance.distances` breakdown (label/pace/percentile/rank/tier), `greek_score_components.endurance` + `.performance`
  - [x] Bonus: snapshot writes now skipped when there's no strength data (cardio-only users no longer accrue score-0 `StrengthScoreSnapshot` rows)
- [x] **Backend tests**: 22 unit tests (`tests/test_endurance_standards.py` — table integrity incl. monotonicity both axes + gender gap, interpolation/clamping, age factor, tier aggregation) + 4 route tests (`TestEnduranceLeg` in `test_stats_routes.py` — runner-without-bodyweight end-to-end, max() blend, strength-only unaffected, gender still gates)
- [x] Confirmed `test_unit_conversion_registry.py` still passes (no new weight columns)

### Phase 2 — EnduranceScoreScreen (parity with Strength Score) ✅ DONE

- [x] **`GET /api/stats/endurance-score`** — full payload: hero score + rank (reuse `STRENGTH_TIERS` percentile tiers — tier system is discipline-agnostic), tier breakdown, per-distance list (pace, percentile, rank badge, thresholds = pace needed at each tier boundary), history
- [x] **Snapshot history split**: add `score_type` column to `StrengthScoreSnapshot` (`server_default='strength'`) + migration; filter **all three** existing reads by `score_type='strength'` (`strength_score()`'s history query, its 24h-dedupe check, `/api/stats/strength-score/history`) or endurance snapshots pollute the strength chart
- [x] **`screens/TrainingTab/EnduranceScoreScreen.tsx`** — mirrors `StrengthScoreScreen` structure (hero ring, distance rows instead of lift rows, score-over-time chart via `computeChartYAxisRange`, share card via shared `components/share/ShareCardParts.tsx` chrome, rank-up celebration + `AsyncStorage` last-tier key pattern)
  - [x] Pace displayed in min/mi or min/km per existing `gps_distance_unit_${uid}` pref (stored values always min/km)
- [x] **Navigation**: register in `TrainingStack` + `navigation/types.ts`; entry tile on `CoachScreen` next to the Strength Score tile; add `/api/stats/endurance-score` to `PreloadScreen`'s preload list

### Phase 3 — Polish ✅ DONE

- [x] **`GreekRankScreen` Score Breakdown**: replace the single ambiguous "Strength" row with separate Strength + Endurance rows, higher one marked as the counting "Performance" component
- [x] Info-modal copy on both score screens explaining the `max()` blend + endurance methodology (best-within-tier, extrapolation caveat)
- [x] CLAUDE.md updates (new util file, new route, new screen, `score_type` column, 45%-slot formula) + CHANGELOG entry

### Phase 4 — GPS best-efforts extraction (fixes the interval-training gap) ✅ DONE
> **The gap**: `GPSCardioScreen` saves a session as one continuous recording — a track workout's fast 400m reps get averaged away with warmup/recovery jogs into one slow bout, so GPS-tracked interval training never produces true short-distance PRs (manual multi-set logging does — `_compute_and_upsert_cardio_prs` treats each set as its own bout). A Strava-style best-efforts scan makes speed-tier data honest for everyone, not just manual loggers.

- [x] **Best-efforts scan on GPS save**: from the recorded GPS points (timestamped route data already captured for `route_polyline`), find the fastest rolling window covering each milestone distance ≤ total run distance (400m / 800m / 1K / 1 Mile at minimum; longer milestones benefit too — a negative-split 10K contains a faster 5K than the run's average)
- [x] Feed extracted segment times into the existing PR pipeline (`best_time` upsert per milestone) alongside the whole-bout computation — upsert keeps the fastest, so this only ever improves PRs
- [x] Decide where the scan runs: client-side before save (has raw points + timestamps in memory; polyline encoding is lossy on timing) vs. backend (needs timestamped points persisted, not just the encoded polyline — likely a schema addition). Leaning client-side — no migration, data's already in hand at save time
- [x] Surface extracted best efforts on `CardioDetailsScreen` ("Best 1K: 4:32" chips) so users see what the scan found
- [x] Backfill consideration: historical GPS runs only have the lossy polyline (no per-point timestamps) — best efforts apply to new runs only; documented in CLAUDE.md and the migration

> **As built** (2026-09-23): the scan is client-side in `utils/bestEfforts.ts` and runs over the in-memory GPS points at save, since the encoded polyline drops per-point timing. Results persist as `cardio_best_efforts` rows on the Exercise — not recomputed — because `_recompute_prs_for_templates` rebuilds PRs from what's stored on the Exercise, so efforts living only in the POST body would be wiped by the next edit of any workout for that exercise. Each effort is fed to `_compute_and_upsert_cardio_prs` as one more bout, so no new PR logic was needed. Duration milestones were included as well as distance (furthest covered in 10/20/30/60 min → `best_distance` PRs). Windows are pause-aware (a `resumed` flag on each point, set where the live distance counter already skips the gap), interpolated at the exact milestone boundary, and gated on a plausibility floor plus a minimum point count so GPS noise can't bank an unclearable all-time PR. Editing a run's distance/duration by hand clears its efforts.

### Phase 5 — Cardio on the Coach Progress tab ✅ DONE
- [x] Distance metric on the Progress chart (`distance_km` per bucket, same counting rule as `_cardio_totals`), shown in the GPS distance unit
- [x] 3M range (13 weekly buckets) between 30D and 6M; every other week labelled so the narrow bars' dates don't collide
- [x] Range menu anchored to its button (`measureInWindow`), flipping above when there's no room below; previously fixed at `top: 120`
- [x] Metric tabs only for what the user has ever logged (all-time `metrics_logged` from the endpoint); nothing logged shows "Start logging to track your progress" with no tabs or range
- [x] Optional weekly distance goal (`workout_weekly_distance_goal_${uid}`, km): switch, -5/-1/+1/+5 and a typed value in the Weekly Goal modal; fill line on the card; goal line on the Distance chart. Display only, no streaks
- [ ] Verify on device: 3M label centring, the menu position on Android (edge-to-edge + `statusBarTranslucent`), and the modal's keyboard avoidance

---

## 📲 19. Home Screen Widgets
> Glanceable Aretē on the home screen and lock screen: this week's goal, your Greek Rank, and the next routine day, one tap from logging. Strength-first like the rest of the app, but every widget works for cardio users too. Planned 2026-09-17.
>
> **Constraints found while planning** (verify before building, since library support moves fast):
> - The app is managed/CNG: there are no committed `ios/` or `android/` folders, so widget targets must come from Expo config plugins and only exist in EAS builds (never Expo Go, same as HealthKit and GPS).
> - A widget can't call the API: the JWT lives in the app's SecureStore keychain item, which extensions can't read. The app has to push a small data snapshot out to storage the widget can read, and the widget renders from that.
> - `app.config.js` switches `bundleIdentifier` on `IS_DEV` (`com.aretefitness.app` vs `.dev`), so the iOS App Group and the widget extension's bundle ID must switch with it (`group.com.aretefitness.app` / `group.com.aretefitness.app.dev`), or dev builds write to a container the widget never sees.
> - Shares native groundwork with the Apple Watch plan (Pre-Launch section 7): an App Group, an extra Apple target, and EAS signing for it. Whichever ships first should set this up so the other reuses it.

### Decisions to make first
- [x] **iOS tooling**: `expo-widgets` (widgets written as React components with `@expo/ui`, CNG generates the extension, App Group and SwiftUI glue, no Swift). Stable from SDK 56; the app was upgraded 55 to 57 for it on 2026-09-23/24 (57 rather than 56 because 56 ships a Hermes memory regression). Rejected `@bacons/apple-targets`: hand-written SwiftUI can't be run or iterated on from this Windows machine. Still to confirm in the Phase 0 spike: EAS signs the extension for both bundle IDs
- [x] **Android tooling**: `react-native-android-widget` (2026-09-25). `expo-widgets` 57's Android side is a placeholder (its widget only draws its own name, with no data methods); real Android support lands in expo-widgets 58, so revisit once the app is on SDK 58 and one widget definition could serve both platforms. `react-native-android-widget` 0.22.1 has a codegen TurboModule and bridgeless `ReactHost` headless tasks, and its Android module compiled locally against RN 0.86
- [x] **Premium**: the Scores widget is Premium, with a locked state for free users (decided 2026-09-26). Weekly Goal, Greek Rank and Up Next are free
- [x] **Launch scope**: iOS first, Android after (decided 2026-09-25)

### Phase 0 — Spike (half a day, throwaway branch)
iOS spike on branch `spike/ios-widget` (2026-09-25): a small Streak widget (`widgets/StreakWidget.tsx`) showing the weekly streak Home already fetches, written through `utils/widgets.ts` from `DashboardScreen`'s `fetchStreak`. Setup found: `expo-widgets` generates an `ExpoWidgetsTarget` extension (bundle ID `<app>.widgets`) and the App Group; `Widget.updateSnapshot(props)` writes the props into the App Group and reloads the timeline itself, so no native `UserDefaults` module is needed. The widget layout is a function with a `'widget'` directive that babel ships as a string and the extension evaluates with the `@expo/ui/swift-ui` components as globals, so it can't use anything else from the app.
- [x] iOS: EAS `development` build installs, the widget can be added, and it shows the streak after Home loads (verified on an iPhone 2026-09-25)
- [ ] iOS: EAS credentials create the extension's bundle ID, App Group and provisioning profile. Dev bundle ID done 2026-09-25; production still to do on the first production build that includes the widget
- [x] Android: same Streak widget (`widgets/AndroidStreakWidget.tsx`, drawn by `widgets/androidWidgetTaskHandler.tsx`, registered in `index.js`). Verified on an emulator with an EAS `development` build 2026-09-25
- [x] Record the resulting setup steps in CLAUDE.md (plugin config, `widgets/` folder, lazy load, how to run a widget build) before building for real

### Phase 1 — Data bridge
- [x] **Snapshot schema** (2026-09-25, `utils/widgetSnapshot.ts`) (versioned, one JSON blob, only what widgets render): `version`, `updatedAt`, `userId`, weekly goal (`target`, completed day dates this week, current streak, optional distance goal in km plus this week's distance in km, and the GPS distance unit to show them in), Greek Rank (`rank`, `score`, `nextRank`, points to next, gate text from `utils/greekRank.ts`), scores (strength/endurance percentile + rank label, nullable), active routine (`name`, next day label + index for the deep link), units (`weight_unit`, GPS distance unit), accent color
- [x] **`utils/widgetData.ts`**: `writeWidgetSnapshot(partial)` merges the blob and hands it to each widget's `updateSnapshot` (iOS; which also refreshes it), or the Android library's update API. Grows out of the spike's `utils/widgets.ts`
- [x] **Write points** (reuse data already fetched, no new requests; the list as built is in CLAUDE.md, Home screen widgets): after `PreloadScreen` finishes, after a workout save or delete (weekly goal, streak, rank), after `greek-rank` / score fetches, on active-routine change, on weekly-goal or unit change
- [x] **Week rollover without opening the app**: store completed dates, not a count, and have the widget compute "this week" itself, so Monday morning shows 0/3 instead of last week's 3/3. iOS: add a timeline entry at next Monday 00:00 local
- [x] **Logout / account switch**: clear the snapshot in `AuthContext`'s logout and login paths alongside the existing `multiRemove`, and refresh widgets, so the next account never sees the previous user's rank. Widgets render a "Log in to Aretē" state when the snapshot is empty
- [x] Unit tests for snapshot building (week filtering across a Monday boundary, empty/logged-out state, cardio-only user with no strength score)

### Design (mock: https://claude.ai/artifact/AD5gF6dtvHxUFDt4moF3SA, revised 2026-09-26)
- Every widget carries the Aretē logo beside its label: a light version on dark widgets, dark on light. iOS shows it with `Image uiImage` from a file the app copies into `widgetsDirectory`; Android with `ImageWidget`
- Greek Rank, small, held by a gate: "Unlock by logging a Strength or Endurance Score" (medium keeps the full gate text). At Aretē there's no progress line; it says "Excellence"
- Up Next comes in small and medium. Small: routine name, day, a small muscle diagram and Start. Every day done: "Great Job! All N Days Complete" (an exclamation mark by request, an exception to the copy rule). Start opens a new workout with the day filled in
- Up Next's muscle diagram is the app's `MuscleDiagram` (front and back, the day's muscles highlighted), captured to a PNG with `react-native-view-shot` when the routine section is written, since neither widget runtime can draw `react-native-body-highlighter`'s SVG. One file per day, dark and light
- Scores comes in small and medium. Small shows one score, Strength or Endurance, picked when the widget is added (an expo-widgets `configuration` enum on iOS 17+, `widgetFeatures: 'reconfigurable'` on Android). Free users see a Premium lock in both sizes
- Lock screen (iOS): circular (weekly goal ring), rectangular (rank, progress, points to next), inline (workouts this week, beside the date)

### Phase 2 — iOS widgets
Built 2026-09-26 on `spike/ios-widget` (`widgets/WeeklyGoalWidget.tsx`, `widgets/GreekRankWidget.tsx`, props in `utils/widgetProps.ts`); not yet run on a device.
- [x] **Weekly Goal** (small, and medium): ring or dots for this week's workouts vs. goal, streak count, rank-colored accent. Tap opens Dashboard
  - When a weekly distance goal is set (`workout_weekly_distance_goal_${uid}`), a fill line under the dots as on the Coach card, reusing `distanceGoalProgress` from `utils/weeklyDistanceGoal.ts` so "15 / 15 mi" reads complete the same way in both. Medium size shows the numbers; small may show the line alone
- [x] **Greek Rank** (small + medium): rank name in its `GREEK_RANK_COLORS` color and icon, progress bar to the next rank; when held by a top-rank gate, show the gate requirement instead of points (same wording as the app). Tap opens the Greek Rank screen
- [x] **Lock screen** accessory widgets (plus the inline line beside the date): circular (weekly goal ring), rectangular (rank + progress)
- [x] Light/dark follow the system; use the stored accent for highlights (fixed sizes with `minimumScaleFactor` rather than Dynamic Type: a widget's size doesn't grow with the text)
- [x] Stale-data handling: if `updatedAt` is older than ~7 days, dim values and show "Open Aretē to update"

- [ ] Device check on the dev build. Done 2026-09-29: medium Weekly Goal, and Greek Rank in light and dark. Still to check: small Weekly Goal, the three lock screen widgets, taps open Home and Greek Rank, log out and in, and a Monday rollover (set the phone's date forward)

### Phase 3 — Android widgets
Built 2026-09-26 on `spike/ios-widget` (`widgets/androidWidgets.tsx`, drawn from the same `utils/widgetProps.ts` as iOS); not yet run on a device.
- [x] Weekly Goal and Greek Rank equivalents with the same snapshot and tap targets
- [x] Resizable layouts (2x2 small, medium from about 4 cells wide), with the widgets' own rounded corners. Not Material You dynamic color: the widgets use the app's accent and surfaces, as iOS does
- [x] Device check on an Android dev build: both sizes of each, light and dark, taps open Home and Greek Rank, and the hourly redraw rolls the week over on Monday

### Phase 4 — Up Next routine widget (both platforms)
Built 2026-09-29 on `spike/ios-widget` (`widgets/UpNextWidget.tsx`, `UpNext` in `widgets/androidWidgets.tsx`), small and medium, with the muscle diagram; not yet run on a device. Needs a new dev build on each platform (a new widget).
- [x] Small and medium widget: active routine name, today's "Up Next" day (same selection logic as the Dashboard Active Routine card: first day not completed this week, resetting to Day 1 each week), and a Log button
- [x] **Deep link**: `aretefitness://widget/up-next?routine=&day=` opens WorkoutLog pre-filled with that day. Add the route to linking config, including the cold-start and logged-out cases (queue the link until auth resolves)
- [x] Empty state when there's no active routine: "Pick a routine" linking to the Coach tab

### Phase 5 — Scores widget (small + medium, Premium)
> **After launch** (decided 2026-09-30): the widgets ship with Weekly Goal, Greek Rank and Up Next. The design is settled in the mock; this needs `isPremium` in the snapshot and a native per-widget setting for the small size's score, so a build on each platform.
- [ ] Medium: Strength and Endurance Score rings side by side (percentile + rank label), each hidden individually when that score has no data
- [ ] Small: one score, chosen when the widget is added; its own empty state when that score has no data
- [ ] Locked state for free users in both sizes: needs `isPremium` in the snapshot, written from PurchaseContext

### Phase 6 — Live Activity for an active workout (stretch, iOS)
Planned 2026-10-08. `expo-widgets` already has `createLiveActivity` (`start`, `update`, `end`, `getInstances`), `@expo/ui` `Text` takes `timerInterval` / `date` / `pauseTime` for a native ticking timer, and the plugin already sets `NSSupportsLiveActivities`. No Swift, no new target, no backend.

**Decisions**
- [x] **Replace the notification on iOS, keep it as the fallback.** Use the activity when it starts; fall back to `postLiveWorkoutNotification` for Expo Go, iOS < 16.2, Live Activities off in iOS settings, or a start error. The rest-over alert notification stays (an activity can't play a sound)
- [x] **Reuse `live_workout_notif_enabled`**, relabelled in Settings to "Live workout on lock screen". No new key
- [x] **No push updates.** The app updates the activity locally; elapsed time and the rest countdown tick natively from timestamps
- [x] **Apple Watch:** on iOS 18+ the activity mirrors to the Watch Smart Stack for free (glanceable state, no watchOS target). It does not log sets from the wrist, so the native watch app (section 7, Phase 2) stays a separate decision

**Step 0 — spike (throwaway branch, one EAS dev build; stop and rethink if any of these fail)**
Run on an iPhone 13 dev build 2026-10-08. A layout change needs only a Metro reload, not a build: the extension's Live Activity entry is generated by the plugin and the layout ships from JS.
- [x] Debug button starts / updates / ends a hard-coded activity
- [x] The native timer (`Text` `timerInterval` + `pauseTime`) keeps ticking with the app suspended; pause freezes it
- [ ] Every Dynamic Island region renders (compact, minimal, expanded). **Not verifiable on an iPhone 13** (no Island): only the banner shows. Keep the Island layouts simple and check them on an Island phone (14 Pro or newer) before shipping
- [x] An activity survives an app kill and `getInstances()` finds it on relaunch (count was 1)
- [x] `isStale` stays false after the stale date with the app closed: iOS doesn't re-draw the layout then, so a "Rest over" state keyed on it can't work. Dropped. At zero the countdown stops at 0:00 and the rest alert notification signals the end. The ~12 h "abandoned" dimming is dropped for the same reason (the orphan sweep is the backstop)

**Build**
Built 2026-10-08 (tests pass; verified on an iPhone 13 dev build). Deviations from the plan above: `clearSession` does NOT end the activity, because WorkoutLog calls it on every resume from minimized; the end points are explicit (save, discard in WorkoutLog and the mini bar, unmount without minimize, logout/login, cold-launch sweep in `WorkoutSessionProvider`). Dismissal is always `immediate` (no `after(date)`). No "Rest over" state or stale dimming (see the spike result).
- [x] `utils/liveActivityProps.ts` (pure): display strings, pause-adjusted `startedAtMs`, rest state (`running` with end time / `paused` with remaining / null), accent. Becomes the one copy of the "current exercise" rule now pasted in WorkoutLog and twice in AppTabs
- [x] `widgets/WorkoutLiveActivity.tsx`: lock screen banner + compact / minimal / expanded Island; added to `__tests__/widgetLayouts.test.ts`. Spike version written 2026-10-08 (`createLiveActivity('WorkoutLiveActivity', ...)`); no `app.config.js` entry is needed, since the plugin's generated bundle already includes the Live Activity and the layout ships from JS
- [x] `utils/liveActivity.ts`: lazy-required controller, serialized queue like `enqueueLiveNotifOp`; `startOrUpdateLiveActivity`, `endLiveActivity`, `endOrphanedLiveActivities`; returns whether an activity is active; no-op on Android / Expo Go
- [x] Start in the foreground when a non-edit WorkoutLog opens (ActivityKit needs a foreground start), including a restored session
- [x] Update on state change only: set toggled, exercise added/removed, workout paused/resumed, rest start/pause/resume/adjust/stop, and once at minimize (the context only gets the exercises on `saveSession`). Drop the rest state at minimize: `MinimizedSession` doesn't carry the rest timer
- [x] Both background effects (WorkoutLog, AppTabs) post the notification only when the controller reports no active activity
- [x] End on save success, discard, `clearSession`, and logout (`AuthContext`); `endOrphanedLiveActivities` on `AppTabs` mount when there's no stored session or workout backup
- [x] Deep link: `WIDGET_LINKS` entry + `widgetRouteFor` case so a tap reopens WorkoutLog
- [x] Settings: relabel the `live_workout_notif_enabled` toggle
- [x] Tests: props builder (pause math, rest states, exercise choice), controller ordering and no-op paths, end-on-clear (update the `WorkoutSessionContext` test's notifications mock), guardrail test for the lazy native import
- [x] Device checklist (iPhone 13, 2026-10-08, all passed): minimize, lock, rest ticking and reaching zero while locked, save, discard, kill and relaunch, Live Activities disabled (fallback notification), Island vs non-Island phone
- [x] Docs: Live Activity subsection in `src/workout-tracker-native/CLAUDE.md`
- [ ] CHANGELOG entry after checking `eas build:list`

**Open questions**
- [ ] A pause whose update fails (throttled / suspended) leaves the lock screen counting. Accept or mitigate?
- [x] GPS cardio runs (`GPSCardioScreen`) are a separate in-progress flow with their own timer: planned as Phase 7 below, together with minimizing a run
- [ ] Skip edit mode and "Perform Again" prefill; confirm restored sessions follow the same check
- [ ] Logout mid-workout: WorkoutLog may unmount without an end path, so `AuthContext` ends the activity directly (the orphan sweep is the backstop)
- [ ] Premium gating: assumed none

### Phase 7 — GPS cardio: minimize and Live Activity (planned 2026-10-08, not started)
Resolves the GPS question in Phase 6's open questions. Two features that depend on one change: **a run can't be minimized today because `GPSCardioScreen` owns the whole run**, and its unmount cleanup (`stopBackgroundTracking`, `stopLocationWatch`, `clearTimer`) ends tracking. Leaving the screen stops the run, which a `gps_run_checkpoint_${uid}` then lets the user recover on the next visit. A Live Activity can't outlive that either, so the run's state has to move out of the screen first.

**What exists:** the screen holds `trackingState` (idle/running/paused), `coords`, `distanceKm`, `elevationGainM`, the wall-clock timer (`baseElapsedRef` + `segmentStartRef`), and the location pipeline (`utils/gpsTracking.ts`: a background task when "Always" is granted, else a foreground watch + keep-awake). Per-fix logic (accuracy filter, `resumed` gap handling, climb, distance) runs inside `onLocationUpdate`'s `setCoords` updater, which calls `setDistanceKm` from inside the updater. Saving builds the POST body in `handleSave` (best efforts via `extractBestEfforts`, offline queue fallback).

**Decisions (the first two confirmed 2026-10-08)**
- [x] **One active session at a time.** A lifting workout or a GPS run, not both. Starting one while the other is open or minimized asks to finish or discard the other first. Reason: the mini bar, the Live Activity controller (`getInstances()[0]`) and the "one thing in progress" mental model all assume one; two would need a stacked bar and two activities for a rare case
- [ ] **Back = minimize while a run is running or paused.** No confirm, the run keeps going. From idle, back just leaves. The mini bar's discard keeps the existing double confirm (`confirmDiscard`), since a route can't be re-walked
- [x] **The mini bar gets Resume (back to the map) and Discard only**, like a lifting workout. Pause/Stop stay on the screen. Revisit if testers want a Pause on the bar
- [ ] **Separate Live Activity layout for runs** (`createLiveActivity('GpsLiveActivity', ...)`, its own props), sharing the controller. Distance and pace can't tick natively, so JS updates them (see below)
- [ ] Android: minimize works the same; no Live Activity (its foreground service notification already shows the run)

**A. Pull the per-fix logic out (no behavior change; do first)**
- [x] (built 2026-10-08) `utils/gpsRun.ts` (pure): a state shape `{ coords, distanceKm, elevationGainM, climb, skipNext }` and `applyFix(state, loc)` doing the accuracy filter (`MAX_ACCURACY_M`), `resumed`, `addAltitude` and `haversineKm`. No setState inside another setState's updater. Also the elapsed math (`runElapsedSeconds`) and `buildGpsRunBody` (the POST body from `handleSave`)
- [x] Tests for it (`__tests__/gpsRun.test.ts`, 20 cases; the screen now holds one `RunState` and its 17 existing tests pass unchanged): a fix over 30 m accuracy is dropped; the first fix after a pause adds no distance and is marked `resumed`; climb only from accurate altitudes; elapsed across pause/resume; the body for each activity and unit (including `best_efforts` and the offline path's identical body)

**B. Move the run into a context** (built 2026-10-08; 10 new tests in `__tests__/GpsRunMinimize.test.tsx`, and `GPSCardioScreen.test.tsx` now wraps the screen in the provider. Account changes are handled by an effect keyed on the user id inside `GpsRunProvider`, not by `AuthContext`. **Not shippable without C**: until the mini bar exists, leaving a running run's screen keeps it recording with nothing in the app to show it)
- [x] `context/GpsRunContext.tsx`, provided next to `WorkoutSessionProvider`: owns the state above plus the location subscription (`onGpsLocation` / `watchPositionAsync`), the checkpoint writes, and `start` / `pause` / `resume` / `stop` / `discard`. It exposes the state and `runElapsedSeconds`; consumers tick their own 1 s display interval, like `MiniWorkoutBar` does for a workout
- [x] `GPSCardioScreen` becomes a view of the context. Its unmount cleanup no longer stops tracking, and `cleanupOrphanedTracking()` moves to the provider's cold launch, run only when there is no run to restore
- [x] Keep the crash flow as is: the 10-point checkpoint, and "Review & Save" on the next visit to the screen. Nothing about recovery changes
- [x] The screen's saving stays in the screen (modal, name, POST, offline fallback), reading the run from the context and `buildGpsRunBody`; save and discard call the context's `finish()`, which stops tracking and clears the checkpoint
- [x] The foreground-only fallback (no "Always" permission) keeps its keep-awake while minimized, since the watch only runs with the screen on; say so in the docs
- [x] Logout and login stop an active run (`AuthContext`, like the Live Activity end points) and clear its checkpoint only for the account that owned it

**C. Minimize, in the app** (built 2026-10-08. Deviations: the bar is its own component, `components/MiniRunBar.tsx`, rather than a generalised `MiniWorkoutBar`, since the two share only a look; the one-session rule lives in `GpsRunProvider.start()` (refuses while a workout is open or minimized) and `WorkoutLogScreen` (refuses a new workout while a run is active), the two places every start goes through; the bar hides while the map screen is open via `screenOpen` in the context. Back needed no code: since B, leaving the screen is minimizing)
- [x] Back button / swipe-back minimizes a run in progress
- [x] `MiniWorkoutBar` shows a run when one is active ("Run · 2.31 mi · 24:10", Resume, Discard), pulling the generalised "what is in progress" out so the bar has one source. The bar and the tab bar behave as for a workout (hidden while the screen is open)
- [x] Entry points: Dashboard's Cardio button goes to the screen when a run is already active instead of showing an idle Start; starting a lifting workout while a run is active, and a run while a workout is open or minimized, asks first
- [x] Update `__tests__/GPSCardioScreen.test.tsx` (19 cases) for the context, and add context and mini bar tests
- [x] **A killed app brings the run back** (found on a device 2026-10-09): `GpsRunProvider` restores the account's checkpoint at launch and on sign-in as a paused, `recovered` run. The mini bar says "Unsaved Run" with Review (its GPS died with the app, so there is nothing to resume), and the screen opens on the save sheet. This replaced the "Unsaved activity" alert the screen used to show. Up to 10 points and the time since the last checkpoint can be lost. The bar also slides up like the workout bar
- [x] **Device feedback 2026-10-13:** the map screen now uses `slide_from_bottom` with no swipe-back, like WorkoutLog (it slid in from the side), and the tab bar is removed the moment it opens instead of collapsing (`screenOpen` in `CustomTabBar`); Back hands over to the bar immediately. Stop asks "End this activity?" first (Pause is the break). Both mini bars say Open, not Resume, since an open workout or run isn't paused (Review stays for a recovered run). Home says Resume Workout while a workout is minimized, and Track Activity / Log Workout say "Workout in progress" / "Activity in progress" instead of opening the other session (`utils/sessionConflict.ts`, shared with the two screens)

**D. Live Activity for runs** (built and checked on a device 2026-10-14. `widgets/GpsLiveActivity.tsx`, `utils/gpsLiveActivityProps.ts`, wiring in `GpsRunProvider`; `utils/liveActivity.ts` is now one controller per kind with the workout's exports unchanged. It follows the same Live Workout on Lock Screen switch. `frequentUpdates` is not on: it is a native plist change needing a build, so only if the device shows throttling)
- [x] Generalise `utils/liveActivity.ts` to take the activity kind (one controller, `getInstances()` per factory). `GpsLiveActivity` layout: logo tile, activity name, a native ticking elapsed timer (with `pauseTime` while paused), distance, current and average pace or speed (cycling shows speed), no sets or progress bar
- [x] Props builder `utils/gpsLiveActivityProps.ts` (pure, tested): distance and pace in the user's `gps_distance_unit`, reusing `fmtPaceValue`, `toDisplayDistance`, `currentPaceMinPerKm` so it matches the screen
- [x] **Updates are JS-driven** (in code: immediate on start, pause, resume and stop; distance and pace at most every `RUN_ACTIVITY_UPDATE_MS`, with a trailing push) : push when the displayed distance changes, at most every ~5 s, and always on pause/resume. `NSSupportsLiveActivitiesFrequentUpdates` is a plugin option (`frequentUpdates`) if the system's budget throttles it on a long run. The background task delivers fixes while the screen is locked, so JS is running; verify that on a device
- [x] Start when the run starts (foreground), update from the context, end on save, discard, logout and the cold-launch sweep (extend the sweep to both kinds). A tap opens the screen (`WIDGET_LINKS` entry, like `workout`)
- [x] Fallback when no activity can run: nothing extra; the OS's own location indicator and the Android foreground service already cover the run
- [x] Device check (iPhone 13, 2026-10-14, all passed): the run activity appears without a new build, distance and pace keep updating while the phone is locked, pause freezes it, and it goes away on save, discard and after a kill. `frequentUpdates` wasn't needed
- [ ] The run activity's Dynamic Island views on a 14 Pro or newer (unverifiable on the iPhone 13, like the workout's)

**E. Docs and release** (done 2026-10-14)
- [x] CLAUDE.md: a "GPS run session" subsection (the context owns the run, the screen is a view, every end point, the one-at-a-time rule, why distance updates are JS-driven), and update "Workout Session Flow" in the root CLAUDE.md, which only describes lifting
- [x] CHANGELOG entry

**Device checklist** (the part tests can't cover)
- [ ] Start a run, minimize, walk 100 m, resume: distance and route continued, no gap counted
- [ ] Minimize, lock the phone for 5 minutes, unlock: the run kept recording (background mode), and again with only "While Using" permission
- [ ] Pause, minimize, resume; stop from the screen after minimizing; save online and offline from a minimized run
- [ ] Discard from the mini bar: double confirm, tracking stops, the Live Activity goes
- [ ] Kill the app mid-run: relaunch offers "Review & Save" as today, and no Live Activity is left behind
- [ ] A lifting workout minimized, then a run started: the prompt appears; and the reverse
- [ ] Log out mid-run
- [ ] Battery and a long run (1 h+): update rate holds, memory stays flat (the thinned polyline in `displayCoords` already guards the map)

**Risks:** this is the largest refactor in the app's cardio path, on a screen whose crash-recovery behavior was fixed deliberately (see the 1.1.9 note about an unsaved GPS run being discarded by accident): Phase A's pure extraction and its tests come first for that reason. Two things to prove early on a device: that background fixes keep reaching JS with the app minimized and the phone locked (they do today with the screen open), and that Live Activity updates every few seconds aren't throttled.

### Done when
- [ ] CLAUDE.md documents the widget setup, the snapshot schema and every write point (so a new screen that changes widget data knows to write it)
- [ ] App Store screenshots/description mention widgets; CHANGELOG entry for the release that ships them

---

## 🔁 20. Drag & Reorder Upgrade
> Two related jobs: make `DraggableList` feel like a real reorder (it currently snaps), then let Home's actual cards be dragged instead of the chips arrange mode swaps in. Planned 2026-09-18.
>
> **Where it stands**: `components/DraggableList.tsx` is used in four places — Home's arrange mode, `TemplateDetailScreen`, `AIWorkoutPreviewScreen` and `WorkoutLog`'s reorder mode. It is PanResponder + RN Animated on purpose: Reanimated worklets crash in this app ("non-worklet function on the UI thread"), which is what killed react-native-draggable-flatlist here. Every row must be the same fixed `rowHeight`, and there is no autoscroll, so it only suits short lists that fit on screen.
>
> **Read the component's header comment before starting.** A previous version animated every row live so neighbours slid out of the way, using a persistent `Animated.Value` per row reset in a layout effect. It was reverted: the reset proved unreliable and rows could end up stuck mid-transform, overlapping a neighbour. Today only the dragged row is ever transformed, which is why the rest of the list snaps into place on drop. A redesign has to beat that failure, not repeat it.

### Part A — Make the drag look right
- [ ] **Neighbours move out of the way** as the dragged row passes them, instead of everything snapping on drop. Safer shape than the reverted attempt: derive each row's offset from the single drag `Animated.Value` plus its index (one interpolation per row, nothing persistent to reset), so a finished drag leaves no state behind
- [ ] **Lift feedback**: shadow/scale on pickup already exists but is subtle; consider a short spring on lift and drop, and a haptic on each position swap (currently only on pickup)
- [ ] **Drop animation**: the dragged row currently jumps to its new slot the instant the array reorders. Animate it home instead
- [ ] **Autoscroll** when the finger nears the top/bottom of the enclosing ScrollView, so long lists (WorkoutLog's exercise reorder) stop being capped by what fits on screen
- [ ] Verify each of the four call sites still behaves, especially `WorkoutLog` (the memo/stable-props note in the component header) and the swipe-to-delete rows in `TemplateDetailScreen`

> **Status 2026-09-23 — customization is shipped dark.** `HOME_CUSTOMIZATION_ENABLED = false` (`constants/dashboardCards.ts`) hides the customize button and pins Home to Active Routine, Cardio This Week, Week Calendar, Recent Workouts at full width, because the chip-based arrange mode isn't the interaction we want to ship. Built, tested and waiting behind the flag: per-card widths with two halves sharing a row (`sizes` in the layout, `packRows`), compact variants for Active Routine and Cardio This Week, and the Weekly Goal and Greek Rank widgets (`components/dashboard/`). Part B below is what unblocks the flag. When it lands, the size toggle has to move off the chips too: a width control on each lifted card, or a long-press menu.

### Part B — Drag Home's real cards
> Home's arrange mode swaps each card for an equal-height chip because the cards range from a fixed-height calendar to a workouts list hundreds of points tall, which `DraggableList` can't take. Dragging the cards themselves needs variable-height support.
- [ ] **Variable row heights**: measure each card with `onLayout`, keep a height table, and compute swap thresholds from cumulative offsets rather than `index * rowHeight`. Depends on Part A's autoscroll, since a tall card can exceed the viewport
- [ ] **Decide what a dragged card looks like**: full-size cards make a long page during a drag. Options: scale the lifted card down (Apple-style), collapse the non-dragged cards to headers while dragging, or cap the dragged card's height with a fade
- [ ] **Long-press to enter**: hold any card to start arranging, matching the home screen convention, with the existing options button kept as the discoverable path
- [ ] Cards that are conditional (Active Routine only exists when one is active) must keep their place in the order while absent
- [ ] Keep the eye/hide affordance reachable without the chips: an overlay control per card in arrange mode
- [ ] Retire the chips only once cards drag as well as chips do; `dashboard_layout` storage and `utils/dashboardLayout.ts` stay as they are either way

### Done when
- [ ] A reorder reads as continuous motion in all four call sites, with nothing left transformed after a drop
- [ ] Home's cards can be dragged at their real size, and `WorkoutLog`'s reorder list scrolls while dragging
- [ ] CLAUDE.md notes the new contract (variable heights, autoscroll) so future call sites know what they can rely on

---

## 💎 21. Premium Worth Buying
> Goal: a free user who trains for a few weeks should *want* Premium, see exactly what it would show them about their own training, and be able to buy it without friction or doubt. Written 2026-10-04 from a review of `PaywallScreen.tsx`, `PurchaseContext.tsx` and every `isPremium` gate.
>
> **Where it stands.** Premium today is: AI Coach generation, AI insights, Strength Score, Endurance Score, muscle volume zones (MEV/MAV/MRV), and lifting two caps (5 templates, 2 routines). Everything else is free: logging, GPS cardio, PRs, charts, Weekly Summary, Greek Rank, measurements, Health sync. Three weaknesses:
> 1. **Most of it is one-time value.** A generated program is used for months; a score is checked now and then. Little in Premium gives a reason to stay subscribed in month 4.
> 2. **Free users can't see what they're missing.** The score screens and insights are locked outright, so the paywall sells a description, not the user's own numbers.
> 3. **The purchase path has holes** (silent failures, stale entitlement, no savings shown, one generic pitch for eleven different entry points).
>
> **Principle to keep.** Logging is never paywalled and never degraded. Free is a complete tracker; Premium is the coach on top of it, and gets more valuable the more you log.
>
> **Branch note.** `launch/premium-gate` (5058e0c, PR open, not yet in `main` or the `improve/*` stack) already adds the paywall's Terms/Privacy links, removes `EXPO_PUBLIC_BETA_PREMIUM` from the production profile and adds `flask grant-beta-premium`. Merge it before starting Phase 0 so this work builds on it rather than redoing it. On the `improve/*` stack all three eas.json profiles still set `EXPO_PUBLIC_BETA_PREMIUM=true`.

### Decisions needed first (owner)
- [x] **Prices and trial** (owner, 2026-10-08): monthly $4.99, annual $29.99 with a 1-week free trial, lifetime $59.99. Set these in App Store Connect; the paywall reads the store's prices, so nothing in code changes (annual saves 50% against twelve monthlies).
- [x] **Template/routine caps** (owner, 2026-10-08): keep them, but the onboarding-generated routine and its day templates don't count (`starter` flag, see CLAUDE.md).
- [x] **How much AI is free** (owner, 2026-10-08): the onboarding program is free, and free accounts get one part of the weekly review a week. They no longer get insights in the Coach tab (it shows a lock and points to the Weekly Summary).
- [ ] **What a free user sees of the scores.** Recommendation in Phase 2.

### Phase 0 — The purchase path must be correct (launch blocker)
> None of the rest matters if buying fails silently or a subscriber is shown the paywall.
- [x] Merge `launch/premium-gate`; confirm Terms of Use + Privacy Policy links are on the paywall (App Store guideline 3.1.2)
- [x] **Entitlement stays current** (`PurchaseContext.tsx`)
  - [x] `await Purchases.logIn()` before reading customer info, and take the `customerInfo` it returns; today the read can race the login and check an anonymous user
  - [x] `Purchases.addCustomerInfoUpdateListener` so expiry, renewal and a purchase on another device apply without a relaunch
  - [x] Refresh customer info when the app returns to the foreground
  - [x] On logout: `Purchases.logOut()` and reset `isPremium`, so a failed status check can't leave the next account with the last one's Premium
  - [x] Drop the duplicate login + load that both mount effects run when a user is already signed in
- [x] **Purchase failures say something.** Return a reason from `purchasePackage` instead of `false`: cancelled (silent), pending / Ask to Buy ("Waiting for approval"), network, store problem, already owned (offer Restore)
- [x] **Restore tells a failure from "nothing to restore."** A network error must not read "No purchases found"
- [x] **Plans that fail to load** show a message and a Try Again button instead of spinners forever; retry `getOfferings` when the paywall opens with none
- [x] Legal line matches the plan picked: no "automatically renew" wording under Lifetime; state price and period for subscriptions
- [x] Accessibility: label on Close, `selected` state on plan cards
- [x] Tests: entitlement listener, login race, logout reset, each failure reason, offerings retry

> **Status 2026-10-04:** done in code and tests on `improve/paywall`. Not yet exercised against the real store: run a purchase, a cancel, a restore and an expiry with a sandbox account before release.

### Phase 1 — A paywall that converts
- [x] **Pitch what they tapped.** Every entry point already passes `source` (`ai_coach`, `strength_score`, `endurance_score`, `muscle_volume`, `templates`, `routines`, `app_icon`) and the paywall ignores it. Map each to a headline ("Strength Score is part of Premium") and move that feature to the top of the list
- [x] **Show the annual saving from real store prices**: "Save 40%" badge and "$3.33/mo, billed yearly" under Annual (`product.price` / 12, formatted with `product.currencyCode`)
- [x] **Button names the plan**: "Start 7-Day Free Trial", "Subscribe for $39.99/year", "Buy Lifetime for $99.99"
- [x] **Trial reminder.** Starting a trial schedules a local notification two days before the first charge, if notifications are already allowed. The on-screen Today / Day 5 / Day 7 timeline was built and removed 2026-10-05 (owner: unnecessary); the plan card and button already state the trial
- [x] **Feature rows with substance**: one line each on what it does for you, not just a name ("See which lifts are holding your score back")
- [x] Motion: press scale + haptic on plan cards, staggered fade-in on feature rows, check animation on success before the screen closes
- [x] **Manage Subscription** row in Account Settings for subscribers (opens Apple's subscriptions page), showing the plan and renewal date from customer info
- [x] Premium users who somehow reach the paywall see "You're Premium" instead of prices

> **Status 2026-10-05:** built and tested on `improve/paywall`; reviewable in the dev build with `PAYWALL_PREVIEW` (`constants/featureFlags.ts`), which shows a free account and sample plans. Savings, button and trial read the store's own prices; real prices and a real trial still need the TestFlight check.

### Phase 2 — Let free users see their own locked value
> A locked screen sells nothing. Their own number, partly shown, sells itself.
- [x] **Strength Score / Endurance Score teaser.** Free users open the screen and see their overall tier and ring; the per-lift percentiles, history chart and "what to improve" are blurred behind one Unlock button. The server already computes all of it
- [x] **Per-lift rank on Exercise Detail and Personal Records**: show the rank badge greyed with a lock rather than hiding it
- [x] **One free insight a week.** Show the top insight in full and the count of the rest ("3 more insights this week")
- [ ] **Upsell at the moment it's relevant**, each at most once per event and never mid-workout:
  - [x] After a PR on a ranked lift, the workout summary links to where it ranks (the POST flags `scored` PRs)
  - [x] Weekly Summary: locked parts of "Coach's Read" (built with the weekly coach review below)
  - [x] Muscle chart: one large lock over the advanced stats below the muscle card (free accounts, `PremiumTeaser`)
  - [x] Template and routine headers show "3 of 5 free" before the cap is hit
- [x] **Premium welcome.** After purchase, a short screen listing what just unlocked with a button to each, instead of a toast

> **Status 2026-10-06:** done on `improve/paywall` except the two upsells held for Phase 3 above. Exercise Detail's per-lift rank is now locked for free accounts too (owner). Not yet seen on a device, the blur in particular.

### Phase 3 — Reasons to stay subscribed
> Features that produce something new every week from data the app already has. Most are already specced; this is the order to build them in.
- [x] **Next-session targets (progressive overload).** Built 2026-10-08 as rules, no AI: `utils/overloadTarget.ts` reads last session's working sets (`previousSets`, now carrying RPE from `/api/stats/exercise/last-session`) and "Today's Target" in the exercise's 3-dot menu opens a sheet with last session ("8 x 185 lbs @ 7"), the target ("8 x 190 lbs") and a one-line reason. Hold at RPE 9+, add a rep to the weakest set if the sets fell off, add one plate step when every set matched. Premium only, nothing for free accounts (no upsell mid-workout). Not yet seen on a device
- [x] **Weekly coach review** in Weekly Summary: what went well, what lagged, one change for next week (built 2026-10-08: `POST /api/ai/weekly-review`, `components/WeeklyReviewCard.tsx`). Premium reads all three parts, free the first. Generated by a button (shared `GenerateAction`: the card clears and the button narrows into a pulsing star while writing; the Coach tab's Generate Insights uses it too), once per week, cached on the device. It reads the summary week exactly (`week_start` + `as_of` in `_build_insights_context`), so any week can be reviewed. Not yet seen on a device
- [x] **PR velocity + plateau / deload nudge** (§10, §14). Built 2026-10-08: `GET /api/stats/pr-velocity` (`utils/pr_velocity.py`), "Progress rate" card on Exercise Detail (locked for free), dismissible `PlateauNudge` on the Coach tab (premium, back after 28 days). The nudge is advice only: the AI deload routine from §14 is not wired
- [x] **Fatigue monitor: volume vs last week** (§10). Built 2026-10-08 as the "Weekly load" section of `AdvancedStatsCard`, comparing with last week up to the same weekday
- [x] **Muscle training frequency + 4-week volume trend** (§10). Built 2026-10-08 on the muscle volume card rows
- [x] **Push / Pull / Legs balance** (§10). Built 2026-10-08 as a section of `AdvancedStatsCard`
- [x] **Exercise substitution for flagged injuries** (§14). Built 2026-10-08: `GET /api/exercises/<id>/alternatives`, "Alternatives" in the workout exercise menu (premium). Injury rules are name based (`utils/exercise_alternatives.py`), so a custom exercise with an unhelpful name can slip through
- [x] Workout density metric (§10). Built 2026-10-08: `density` on progress buckets and a "Workout density" section of `AdvancedStatsCard`, among the Progress tab's advanced stats (bars per period of the chart range, behind the advanced stats lock for free)
- [x] Decide for each whether free users get a teaser (Phase 2 pattern) or nothing: see the build plan below

**Build plan (written 2026-10-08).** Five batches, in this order. Each ships with backend and frontend tests, and nothing is paywalled inside a workout (the Phase 2 rule), so the two in-workout features show nothing to free accounts.

- **Batch A, muscle chart upgrades** (Coach > Progress, one extension of `GET /api/stats/muscle-volume`, no migration): per-muscle `session_count` this week and `weekly_history` (the 4 weeks before it, oldest first), plus `last_week_to_date_total` (last week's sets up to the same weekday, because this week is partial and comparing it with a full last week would read as detraining every Monday).
  - Muscle training frequency and the 4-week trend: a Zones / Frequency / Trend switch on the muscle card (`MuscleVolumeCard`), pips for sessions (orange at 1, green at 2 or more) and a 5-bar sparkline with an Up / Steady / Down label.
  - 4-week trend: an arrow per muscle (up / flat / down vs the average of the 4 weeks, within 15% is flat).
  - Fatigue monitor: a banner comparing this week with last week at the same point, using this TODO's thresholds (yellow above +20%, red above +35%, red below 40% of last week). Quiet until the user has 2 workouts this week.
  - Push / Pull / Legs balance: a stacked bar and a pull:push ratio badge, pure frontend from `muscle_sets`.
  - Free: sees the muscle card as before, and one large lock (`PremiumTeaser`, `muscle_volume` paywall source) over the blurred fatigue, balance and density cards below it. This replaced the first idea, a "why" link for a muscle under its MEV for 2 weeks, which the lock made redundant.
- **Batch B, workout density**: `density` (volume per minute) on `GET /api/stats/progress` buckets, and a 4th metric in the Progress chart selector. Locked option for free accounts.
- **Batch C, PR velocity and plateau nudge**: `GET /api/stats/pr-velocity` (best estimated 1RM per session over 12 weeks, linear regression, lbs or kg a month, plateau under 1% a month over 8 weeks with 4+ sessions). "Progress Rate" on Exercise Detail; a dismissible plateau card on Coach with a deload suggestion, shown again after 4 weeks. Free sees a greyed rate with a lock, like the per-lift rank.
- **Batch D, next-session targets**: rule-based, no AI, so it is instant and works offline. `utils/overloadTarget.ts` (pure): double progression off the last session's working sets, hit the top of the rep range at RPE 8 or below then add the plate increment, otherwise ask for one more rep, hold at RPE 9.5 or above. Opened from "Today's Target" in the exercise menu in WorkoutLog ("Last: 8 x 185 @ RPE 7. Try 8 x 190"). Premium only, nothing for free accounts. Kept out of `WorkoutLog.tsx` where possible (hook plus `ExerciseBlock`).
- **Batch E, injury-aware substitution**: `GET /api/exercises/<id>/alternatives` (same primary muscle, different equipment, minus exercises that load the flagged injury areas), "Swap exercise" in `ExerciseBlock`'s menu opening a picker. Premium only, hidden for free accounts. Needs a map from the coach profile's injury options to the muscles and movements they exclude.

### Phase 4 — Enforce it and protect the cost
- [x] **Server-side premium** (§5 "Server-side premium enforcement"): built 2026-10-13. `User.is_premium` (migration `t8u9v0w1x2y3`), RevenueCat webhook, `POST /api/premium/sync`, `is_pro` now reads `has_premium`. **Off until `PREMIUM_ENFORCED=true`**; the turn-on checklist is in CLAUDE.md under Server-side premium
- [x] Gate the AI routes on the server (built 2026-10-13): insights premium only, generate and save premium except the onboarding routine (3 generations a day for free), weekly review trimmed to one part for free
- [ ] `flask grant-beta-premium` re-run on release day (see launch notes)

### Phase 5 — Know whether it's working
> There is no product analytics in the app today, so conversion can't be measured.
- [ ] Pick a tool (PostHog or similar) and add a thin `track()` wrapper; ids only, no PII, same rule as Sentry
- [ ] Events: `paywall_viewed {source}`, `plan_selected`, `purchase_started`, `purchase_completed {plan, trial}`, `purchase_failed {reason}`, `restore_*`, `upsell_shown {where}`, `upsell_tapped`
- [ ] Watch in RevenueCat: trial start rate, trial-to-paid, month-1 and month-3 retention, plan mix
- [ ] First things to test once there's traffic: trial vs no trial, annual-first vs monthly-first, teaser depth on the score screens

### Done when
- [ ] A purchase, a restore, a failure and an expiry each behave correctly on a real device with a sandbox account
- [ ] Every paywall entry point shows a pitch for the thing that was tapped
- [ ] A free user can see their own Strength Score tier and one real insight without paying
- [x] At least two Phase 3 features give a subscriber something new each week (weekly review, fatigue monitor, trends, balance, progress rate)
- [ ] Paywall views and conversions are measured per source

---

## 📍 22. GPS Cardio: Never Lose a Tracked Activity
> Goal: once a user taps Start, the route is on disk before it is on screen, and nothing deletes it without their say-so. Written 2026-10-07 after a user lost a walk.
>
> **What happened.** A user tracked a walk with location set to Always, left the app, and finished. The workout never reached the server (no `POST /api/workouts` from the account in the window). The app shows a "Restore activity?" prompt on the next GPS screen open, which means the app had been killed or restarted mid-walk; they tapped Discard, which deleted the checkpoint with no confirmation. The Apple Health entry they saw came from another source, not Aretē. An earlier walk also drew a straight line across a stretch with no fixes.
>
> **Root causes in the code.**
> 1. The run lives only in `GPSCardioScreen` state. The background task in `utils/gpsTracking.ts` hands points to the mounted screen; with no subscriber (app killed or relaunched) they are dropped.
> 2. The crash checkpoint was written only when the point count hit a multiple of 10, and background batches can jump past it. The restore prompt shows only if the user opens the GPS screen, and `cleanupOrphanedTracking()` ends the OS task on every mount.
> 3. Every fix is joined to the previous one regardless of the time between them, so a gap draws a straight line and adds its distance. The `resumed` flag only skips distance after a pause; the saved polyline still connects across it.
> 4. The offline queue deletes a workout after 3 rejected attempts (4xx), and the GPS save has no request timeout.
> 5. A GPS save never writes to Apple Health or attaches heart rate (only `WorkoutLog` and the queue flush do).

**Status after section 19 Phase 7 (2026-10-14).** Root causes 1 and 2 are fixed in code, not yet released: the run lives in `GpsRunProvider`, so minimizing keeps recording; the checkpoint is written after 10+ new fixes; a killed app's run comes back at launch on the mini bar; and orphaned-task cleanup runs once per launch. Causes 3 to 5 are still open, and nothing yet explains why iOS ends the app.

> **Second report (2026-10-14, a hike at Mohonk, build with the old back arrow, so 1.1.9 or earlier).** "Always" location, started a hike, turned the screen off without closing the app, and came back to the recovery screen showing **0:37 and 0.03 mi**: iOS ended the app about 40 s in, right after the 10-fix checkpoint. The saved hike (33m 6s, 1.07 mi) starts at the lodge where the 37 s run was, then draws one long straight line to the trail: 0:37 plus about 32.5 min is the saved time, so the recovered run was most likely resumed from the trail (to confirm with the user). `resumed` left the jump out of the distance, but the route is saved as one line, so the map joins it. It also showed **2,477 ft of elevation gain on a 1.07 mi hike**: GPS altitude noise getting past the 5 m hysteresis.

### Phase 0 (old): superseded
- [x] The "Unsaved activity" prompt shipped in 1.1.9 (commit 5a98b05). Section 19 Phase 7 replaced it with the mini bar's Unsaved run, which the Unreleased CHANGELOG covers, so its 1.1.9 bullet is no longer worth adding

### Phase 1: Why does iOS end the app with the screen off? (started 2026-10-14)
- [ ] From the user: Settings > Privacy & Security > Analytics & Improvements > Analytics Data, any `JetsamEvent` (memory kill) or Aretē crash log around the hike; their iOS version, Low Power Mode, and whether they tapped Resume after the recovery screen
- [ ] Sentry and TestFlight crash reports for that window (no Sentry token on this machine, so this one is yours)
- [x] Code review of everything that runs while the app is in the background during a run (2026-10-14). Ruled out: background location is configured in the 1.1.9 build (`UIBackgroundModes: ['location']`, the Always permission text); the app has no over-the-air updates or JS reloads that could restart it; a failed token refresh on bad signal does not sign out (only a genuinely invalid refresh token does, and that would show the login screen, not a recovery prompt). **Leading suspect: iOS ending the app for what it does in the background.** With the phone locked on the map screen, 1.1.9 re-renders the whole screen, map included, every second (its clock), moves the map and rebuilds the route on every fix, and has no `AppState` handling at all. That is enough work to draw a memory or CPU termination, and possibly a background-rendering one. The current code still does the same while the run is on the map screen (the 1 s tick and the map follow); only a minimized run avoids it, which is Phase 2
  - Note: Sentry (production DSN is set in `eas.json`) only sees JS errors and native crashes. An OS termination for memory, CPU or background work is not reported there; only the phone's Analytics Data has it, so the user's logs are the deciding evidence
- [ ] Reproduce on the dev build: start a hike on the map screen, lock the phone for 10+ minutes while moving, then check Analytics Data for a kill
- [ ] Optional: read-only check of past GPS routes (ops-maintainer agent, reduced stats only: point count, longest segments, no coordinates) for straight jumps, to see how often this happens
- [ ] Decide whether to add the user id to request logs so a future report can be traced

### Phase 2: No map work while the app is in the background
- [x] (built 2026-10-14, not yet on a device) `GPSCardioScreen` makes no map calls (`animateToRegion`, polyline updates) while `AppState` isn't `active`, and catches up when the app comes back. Also stops its 1 s clock re-render and turns off the map's own location dot and follow while backgrounded; the run bar stops ticking too. New `hooks/useAppActive.ts`; 4 tests in `GpsRunMinimize.test.tsx`. Cheap, and worth doing whatever Phase 1 finds: the screen stays mounted when the phone is locked on the map

### Phase 3: No straight lines across gaps (built 2026-10-16, not yet on a device)
- [x] A time-gap rule in `applyFix` (built 2026-10-16): a fix more than **60 s and 100 m** after the previous one starts a new segment, adds no distance, counts no climb, and is marked `resumed` (`GAP_SECONDS`, `GAP_MIN_METRES`). Raised from the planned 15 s: under trees the accuracy filter drops fixes for tens of seconds, and splitting there would have cut a wooded hike into pieces and lost real distance
- [x] **Decided: a new `Exercise.route_segments` column** (JSON list of encoded polylines, one per segment; migration `u9v0w1x2y3z4`, applied locally, production gets it on deploy). Keep writing `route_polyline` as the full joined line so builds from before this still draw a route. Validated in `_validate_exercises` (a list of strings, at most 500, each at most 500 KB); kept on an edit that doesn't send it. `tests/test_route_segments.py`
- [x] The live map, Cardio Details, Workout Details and the share card's trace draw one line per segment, all through `utils/routeSegments.ts` (falls back to `route_polyline` as one line for older routes)
- [x] Test that best efforts never span a gap (they already skip `resumed` points; the test uses a jump fast enough to fool them but not the plausibility filter)
- [ ] Optional: "GPS signal was lost for 2 min" on the save sheet when a gap was recorded

### Phase 4: Believable elevation gain (filter built 2026-10-16; barometer later)
- [x] **Decided (2026-10-16): a stronger GPS altitude filter now, the barometer later.** Built 2026-10-16 in `utils/gpsMetrics.ts`, not yet on a device: only altitudes rated within 10 m, a **trimmed average of the last 15** (the planned median of 5 still read a flat noisy mile as 157 m), a 10 m threshold, and climb capped at half the ground covered (`MAX_CLIMB_GRADE`), so standing still counts nothing. Tuned on synthetic 1 mile tracks with 15 m jitter and 10 m drift: flat ground 10 to 30 m instead of 120+, a 60 m climb 60 to 75 m. **Trade-off taken:** short hills undercount by about half (two 30 m hills read about 30 m); an 8 m threshold got more back but read 20 to 50 m on the flat, and invented climb was the reported bug. Hikes already saved can't be corrected: routes keep no altitudes
- [ ] Later, with the next native build: the barometer's relative altitude on iOS (`expo-sensors`, a Motion & Fitness permission prompt; check it keeps reporting with the phone locked), falling back to the filter

### Phase 5: A save that can't lose the workout
- [x] **Decided: never drop a rejected workout, lifting or GPS.** (built 2026-10-16, not yet on a device) After `MAX_REJECTED_ATTEMPTS` refusals the queue marks it `rejected` with the server's status and message instead of deleting it, and stops sending it on every reconnect. Home lists each one on a "couldn't sync" card (name, date, reason) with Retry and Delete behind a confirm; the waiting card counts only those still waiting, and the tab's dot counts both. The flush toast says they're kept on Home. Workouts dropped by builds before this can't be recovered
- [x] (built 2026-10-16, not yet on a device) A `timeoutMs` option on `apiFetch`, used by the GPS and WorkoutLog saves and the queue's uploads (`SAVE_TIMEOUT_MS`, 15 s: a save is small, and with the client_id a save cut off early is retried, not lost or doubled). **Behaviour change:** WorkoutLog used to stay open on a network error and wait for Save again; a new workout now goes to the offline queue, as it already did when NetInfo said offline. An edit still stays open (the queue only takes new workouts). GPS keeps its Save Offline prompt
- [x] Idempotency (built 2026-10-16): `newClientId()` per workout, a nullable `Workout.client_id` column unique per user (migration `x2y3z4a5b6c7`, applied locally). A repeat POST returns 200 with the existing workout (same keys, no new PRs); two racing saves are settled by the unique constraint. WorkoutLog keeps one id per open screen (a minimize and resume starts a new one); a GPS run makes its id when it starts and keeps it in the crash checkpoint. `tests/test_workout_client_id.py`
- [ ] **Decided: activity type and distance only** (no calories, no route). Write GPS saves to Apple Health and Health Connect with the right activity type (running, cycling, walking, hiking; today every cardio workout goes in as running) and the distance, with the run's real start time, and attach heart rate as WorkoutLog does, including for workouts uploaded later from the queue

### Phase 6: Pick a run back up after a kill
- [ ] **Decided: Keep Recording.** A recovered run gets Keep Recording next to Save and Discard, continuing as a new segment through `afterGap` (after Phase 3, or it draws a line from the kill point)
- [ ] Checkpoint every 5 s while running and when the app goes to the background, instead of every 10 fixes, so a kill loses at most about 5 s

### Done when
- [ ] On a device: walk with the phone locked on the map screen and minimized, force-quit mid-walk and Keep Recording, pause and resume, and switch to airplane mode before Stop. The full route is recoverable in every case, with no straight line across a gap, pause or resume
- [ ] No path deletes a tracked activity without a second confirmation
- [ ] A workout the server rejects stays on the phone and is visible
- [ ] A hike's elevation gain is in the right range

---

## 🧠 23. A Coach That Learns
> Ongoing (owner, 2026-10-16): keep making insights and the Coach better as the app grows. Insights today are generated fresh each refresh and never stored; the only memory the Coach has of a user is their training data plus `insight_feedback` votes. The order below measures first, then gives the Coach memory, then uses it.

### Built
- [x] Helpful / not helpful thumbs on each insight, stored in `insight_feedback` and quoted into the next insights prompt (last 20 votes, 90 days); MRV and fatigue flags still win (2026-10-15)
- [x] Reason chips on a thumbs down (`known` / `irrelevant` / `wrong` / `vague`), each with its own instruction to the Coach; "Thanks. The Coach will use this." after a vote; "Shaped by your feedback" on a batch the votes steered; a word-for-word repeat insight keeps its vote (2026-10-16)
- [ ] On a device: vote, pick a reason, refresh, and check nothing flashes or shifts

### Next, in order
- [ ] **Measure before tuning.** An `/admin` page with the helpful rate per insight type and per reason, and the most voted-down titles. Without it no prompt change can be judged
- [ ] **A prompt check to run before any prompt or model change.** A handful of fixture users (new, plateaued, overreaching, cardio-only, kg) through `_build_insights_context` → the model → `_verify_insights`, reporting how many insights `_is_grounded` drops, length, and banned copy (em dashes, exclamation marks). Not in the pytest suite, since it calls the API
- [ ] **Treat "Looks wrong" votes as bugs.** List them on the admin page with the insight text, so a misread of the data becomes a fix to the context or `_is_grounded` rather than only a nudge to one user's prompt
- [ ] **Store generated insights** (an `insights` table, one row per insight per batch). Votes then key on an id instead of the title and body text, and the Coach can see what it said before
- [ ] **Follow-through.** With stored insights, tell the Coach last batch's suggestions and let it check them against the data ("Last week: add 2 sets of rows. You added 3."). The biggest step from a report toward a coach
- [ ] **A hard rule under the soft nudge.** 3+ not-helpful votes on a type with no helpful ones → `_verify_insights` ranks that type last. Warnings (deload, MRV, fatigue) exempt
- [ ] **Votes in the weekly review prompt** (`_build_insights_prompt(review=True)` skips them today)
- [ ] **CoachProfile on the server.** Goal, experience, injuries and notes live only in AsyncStorage (`coach_profile_${uid}`), so a reinstall loses them and nothing server-side (scheduled insights, notifications) can read them
- [ ] **Implicit signals.** Opening a suggested exercise or starting the routine an insight pointed at counts as a strong helpful. Needs insights to carry an action first
- [ ] **Re-evaluate the model.** Insights and the review run on `claude-haiku-4-5-20251001`; compare newer models through the prompt check above before switching
