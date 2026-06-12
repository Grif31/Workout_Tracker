# Aretē Fitness — Project Guide

## Overview

**App name:** Aretē (ē = Unicode macron-e, U+0113 — use in UI copy, not in file names)  
**Domain:** aretefitnessapp.com | **Support:** support@aretefitnessapp.com  
**iOS bundle:** `com.aretefitness.app` | **Android package:** `com.aretefitness.app`  
**Expo project ID:** `356b88e9-4302-43fc-b50a-6d83030b8fa6`  
**Deep link scheme:** `aretefitness://`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Expo SDK 55, React Native 0.83, TypeScript, New Architecture enabled |
| Navigation | React Navigation v7 (bottom tabs + native stacks) |
| State | React Context (AuthContext, ThemeContext, WorkoutSessionContext, PurchaseContext) |
| Payments | RevenueCat (react-native-purchases) — iOS only, `premium` entitlement |
| Storage | AsyncStorage for local preferences |
| Backend | Flask + SQLAlchemy + Flask-JWT-Extended + Flask-Migrate (Alembic) |
| Database | PostgreSQL (psycopg2-binary) |
| Push | expo-notifications + Expo Push Service |
| Auth | JWT access + refresh tokens; Apple Sign-In; Google OAuth |
| Notifications | APScheduler for re-engagement cron job |
| Health Sync | react-native-health (iOS HealthKit) + react-native-health-connect (Android) — **requires EAS build, not Expo Go** |

---

## Common Commands

### Frontend (`src/workout-tracker-native/`)
```bash
npx expo start              # start dev server (scan QR with Expo Go)
npx expo start --ios        # iOS simulator
npx expo start --android    # Android emulator
npx jest                    # run all frontend tests
npx jest __tests__/Foo.test.tsx --verbose   # run single test file
npx expo install <pkg>      # install Expo-compatible package version
```

### Backend (`src/`)
```bash
./venv/Scripts/flask.exe run --debug          # start Flask dev server
./venv/Scripts/flask.exe db migrate -m "msg" # generate migration
./venv/Scripts/flask.exe db upgrade           # apply migrations
./venv/Scripts/pip.exe install <pkg>          # install Python package
python -m pytest tests/ -q --tb=short        # run all backend tests
python -m pytest tests/test_foo.py -v        # run single test file
```

---

## Project Structure

```
src/
├── workout-tracker-native/       # Expo app
│   ├── App.tsx                   # root: notification handler, providers
│   ├── app.json                  # Expo config, plugins, permissions
│   ├── components/               # shared UI components
│   │   ├── WorkoutLog.tsx        # live workout logging form (large)
│   │   ├── ExerciseList.tsx      # exercise picker modal (multi-select)
│   │   └── ...
│   ├── screens/
│   │   ├── DashboardTab/         # home, workout log entry, details, summary
│   │   │   ├── GPSCardioScreen.tsx       # live GPS activity tracking (EAS build only)
│   │   │   └── CardioDetailsScreen.tsx   # map + stats view for completed cardio activities
│   │   ├── ExercisesTab/         # exercise browser + detail
│   │   ├── TrainingTab/          # strength score, muscle volume, AI plans
│   │   ├── ProfileTab/           # profile, settings, bodyweight, measurements
│   │   └── PaywallScreen.tsx     # RevenueCat subscription paywall
│   ├── navigation/
│   │   ├── AppTabs.tsx           # bottom tabs + MiniWorkoutBar
│   │   ├── DashboardStack.tsx
│   │   ├── RootNav.tsx           # auth gate (logged in vs auth screens)
│   │   └── navigationRef.ts      # imperative navigation ref
│   ├── context/
│   │   ├── AuthContext.tsx        # login/logout/register, push token reg
│   │   ├── ThemeContext.tsx       # dark/light/system mode, color tokens
│   │   ├── WorkoutSessionContext.tsx  # minimized workout state
│   │   └── PurchaseContext.tsx    # RevenueCat isPremium/offerings/purchase
│   ├── utils/
│   │   ├── api.ts                # apiFetch wrapper (attaches JWT, base URL)
│   │   ├── notifications.ts      # all notification helpers
│   │   ├── healthKit.ts          # iOS HealthKit sync (EAS build only)
│   │   ├── healthConnect.ts      # Android Health Connect sync (EAS build only)
│   │   ├── plateCalc.ts          # plate calculator math
│   │   ├── offlineQueue.ts       # offline workout queue (AsyncStorage)
│   │   ├── exerciseCache.ts      # exercise list cache
│   │   ├── toast.ts              # lightweight toast helper
│   │   ├── units.ts              # weight unit conversion
│   │   └── cardioCalories.ts     # cardio calorie estimation
│   ├── theme/
│   │   ├── spacing.ts            # xs/sm/md/lg/xl
│   │   └── typography.ts         # fontSize.sm/md/lg
│   └── constants/
│       └── muscleGroups.ts
│
├── routes/                       # Flask blueprints
│   ├── auth_routes.py            # register, login, refresh, Apple/Google
│   ├── workout_routes.py         # CRUD workouts + sets
│   ├── exercise_routes.py        # exercise library
│   ├── stats_routes.py           # progress stats, recent exercises
│   ├── personal_record_routes.py # PR lookup
│   ├── user_routes.py            # profile, device token, bodyweight
│   ├── bodyweight_routes.py
│   ├── measurement_routes.py
│   ├── workout_template_routes.py
│   ├── routine_routes.py
│   ├── ai_routes.py              # AI workout/routine generation (Anthropic API)
│   └── legal_routes.py           # privacy policy / terms pages
├── models.py                     # all SQLAlchemy models
├── schemas.py                    # marshmallow request validation schemas
├── app.py                        # app factory, blueprint registration, APScheduler
├── migrations/versions/          # Alembic migration files
├── utils/
│   ├── push_service.py           # Expo push HTTP helper (batches of 100)
│   ├── strength_standards.py     # percentile standards, ranks, Greek score
│   └── validation.py             # validate_body decorator
└── tests/                        # pytest suite
```

---

## Frontend Conventions

### Theme — always use tokens, never hardcode
```typescript
const { colors } = useTheme();           // color tokens
import { spacing } from '../theme/spacing';     // xs=4 sm=8 md=16 lg=24 xl=32
import { typography } from '../theme/typography'; // fontSize xs=11 sm=14 md=16 lg=20 xl=22 xxl=28
```

**Approved hardcoded colors** (everything else must use `colors.*`):
- `#FFD700` — PR gold indicators
- `#7A5800` — PR gold text contrast  
- `#FFF3C4` — PR banner background
- `#fff` / `#ffffff` — text on solid accent/colored backgrounds only
- `'rgba(0,0,0,0.6)'` — modal backdrop overlay

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

### AsyncStorage keys — define as constants at top of owning file
```typescript
const MY_KEY = 'my_feature_key';
```

### Navigation — new screens
1. Create file in `screens/<Tab>/`
2. Add to the matching stack in `navigation/<Tab>Stack.tsx`
3. Add type to `navigation/types.ts`
4. Navigate via `navigation.navigate('ScreenName', { params })`

### AsyncStorage keys
| Key | Default | Controls |
|---|---|---|
| `rest_timer_alerts_enabled` | true | Rest timer local notification |
| `live_workout_notif_enabled` | true | Live workout system notification |
| `workout_reminders_enabled` | false | Daily reminder notification |
| `workout_reminder_hour` | '9' | Reminder hour |
| `workout_reminder_minute` | '00' | Reminder minute |
| `health_sync_enabled` | false | Apple Health / Health Connect sync toggle |
| `plate_calc_bar` | 'standard' | Last-used bar type in plate calculator |
| `plate_calc_plates` | all defaults | Enabled plate sizes in plate calculator (JSON number[]) |
| `default_rest_timer` | '90' | Default rest timer duration in seconds |
| `gps_distance_unit` | 'km' | Distance unit for GPS cardio activities ('km' or 'mi') |

---

## Backend Conventions

### Every new route must:
- Be `@jwt_required()` protected (except auth endpoints)
- Live in the appropriate blueprint in `routes/`
- Be registered in `app.py`

### Schema changes always need two files:
1. Update `models.py`
2. Generate + apply migration: `flask db migrate -m "description"` then `flask db upgrade`

### Migration chain
Each migration's `down_revision` must point to the previous migration's `revision`. Check the latest revision before creating a new one.

### Response shape convention
```python
return jsonify({ 'message': 'ok', ...data }), 200   # success
return jsonify({ 'message': 'error reason' }), 400   # client error
```

---

## Key Data Model Notes

- **Exercise types:** `'strength'` (default) or `'cardio'`
- **Set types:** `'N'` (normal), `'W'` (warm-up), `'D'` (drop set), `'F'` (failure)
- **PR types (strength):** `max_weight`, `estimated_1rm`, `max_reps` (per weight, `weight_context` = the weight) — never surface `estimated_1rm` as a PR label to users
- **PR types (cardio):** `best_time` (`weight_context` = distance milestone in km) and `best_distance` (`weight_context` = duration milestone in minutes)
- **Cardio sets** have: `cardio_duration` (minutes), `distance`, `distance_unit` ('km'|'mi'), `intensity`
- **GPS cardio exercises** also store: `route_polyline` (encoded Google polyline string), decoded with `@mapbox/polyline`
- **`workout_type`** — computed field in `Workout.to_dict()`, derived from `exercise_type` on exercises; no DB column. Cardio workouts also get `cardio_duration`, `distance`, `distance_unit` in the dict.
- **Weight units:** per user — `user.weight_unit` is `'kg'` or `'lbs'`; delta: kg=2.5, lbs=5. Stored set weights, PR values, and bodyweight logs are always in the user's *current* unit — switching units bulk-converts them (`_convert_stored_weights` in `user_routes.py`). Exception: `Workout.volume` is always lbs.
- **Custom exercises:** `ExerciseTemplate.user_id` — NULL = global library exercise, set = that user's private custom exercise
- **RPE:** 1–10 scale, optional per set, only shown when user enables it in workout settings
- **User gender:** `user.gender` is `'male'` | `'female'` | `None` — used for strength score percentile calculations

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

- Never hardcode colors outside the approved list above
- Never call `fetch` directly — use `apiFetch`
- Never commit `.env` files
- Don't add features, refactor, or abstract beyond what the task requires
- Don't add error handling for scenarios that can't happen
- Don't write comments that explain WHAT code does — only WHY (non-obvious constraints)
- Schema changes without a migration will break production
- **Never use `date.toISOString()` to build a date string for the backend** — it outputs UTC and shifts the date in US timezones. Always use local methods: `` `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` ``

---

## Production Deployment

- **Backend:** Railway — auto-deploys from `main` branch push to GitHub
- **Live URL:** `https://workouttracker-production-601f.up.railway.app`
- **DB migrations on deploy:** `flask db upgrade` runs automatically via `railway.json` `startCommand`
- **Frontend:** EAS Build — `eas build --profile production --platform ios` for App Store
