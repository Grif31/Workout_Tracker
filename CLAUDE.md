# Aretē Fitness — Project Guide

## Overview

**App name:** Aretē (ē = Unicode macron-e, U+0113 — use in UI copy, not in file names)  
**Domain:** aretefitnessapp.com | **Support:** support@aretefitnessapp.com  
**iOS bundle:** `com.aretefitness.app` | **Android package:** `com.aretefitness.app`  
**Expo project ID:** `356b88e9-4302-43fc-b50a-6d83030b8fa6`  
**Deep link scheme:** `aretefitness://`

---

## Common Commands

### Frontend (`src/workout-tracker-native/`)
```bash
npx jest --maxWorkers=2     # run all frontend tests (default parallelism causes false timeout failures on this machine)
#   testTimeout is 15s (package.json): the first test in a screen file pays that file's one-time render/module init
npx jest __tests__/Foo.test.tsx --verbose   # run single test file
npx tsc --noEmit            # type check — covers __tests__/ and any not-yet-wired file
npx expo install <pkg>      # install Expo-compatible package version
#   SDK upgrades: `npx expo install expo@^N --fix` can fail with ERESOLVE, because it updates dependencies and
#   devDependencies in two separate npm runs and the not-yet-updated jest-expo pins the old @react-native/jest-preset.
#   Write the versions `expo install --check` lists into package.json and run one `npm install` instead.
#   @react-native/jest-preset is a required peer of jest-expo and must match react-native exactly; bump them together.
#   Before pushing, prove EAS can install: `npm_config_legacy_peer_deps=false npm ci` (only the development profile sets legacy peer deps)
```

### Backend (`src/`)
```bash
./venv/Scripts/flask.exe run --debug          # start Flask dev server
./venv/Scripts/flask.exe db migrate -m "msg" # generate migration
./venv/Scripts/flask.exe db upgrade           # apply migrations
./venv/Scripts/pip.exe install <pkg>          # install Python package — then pin it in requirements.txt
#   requirements.txt pins every version (direct and transitive) and src/.python-version pins Python 3.13, so tests run the versions Nixpacks deploys.
#   Upgrade by bumping pins, installing into a fresh venv, running the suite, then refreezing the transitive section.
#   colorama/tzdata carry Windows-only markers; keep them, or Linux installs pick up packages they don't need
./venv/Scripts/python.exe -m pytest tests/ -q --tb=short   # run all backend tests (~30s; conftest swaps in cheap password hashing, the prod 1M-iteration pbkdf2 made this ~14 min)
python -m pytest tests/test_foo.py -v        # run single test file
```

---

## Structure gotchas

The tree is `ls`-derivable; these are the parts it can't tell you:

- Health sync (`healthKit.ts`, `healthConnect.ts`) and `GPSCardioScreen` need an EAS build, not Expo Go. Payments are iOS only.
- `screens/TrainingTab/CoachCharacter.tsx` is UNUSED (no longer rendered). The tab label is "Coach" but the route stays `TrainingTab`.
- `StrengthScoreScreen`/`EnduranceScoreScreen` use `SCORE_RANK_COLORS` (`constants/strengthRanks.ts`), NOT the Greek rank colors; both share `ScoreRing` and `PercentileBar`.
- ALL share cards live in `components/share/`. `components/coach/` holds modals whose only caller is CoachScreen.
- `utils/templatePrefill.ts` is the only way a template/routine day becomes a WorkoutLog prefill. `utils/routineRotation.ts` is mirrored by `_routine_rotation_context` in `routes/ai_routes.py`.
- `strength_score_routes.py` also serves the endurance score and score history; `utils/endurance_standards.py` milestone floats mirror `constants/cardioMilestones.ts`.
- Legal pages are Jinja templates in `src/templates/`; `/admin/*` uses HTTP Basic Auth via `ADMIN_PASSWORD`.

---

## Frontend Conventions

Most frontend rules (theme tokens, styles, API calls, navigation) are below. The AsyncStorage key tables, chart y-axis rule, WorkoutLog prefill, Home card sizes and in-app-purchase testing live in `src/workout-tracker-native/CLAUDE.md`, loaded when working in the app.

### Theme — always use tokens, never hardcode
```typescript
const { colors } = useTheme();           // color tokens
import { spacing } from '../theme/spacing';     // xs=4 sm=8 md=16 lg=24 xl=32
import { typography } from '../theme/typography'; // fontSize xs=11 sm=14 md=16 lg=20 xl=22 xxl=28
```

**Approved hardcoded colors** (everything else must use `colors.*`):
- `#fff` / `#ffffff` — text on solid accent/colored backgrounds only
- `'rgba(0,0,0,0.6)'` — modal backdrop overlay

**Never hardcode PR gold.** Use the constants from `constants/prColors.ts`:
```typescript
import { PR_GOLD, PR_GOLD_TEXT, PR_GOLD_BG } from '../constants/prColors';
// PR_GOLD      = '#f9de73'  — PR indicators (trophies, laurel borders, PR banners)
// PR_GOLD_TEXT = '#ad9206'  — dark text on gold/cream backgrounds
// PR_GOLD_BG   = '#FFF3C4'  — cream background for PR banners
```
Note: `#FFD700` (bright gold) still appears in `greekRanks.ts` and `CoachCharacter.tsx` as the **Aretē rank color** — that is intentional and separate from PR gold.

### Styles
- Always `StyleSheet.create` — no static multi-property inline styles
- Wrap `createStyles(colors)` in `useMemo(() => createStyles(colors), [colors])`
- Dynamic single-property overrides inline are fine: `style={[styles.foo, { color: colors.accent }]}`

### API calls
```typescript
import { apiFetch } from '../utils/api';
const res = await apiFetch('/api/workouts', { method: 'POST', ... });
```
`apiFetch` automatically attaches the JWT and base URL — never call `fetch` directly.

### Navigation — new screens
1. Create file in `screens/<Tab>/`
2. Add to the matching stack in `navigation/<Tab>Stack.tsx`
3. Add type to `navigation/types.ts`
4. Navigate via `navigation.navigate('ScreenName', { params })`

### Navigation — cross-tab navigation MUST pass `initial: false`
```typescript
navigation.navigate('TrainingTab', { screen: 'StrengthScore', initial: false })
```
Without it, the sub-screen becomes the tab stack's only route — its back button bubbles to the tab navigator (jumps to Dashboard) and the hidden tab bar strands the user.

## Backend Conventions

### Every new route must:
- Be `@jwt_required()` protected — exceptions: auth endpoints, `legal_routes.py` (public pages), `/health` (public probe), and `/admin/*` (HTTP Basic Auth via `ADMIN_PASSWORD` env var instead)
- Live in the appropriate blueprint in `routes/`
- Be registered in `app.py`

### Schema changes always need two files:
1. Update `models.py`
2. Generate + apply migration: `flask db migrate -m "description"` then `flask db upgrade`

### Migration chain
Each migration's `down_revision` must point to the previous migration's `revision`. Check the latest revision before creating a new one.

### "Today" and week boundaries — never `date.today()` in request code
The server runs on UTC. Use `user_today()` from `utils/local_date.py`, which reads the app's `X-Local-Date` header (sent by `apiFetch`) and only trusts it within a day of UTC. `date.today()` rolls "this week" over on Sunday afternoon in the Americas.

### Auth tokens: anything that changes a credential bumps `token_version`
Every JWT carries the user's `token_version` as a `tv` claim (added by `additional_claims_loader` in `app.py`, so every token-minting path gets it for free), and `token_in_blocklist_loader` rejects a mismatch on every request. Bumping it is the only way to revoke outstanding tokens: password change, password reset, and a verified social sign-in taking over an unverified password account all do. A new route that changes a credential must bump it too, and if the caller should stay signed in, return a fresh pair the way `change_password` does. A token with no `tv` reads as 0.

`User.email_verified` is set by Apple/Google sign-in and by a completed password reset, never by signup. `social_auth` links by email, so when it lands on an unverified password account it wipes that password and bumps `token_version`: an unproven account for someone else's address must not outlive the address's real owner signing in.

### Response shape convention
```python
return jsonify({ 'message': 'ok', ...data }), 200   # success
return jsonify({ 'message': 'error reason' }), 400   # client error
```

---

## Key Data Model Notes

- **Exercise types:** `'strength'` (default), `'cardio'`, or `'duration'` (timed holds — planks, wall sits; sets store the hold in `cardio_duration` as minutes, UI edits seconds; no reps/weight, no PRs, stays a strength workout)
- **Set types:** `'N'` (normal), `'W'` (warm-up), `'D'` (drop set), `'F'` (failure)
- **PR types (strength):** `max_weight`, `estimated_1rm`, `max_reps` (per weight, `weight_context` = the weight) — never surface `estimated_1rm` as a PR label to users
- **PR types (cardio):** `best_time` (`weight_context` = distance milestone in km) and `best_distance` (`weight_context` = duration milestone in minutes)
- **PR history:** `PersonalRecord` rows are upserted in place (current bests only). `PREvent` is the append-only history — one row per PR moment with `previous_value` and `workout_id`; written by every upsert branch in `workout_routes.py` and rebuilt by `_recompute_prs_for_templates`'s chronological replay on workout edit/delete. `improved_by` is sign-normalized (positive = better; `best_time` improves downward). Backfill for pre-existing data: `flask backfill-pr-events --apply`.
- **Cardio sets** have: `cardio_duration` (minutes), `distance`, `distance_unit` ('km'|'mi'), `intensity`
- **GPS cardio exercises** also store: `route_polyline` (encoded Google polyline string), decoded with `@mapbox/polyline`
- **GPS best efforts:** `cardio_best_efforts` rows hang off an `Exercise` — the fastest window covering each distance milestone and the furthest reached inside each duration milestone, scanned on the phone at save time by `utils/bestEfforts.ts` and sent as the exercise payload's `best_efforts`. `_compute_and_upsert_cardio_prs` treats each as one more bout, so a measured 5K beats the whole-run extrapolation through the upsert that already keeps the best. They are **stored** rather than recomputed for two reasons: `route_polyline` encodes latitude/longitude only, so per-point timing is gone after the save (no backfill is possible for runs recorded before this shipped), and `_recompute_prs_for_templates` rebuilds PRs from what sits on the Exercise — an effort that lived only in the request would be wiped by the next edit of any workout for that exercise. Editing a GPS run's distance or duration by hand clears its efforts, since the user is saying the trace was wrong. The milestone floats are mirrored in `constants/cardioMilestones.ts` and a test fails if the two lists drift
- **`workout_type`** — computed field in `Workout.to_dict()`, derived from `exercise_type` on exercises; no DB column. `'cardio'` only when **every** exercise is cardio; a lifting session with a cardio warm-up is `'strength'`. Cardio workouts also get `cardio_duration`, `distance`, `distance_unit` in the dict, totalled across every bout (distances in the first bout's unit).
- **Bodyweight volume:** for `Bodyweight`/`Weighted` equipment, volume adds the user's bodyweight-at-the-time scaled by `ExerciseTemplate.bodyweight_load_factor` (fraction of bodyweight the movement shifts — push-up ~0.6, sit-up ~0.35, pull-up ~1.0; `NULL` → 1.0). All volume math goes through `compute_effective_weight(weight, equipment, bodyweight, load_factor)` in `utils/volume.py`. New library/custom exercises get a factor from the name heuristic `derive_bodyweight_load_factor`. After adding the column or retuning any factor, run `flask backfill-workout-volume --apply` to recompute stored `Workout.volume`. Never use effective weight for PR/strength-score logic — those read raw `Set.weight`.
- **Weight units:** per user — `user.weight_unit` is `'kg'` or `'lbs'`; delta: kg=2.5, lbs=5. Stored set weights, PR values (both `personal_records` and `pr_events`, incl. `previous_value`), and bodyweight logs are always in the user's *current* unit — switching units bulk-converts them (`_convert_stored_weights` in `user_routes.py`). Exception: `Workout.volume` is always lbs. A stats endpoint that reports a volume total next to `weight_unit` (progress buckets, weekly summary and its history, profile lifetime volume) converts it with `volume_in_user_unit` in `utils/volume.py`; summing `Workout.volume` raw shows kg users pounds labelled kg. The workout POST's `total_volume` stays lbs, and the app converts it (`toExactVolume`). Body measurements (`body_measurements`) have no unit column: they follow the weight unit (lbs → inches, kg → cm, `lengthUnitFor` in `utils/bodyMetrics.ts`) and `_convert_stored_weights` converts them ×/÷2.54 to the tenth on a switch.
- **Adding a column that stores a weight (or weight-derived value):** it MUST be wired into `_convert_stored_weights` AND classified in `tests/test_unit_conversion_registry.py` (CONVERTED or EXEMPT-with-reason). That test name-scans all models for weight/value/volume columns and fails on unclassified ones — a missed column drifts out of unit after a kg↔lbs switch.
- **Heart rate:** `Workout.avg_heart_rate` / `max_heart_rate`, integer bpm, nullable. Read from Apple Health after the workout POST succeeds and attached via PATCH (`utils/heartRateSync.ts`) — never folded into the POST, because a native HealthKit query must not delay a save. NULL is meaningful: it means no wearable or sync off, so never default these to 0. Aggregation lives in `utils/heartRate.ts`, which imports nothing native and so is unit-testable on any platform; it drops samples outside 20-260 bpm, mirroring the `validate.Range` in `schemas.py`. Any wearable that writes to Apple Health works (Apple Watch, chest strap, Whoop) — there is no watchOS target and no `WCSession`
- **iOS health library:** `@kingstinct/react-native-healthkit` (a Nitro/New-Architecture module), NOT `react-native-health`. The latter is a legacy bridge module (no `codegenConfig`, `s.dependency 'React'`) and RN 0.82+ is bridgeless-only, so it never registered and every call threw. Don't reintroduce it or any other old-arch native module
- **Routine rotation:** a routine's days are a rotation, not a weekly calendar (`RoutineDay` has no weekday). "Up next" is the day after the last one logged, whatever the week; a layoff of 14+ days restarts at day 1. Workouts match days by name (trimmed, case-insensitive), and a repeated label goes to the next day with that label after the current position. Implemented twice and kept identical: `utils/routineRotation.ts` (Home's routine card) and `_routine_rotation_context` in `routes/ai_routes.py` (AI Coach prompts), each with the same test cases
- **`starter` flag:** `Routine.starter` / `WorkoutTemplate.starter` mark what onboarding generated (`POST /api/ai/save` with `starter: true`, which also flags each day's template). The free 5-template / 2-routine caps (client-side, `CoachScreen`) skip them, so nobody hits a wall on day one.
- **Weekly review:** `POST /api/ai/weekly-review` returns `went_well` / `lagged` / `next_change` from `_build_insights_context`. The app sends the summary week's Monday as `week_start`, and the context is read `as_of` that week's end (every query bounded, so nothing after the week leaks in); without `week_start` it reads the rolling last 7 days like insights. Parts citing a lift or numbers the Coach wasn't given are dropped by `_is_grounded`, shared with insights, so fewer than three can come back. JSON key order isn't preserved (Flask sorts it): the app lays the parts out itself. Free-vs-premium is client-side until server premium (TODO §21 Phase 4).
- **Premium analytics (all client-gated until server premium):** `/api/stats/muscle-volume` also returns `session_count`, `weekly_history` (the 4 weeks before, oldest first), `this_week_total` (raw sets) and `last_week_to_date_total` (last week up to the same weekday, so a partial week isn't compared with a whole one); `/api/stats/progress` buckets carry `density` (volume per timed minute, user's unit) and `metrics_logged.density`; `/api/stats/pr-velocity` fits a line through each lift's best estimated 1RM per workout over 12 weeks (`utils/pr_velocity.py`: plateau = flat over the last 8 weeks, never claimed before the data spans them); `/api/exercises/<id>/alternatives` ranks same-muscle, other-equipment swaps and drops what loads a flagged injury by name (`utils/exercise_alternatives.py`). `/api/stats/exercise/last-session` sets carry `rpe` for the in-workout next-session target (`utils/overloadTarget.ts`, rules not AI).
- **Custom exercises:** `ExerciseTemplate.user_id` — NULL = global library exercise, set = that user's private custom exercise
- **RPE:** 1–10 scale, optional per set, only shown when user enables it in workout settings
- **User gender:** `user.gender` is `'male'` | `'female'` | `None` — used for strength score percentile calculations
- **Scores:** Strength Score (lift percentiles vs bodyweight) and Endurance Score (running pace percentiles, best-within-tier: core 5K+ 70% / speed 400m-1mi 30%) share the `STRENGTH_TIERS` percentile tiers and both write to `strength_score_snapshots`, separated by `score_type` (`'strength'` | `'endurance'`) — every snapshot read must filter on it. They also share their hero ring (`components/ScoreRing.tsx`) and percentile bars (`components/PercentileBar.tsx`), since the two screens are meant to read as one screen for two metrics — a presentation change belongs in those components, never in one screen. Neither score adds Greek Rank points; the higher one only gates the top two ranks (see Greek Rank below)
- **Greek Rank Volume (30%)** is weekly training load, not workout count (Consistency and Dedication already count workouts): working sets (warm-ups and rows with no reps excluded; a timed-hold set counts as 1) plus cardio minutes / 3, capped at 40 per workout, averaged over 8 weeks, scored by `compute_training_load_score` in `utils/strength_standards.py`
- **Greek Rank:** the score is effort only, `consistency*0.40 + dedication*0.30 + volume*0.30` (`compute_greek_score`), so every user gets a rank with no gender or bodyweight. Titan also needs the higher of the Strength/Endurance Scores at >= 50th percentile and Aretē >= 80th (`GREEK_RANK_PERFORMANCE_GATES`, applied by `apply_greek_rank_gates`); a user who misses a gate is held one rank below it. Read the rank from `GET /api/stats/greek-rank` (no gender required, returns `next_gate`, `gates`, `held_by_gate`, `profile_missing`) via `_greek_rank_data()` in `strength_score_routes.py`. `strength-score` still returns `greek_rank`/`greek_score`/`greek_score_components` from the same helper only for app builds 1.1.6 and earlier; new code must not read the rank from there, since it returns 422 without gender. Frame unlocks and rank-circle state follow the rank held, never the raw score, because a gated score can sit inside a band the user hasn't unlocked

---

## Workout Session Flow

1. User opens WorkoutLog (sets `isWorkoutOpen = true` in WorkoutSessionContext)
2. MiniWorkoutBar is hidden while WorkoutLog is open
3. User presses minimize → `saveSession()` → navigates away → MiniWorkoutBar appears
4. AppState background events: WorkoutLog handles notification when open; MiniWorkoutBar handles it when minimized (never both at once)
5. Resume → navigate to WorkoutLog → restores from session → `clearSession()`
6. Discard → `clearSession()` → cancels live notification

---

## Things to Avoid

- Never hardcode colors outside the approved list above — and never hardcode PR gold hex values; use `PR_GOLD` / `PR_GOLD_TEXT` / `PR_GOLD_BG` from `constants/prColors.ts`
- Never call `fetch` directly — use `apiFetch`
- **Don't drop `EXPO_PUBLIC_USE_RN_FETCH=1`** from `eas.json` (all three profiles) or your local `.env`. SDK 56 replaces the global `fetch` with `expo/fetch` unless it's set, and the progress-photo upload in `MeasurementsScreen` sends a React Native `{ uri, name, type }` FormData file, which `expo/fetch` isn't documented to accept. The flag is read at bundle time, so a build without it silently changes networking. Removing it is a deliberate migration: test the photo upload on a device first
- Never commit `.env` files
- Don't add features, refactor, or abstract beyond what the task requires
- Don't add error handling for scenarios that can't happen
- Don't write comments that explain WHAT code does — only WHY (non-obvious constraints)
- Schema changes without a migration will break production
- **Never pass a bare function to `FlatList`'s `ListHeaderComponent`** (`ListHeaderComponent={renderHeader}`) when the header contains stateful or expensive children (charts, forms) — a fresh function identity every render makes FlatList treat it as a new component type and remount the whole subtree instead of re-rendering it, discarding child state/memoization and replaying entrance animations. Call it and pass the built element instead: `ListHeaderComponent={renderHeader()}`.
- **Never use `date.toISOString()` to build a date string for the backend** — it outputs UTC and shifts the date in US timezones. Always use local methods: `` `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` ``
- **Never `new Date(x)` a bare `"YYYY-MM-DD"` from the API** (e.g. `/api/stats/exercise` history dates) — it parses as UTC midnight, the day before in the Americas. Use `parseApiDate` from `utils/date.ts`. Jest runs in `America/Los_Angeles` (`jest.globalSetup.js`) so this class of bug fails in tests, not just for users.
- **Guardrail tests scan the whole codebase:** `src/tests/test_route_guardrails.py` walks the Flask url_map (auth on every non-public route, no 500s for a fresh user, malformed bodies or garbage query params), and `__tests__/codeGuardrails.test.ts` scans the app source (no raw `fetch`, `initial: false` on cross-tab navigates, listeners and intervals cleaned up, no AsyncStorage key literal in two files; shared keys live in `constants/storageKeys.ts`). A new public route goes in that test's `PUBLIC` set.

---

## Production Deployment

- **Backend:** Railway — auto-deploys from `main` branch push to GitHub
- **Live URL:** `https://workouttracker-production-601f.up.railway.app` (also `aretefitnessapp.com`)
- **DB migrations on deploy:** `flask db upgrade` runs automatically via `railway.json` `startCommand`
- **Frontend:** EAS Build — `eas build --profile production --platform ios` for App Store
- **Liveness probe:** `GET /health` — public, returns 200 + DB ping status. Check from PowerShell with `curl.exe` (not bare `curl`, which PowerShell aliases to `Invoke-WebRequest`): `curl.exe https://workouttracker-production-601f.up.railway.app/health` (local dev: `curl.exe http://localhost:5000/health`)
- **Railway CLI:** installed and linked to project "Arete Fitness APp" (services: `Postgres`, `Workout_Tracker`); run from `src/`
- **`railway run` gotcha:** it executes locally with prod env vars, but the injected `DATABASE_URL` host (`postgres.railway.internal`) is unreachable from this machine — to hit the prod DB, fetch `DATABASE_PUBLIC_URL` from `railway variables --service Postgres` and set it as `DATABASE_URL` before running the command
- **Backend env vars (Railway):** `DATABASE_URL`, `JWT_SECRET_KEY`, `APPLE_BUNDLE_ID` (comma-separated: Apple sets a token's audience to the requesting app's bundle ID, so it lists `com.aretefitness.app` and the dev build's `com.aretefitness.app.dev`), `ADMIN_PASSWORD` (admin pages), `RAPIDAPI_KEY` (ExerciseDB image suggest), mail/SMTP creds
- **Ops work** (logs, prod DB queries, rollbacks, EAS builds): use the `ops-maintainer` agent — runbooks live in `.claude/agents/ops-maintainer.agent.md`
