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

---

## 🔒 5. Security & Production Readiness
> Required before real users are on the app.

- [x] **CORS lockdown**
  > Right now the Flask backend accepts requests from *any* website or app. Once deployed, a bad actor could build a site that calls your API using a logged-in user's credentials from their browser. Locking CORS to your app's production domain means only your Expo app (and your own domains) can talk to the backend.
  - [x] Replace `CORS(app)` (allows all origins) with a whitelist of your production domain(s) via `CORS_ORIGINS` env var

- [ ] **Rate limiting**
  > Without rate limiting, an attacker can try thousands of username/password combinations per second against `/api/login` until they get in (a "brute force" attack). `flask-limiter` adds a simple rule like "max 10 login attempts per minute per IP", making brute force attacks impractical.
  - [ ] Add `flask-limiter` to `POST /api/login` and `POST /api/signup` to prevent brute force

- [ ] **JWT token expiry + refresh flow**
  > Currently, a JWT token lives forever — if someone steals a token (from a compromised device or a network intercept), they have permanent access to that user's account. Short-lived access tokens (e.g. 15 min) limit the damage window. The refresh token silently gets a new access token in the background so the user never has to log in again during normal use.
  - [ ] Set `JWT_ACCESS_TOKEN_EXPIRES` in Flask config (e.g. 15 min)
  - [ ] Add `POST /api/refresh` endpoint using a refresh token
  - [ ] On the frontend, detect 401 responses and silently refresh the token before retrying

- [ ] **Centralised error handling**
  > Without this, Flask crashes return raw Python tracebacks (leaking internal file paths and library versions to anyone who can see the response), and inconsistent error shapes make the frontend harder to handle. A single `@app.errorhandler` ensures every error returns clean `{ "message": "..." }` JSON. Structured logging lets you search and alert on errors in production (e.g. via Sentry) instead of tailing raw logs.
  - [ ] Add `@app.errorhandler` for 400, 401, 404, 500 in Flask returning consistent JSON
  - [ ] Replace all bare `except Exception` blocks with specific exception types
  - [ ] Add structured logging (Python `logging` module or Sentry)

- [ ] **Frontend error handling**
  > If an API call fails silently, the user just sees a blank screen or stale data with no explanation. A React error boundary catches JavaScript crashes and shows a friendly recovery screen instead of a white crash. Network error toasts tell the user "something went wrong, try again" so they don't think the app is broken. Token expiry handling automatically boots the user to the login screen if their session can't be renewed.
  - [ ] Add a top-level React error boundary component
  - [ ] Add network error toasts (show a banner when API calls fail)
  - [ ] Handle token expiry on the frontend — redirect to login if refresh fails

- [ ] **Pagination**
  > Without pagination, `GET /api/workouts` fetches every workout a user has ever logged in one request. After a year of daily use that could be 300+ workouts with all their exercises and sets — slow to load, heavy on the server, and a bad experience on slow connections. Pagination loads a small page at a time and fetches more as the user scrolls.
  - [ ] Add `?page=` and `?per_page=` params to `GET /api/workouts`
  - [ ] Update ProfileScreen and DashboardScreen to paginate workout history

---

## 📱 6. App Store / Play Store Submission
> Everything needed to actually submit to Apple and Google.

- [ ] **App assets**
  - [ ] Design and export app icon (1024×1024 for iOS, 512×512 for Android)
  - [ ] Design splash screen
  - [ ] Add all required icon sizes via Expo config

- [ ] **app.json / app.config.js**
  - [ ] Set proper `bundleIdentifier` (iOS) and `package` (Android)
  - [ ] Set `version` and `buildNumber` / `versionCode`
  - [ ] Declare required permissions (only what's actually needed)
  - [ ] Set `scheme` for deep linking

- [ ] **EAS Build setup**
  - [ ] Install and configure EAS CLI (`npm install -g eas-cli`)
  - [ ] Run `eas build:configure`
  - [ ] Set up build profiles for preview and production
  - [ ] Test a production build on a real device

- [ ] **Legal requirements (both stores require these)**
  - [ ] Write and host a Privacy Policy (what data is collected and why)
  - [ ] Write Terms of Service
  - [ ] Link to both in the Settings screen and in store listing

- [ ] **Store listings**
  - [ ] Write App Store description (short + long)
  - [ ] Write Play Store description
  - [ ] Prepare screenshots (iPhone 6.9", iPhone 6.5", Android tablet)
  - [ ] Choose category (Health & Fitness) and age rating

- [ ] **Backend hosting**
  - [ ] Deploy Flask backend to a cloud host (Railway, Render, Fly.io, etc.)
  - [ ] Set up PostgreSQL in production (not SQLite)
  - [ ] Set `DATABASE_URL`, `JWT_SECRET_KEY` as environment secrets
  - [ ] Point `EXPO_PUBLIC_API_URL` to the live backend URL

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

- [ ] **Improve AI generation**
  - [ ] Let user preview the generated routine before saving
  - [ ] Allow regeneration / manual edits before confirm
  - [ ] Add ANTHROPIC_API_KEY setup instructions to README

---

## ✨ 8. Future Features
> Not needed for launch, but good to keep in mind.

- [x] Dark mode (respect device system setting)
- [ ] **Weekly routine schedule** — assign routine days to specific weekdays (e.g. Mon = Push, Wed = Pull) so the Dashboard can suggest today's session
- [ ] **Export workout history as CSV** — `GET /api/workouts/export` endpoint so users can download their data
- [ ] Share a workout as an image / card
- [ ] Push notifications (rest timer alerts, workout reminders)
- [ ] Workout notes / photo attachments (capture form on a lift)
- [ ] Muscle group body diagram on Exercise Detail — highlight primary/secondary muscles
- [ ] Supersets — group two exercises together in a workout
- [ ] Plate calculator — "what plates do I load for 225 lbs?"
- [ ] Apple Health / Google Fit integration
- [ ] Workout streaks and achievement badges
- [ ] Social / friend leaderboards
