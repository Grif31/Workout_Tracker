# Aretē Workout Tracker — Project Guide

## Overview

**App name:** Aretē Workout Tracker in full (titles, legal pages, emails, store listing); Aretē in running copy and the home screen label (ē = Unicode macron-e, U+0113 — use in UI copy, not in file names). Never "Aretē Fitness": `aretefitness` survives only in identifiers (domain, bundle ID, scheme)  
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
#   SDK upgrades / proving EAS can `npm ci`: see docs/feature-reference.md. Never `npm audit fix --force` (breaks Expo's pinned versions)
```

### Backend (`src/`)
```bash
./venv/Scripts/flask.exe run --debug          # start Flask dev server
./venv/Scripts/flask.exe db migrate -m "msg" # generate migration
./venv/Scripts/flask.exe db upgrade           # apply migrations
./venv/Scripts/pip.exe install <pkg>          # install Python package — then pin it in requirements.txt
#   requirements.txt pins every version (direct + transitive); Python 3.13 via src/.python-version. Upgrade procedure: docs/feature-reference.md
./venv/Scripts/python.exe -m pytest tests/ -q --tb=short   # run all backend tests (~30s; conftest swaps in cheap password hashing, the prod 1M-iteration pbkdf2 made this ~14 min)
python -m pytest tests/test_foo.py -v        # run single test file
```

---

## Structure gotchas

The tree is `ls`-derivable; these are the parts it can't tell you:

- Health sync (`healthKit.ts`, `healthConnect.ts`) and `GPSCardioScreen` need an EAS build, not Expo Go. Payments are iOS only.
- Tabs are Home · Progress · Coach · Profile. Progress (`ProgressTab`, `screens/ProgressTab/`) is `ProgressScreen`: an Overview segment (`ProgressOverview`: this week, scores, trends chart, muscle volume) and an Exercises segment (`ExercisesScreen`, mounted on first visit); its stack also holds `StrengthScore`, `EnduranceScore`, `WeeklySummary` and `ExerciseDetail`. Coach keeps the route name `TrainingTab`: `CoachScreen` with Plans (routines, templates, Up Next) and Coach (AI) segments, opening on Plans when there's an active routine. `screens/TrainingTab/CoachCharacter.tsx` is UNUSED (no longer rendered).
- `StrengthScoreScreen`/`EnduranceScoreScreen` use `SCORE_RANK_COLORS` (`constants/strengthRanks.ts`), NOT the Greek rank colors; both share `ScoreRing` and `PercentileBar`.
- ALL share cards live in `components/share/`. `components/coach/` holds modals called only from the Coach and Progress tabs (`CoachScreen`, `ProgressOverview`).
- `utils/templatePrefill.ts` is the only way a template/routine day becomes a WorkoutLog prefill. `utils/routineRotation.ts` is mirrored by `_routine_rotation_context` in `routes/ai_routes.py`.
- `strength_score_routes.py` also serves the endurance score and score history; `utils/endurance_standards.py` milestone floats mirror `constants/cardioMilestones.ts`.
- Legal pages are Jinja templates in `src/templates/`; `/admin/*` uses HTTP Basic Auth via `ADMIN_PASSWORD`.

---

## Frontend Conventions

Most frontend rules (theme tokens, styles, API calls, navigation) are below. App-only rules (AsyncStorage keys, charts, WorkoutLog prefill, widgets, Live Activities, GPS run) are in `src/workout-tracker-native/CLAUDE.md`, loaded when working in the app; long-form detail is in `docs/app-reference.md`.

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
// PR_GOLD_TEXT = '#7A6000'  — dark text on the cream PR_GOLD_BG only (too dark for dark mode)
// PR_GOLD_BG   = '#FFF3C4'  — cream background for PR banners
```
On a themed surface (anything on `colors.surface`/`background`), use `colors.prGold` for PR text and icons and `colors.prGoldBorder` for PR borders, laurels and glows: they are `PR_GOLD` in dark mode and darker golds in light mode, where `PR_GOLD` is 1.3:1 on white. Raw `PR_GOLD` is for surfaces that are dark in both themes (share cards).
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
navigation.navigate('ProgressTab', { screen: 'StrengthScore', initial: false })
```
Without it, the sub-screen becomes the tab stack's only route — its back button bubbles to the tab navigator (jumps to Dashboard) and the hidden tab bar strands the user.

## Backend Conventions

### Every new route must:
- Be `@jwt_required()` protected — exceptions: auth endpoints, `legal_routes.py` (public pages), `/health` (public probe), `/api/webhooks/revenuecat` (authenticated by `REVENUECAT_WEBHOOK_SECRET` in the Authorization header, since RevenueCat has no JWT), and `/admin/*` (HTTP Basic Auth via `ADMIN_PASSWORD` env var instead)
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
- **PR types (cardio):** `best_time` (`weight_context` = distance km), `best_distance` (= duration min); rides use cycling milestones and add `longest_distance`/`max_elevation` at `weight_context` -1
- **PR history:** `PersonalRecord` = current bests, upserted. `PREvent` = append-only history, written by every upsert branch and rebuilt by `_recompute_prs_for_templates` on edit/delete. `improved_by` positive = better
- **Cardio sets:** `cardio_duration` (min), `distance`, `distance_unit`, `intensity` (pace per set's unit), GPS `elevation_gain`/`max_speed`; GPS runs also store `route_polyline`
- **GPS best efforts** (`cardio_best_efforts`) are stored, not recomputed: per-point timing is gone after save. Milestones mirrored in `constants/cardioMilestones.ts` (test enforces)
- **`workout_type`** — computed field in `Workout.to_dict()`, derived from `exercise_type` on exercises; no DB column. `'cardio'` only when **every** exercise is cardio; a lifting session with a cardio warm-up is `'strength'`. Cardio workouts also get `cardio_duration`, `distance`, `distance_unit` in the dict, totalled across every bout (distances in the first bout's unit).
- **Bodyweight volume:** all volume math goes through `compute_effective_weight` in `utils/volume.py`; never use effective weight for PR/strength-score logic (raw `Set.weight`)
- **Weight units:** stored weights, PR values and bodyweight are in the user's *current* unit (`_convert_stored_weights` bulk-converts on switch). `Workout.volume` is always lbs: convert totals with `volume_in_user_unit`. Body measurements follow the weight unit (in/cm)
- **Adding a column that stores a weight (or weight-derived value):** it MUST be wired into `_convert_stored_weights` AND classified in `tests/test_unit_conversion_registry.py` (CONVERTED or EXEMPT-with-reason). That test name-scans all models for weight/value/volume columns and fails on unclassified ones — a missed column drifts out of unit after a kg↔lbs switch.
- **Heart rate:** `avg_heart_rate`/`max_heart_rate` nullable; NULL = no wearable, never default to 0. Attached by PATCH after the POST (`utils/heartRateSync.ts`), never folded into the POST
- **iOS health library:** `@kingstinct/react-native-healthkit` (a Nitro/New-Architecture module), NOT `react-native-health`. The latter is a legacy bridge module (no `codegenConfig`, `s.dependency 'React'`) and RN 0.82+ is bridgeless-only, so it never registered and every call threw. Don't reintroduce it or any other old-arch native module
- **Routine rotation:** a routine's days are a rotation, not a weekly calendar (`RoutineDay` has no weekday). "Up next" is the day after the last one logged, whatever the week; a layoff of 14+ days restarts at day 1. Workouts match days by name (trimmed, case-insensitive), and a repeated label goes to the next day with that label after the current position. Implemented twice and kept identical: `utils/routineRotation.ts` (Home's routine card) and `_routine_rotation_context` in `routes/ai_routes.py` (AI Coach prompts), each with the same test cases
- **Imports (Hevy/Strong CSV):** `routes/import_routes.py` + `utils/importers/`. An imported workout's `client_id` is `<source>:<sha1>`: re-import dedupe and undo both key on that prefix, so app-made client ids must never contain a colon. PRs come from one `_recompute_prs_for_templates` replay after the insert, never the per-save path
- **`starter` flag:** onboarding-generated routines/templates skip the free caps; `User.starter_granted` is never cleared
- **Weekly review, insight feedback, server-side premium, premium analytics, paywall funnel, achievements, profile PR pins, scores, Greek Rank:** see docs/feature-reference.md. Rules that always apply:
  - `PREMIUM_ENFORCED` unset means `has_premium()` is True for everyone. `User.is_premium` is written only by the RevenueCat webhook, `/api/premium/sync` and the admin "Sync everyone"
  - `paywall_events` is the only behavioural data recorded; tracking anything else needs the privacy policy and App Store privacy answers changed first
  - `user_achievements` rows are never deleted (except account deletion); keys name the rung, never a value
  - Every `strength_score_snapshots` read must filter on `score_type`. Strength/Endurance screens share `ScoreRing`/`PercentileBar`: presentation changes go there
  - Read Greek Rank from `GET /api/stats/greek-rank`, never from `strength-score`. Unlocks follow the rank held, not the raw score
- **Custom exercises:** `ExerciseTemplate.user_id` — NULL = global library exercise, set = that user's private custom exercise
- **RPE:** 1–10 scale, optional per set, only shown when user enables it in workout settings
- **User gender:** `user.gender` is `'male'` | `'female'` | `None` — used for strength score percentile calculations

---

## Workout Session Flow

The app has **one session at a time**: a lifting workout or a GPS run, never both. Starting one while the other is open or minimized is refused with a message from `utils/sessionConflict.ts`.

**Lifting workout** (`WorkoutSessionContext`)
1. User opens WorkoutLog (sets `isWorkoutOpen = true` in WorkoutSessionContext)
2. MiniWorkoutBar is hidden while WorkoutLog is open
3. User presses minimize → `saveSession()` → navigates away → MiniWorkoutBar appears
4. AppState background events: WorkoutLog handles notification when open; MiniWorkoutBar handles it when minimized (never both at once)
5. Open → navigate to WorkoutLog → restores from session → `clearSession()`. `clearSession` runs on every resume, so it must never end the workout's Live Activity
6. Discard → `clearSession()` → cancels live notification and ends the Live Activity

**GPS run** (`GpsRunContext`, details in `docs/app-reference.md`)
1. The run lives in the provider, not in `GPSCardioScreen`: leaving the screen minimizes it and tracking carries on
2. MiniRunBar stands in for the screen while it's minimized (Open, Discard); the tab bar is gone while the map shows
3. Stop asks first, then the save sheet; a save or discard calls `clearRun()`, which stops GPS, clears the checkpoint and ends the Live Activity
4. A killed app comes back with the run restored from its checkpoint as "Unsaved", for reviewing and saving only

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
- **Guardrail tests scan the whole codebase:** `src/tests/test_route_guardrails.py` walks the Flask url_map (auth on every non-public route, no 500s for a fresh user, malformed bodies or garbage query params), and `__tests__/codeGuardrails.test.ts` scans the app source (no raw `fetch`, `initial: false` on cross-tab navigates, listeners and intervals cleaned up, no AsyncStorage key literal in two files; a shared key is a constant in `constants/` or exported from the file that owns it, see the app CLAUDE.md). A new public route goes in that test's `PUBLIC` set.

---

## Production Deployment

- **Backend:** Railway — auto-deploys from `main` branch push to GitHub
- **Live URL:** `https://workouttracker-production-601f.up.railway.app` (also `aretefitnessapp.com`)
- **DB migrations on deploy:** `flask db upgrade` runs automatically via `railway.json` `startCommand`
- **Frontend:** EAS Build — `eas build --profile production --platform ios` for App Store
- **Over-the-air updates:** JS-only changes ship with `npm run update:<preview|production> -- "msg"` from `src/workout-tracker-native/`, never bare `eas update`. Updates bundle from the EAS environment, not `eas.json` or `.env`, so the script refuses unless the two match; a change to a profile's `EXPO_PUBLIC_*` in `eas.json` must be made in the EAS environment too. `runtimeVersion` is `fingerprint`: anything native needs a store build. Runbook and rollback in the ops-maintainer agent
- **Liveness probe:** `GET /health` — public, returns 200 + DB ping status. Check from PowerShell with `curl.exe` (not bare `curl`, which PowerShell aliases to `Invoke-WebRequest`): `curl.exe https://workouttracker-production-601f.up.railway.app/health` (local dev: `curl.exe http://localhost:5000/health`)
- **Railway CLI:** installed and linked to project "Arete Fitness APp" (services: `Postgres`, `Workout_Tracker`); run from `src/`
- **`railway run` gotcha:** it executes locally with prod env vars, but the injected `DATABASE_URL` host (`postgres.railway.internal`) is unreachable from this machine — to hit the prod DB, fetch `DATABASE_PUBLIC_URL` from `railway variables --service Postgres` and set it as `DATABASE_URL` before running the command
- **Backend env vars (Railway):** full list with notes in docs/feature-reference.md
- **Ops work** (logs, prod DB queries, rollbacks, EAS builds): use the `ops-maintainer` agent — runbooks live in `.claude/agents/ops-maintainer.agent.md`
