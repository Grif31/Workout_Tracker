# Aretē Fitness

A full-stack mobile fitness app with a Greek mythology progression system. Track strength and cardio workouts, earn Greek ranks as you grow stronger, get AI-powered coaching insights, and monitor progress across every dimension of your training.

**Version:** 1.1.4  
**Platform:** iOS (primary) · Android  
**Backend:** [Railway](https://workouttracker-production-601f.up.railway.app) · auto-deploys from `main` · [`aretefitnessapp.com`](https://aretefitnessapp.com)

See [`CHANGELOG.md`](CHANGELOG.md) for a per-release feature history.

---

## Features

### Workout Logging
- Log strength workouts set-by-set with weight, reps, set type (normal / warm-up / drop / failure), and optional RPE
- Log cardio sessions with duration, distance, and intensity
- GPS cardio tracking — live route map with real-time distance, pace, and elapsed time; in-progress runs checkpoint to disk and offer restore after a crash
- Reorder Mode — drag exercises into place within an active workout (opened from the Exercises section header)
- Previous sets from your last session shown inline per exercise; optional pre-fill of new sets with last session's reps/weight
- Near-PR hint under the focused set while logging
- Rest timer with configurable duration, audio cue, vibration, auto-start, and notification when minimized
- Bodyweight exercises auto-populated from your current logged weight
- Minimize any workout to a persistent bottom bar — resume later where you left off
- Offline queue — workouts saved locally and synced when connection resumes
- Workout summary highlights all-time volume / rep-total records and shows a progress bar toward your next Greek Rank
- Share a workout as a branded image card

### Exercises & Library
- Browse and search a full exercise library filtered by muscle group, equipment, or type
- Create custom exercises with muscle group and equipment tagging
- Exercise detail screen (swipe between Overview / Charts / History) with:
  - Anatomical muscle highlighter (front and back), primary vs. secondary shading
  - Rank-colored inline Strength Score card with percentile circle
  - Lifetime stats (workouts, sets, reps) split from Personal Records
  - Volume and PR progress charts
  - Full session history
  - Hand-written "How to perform" instructions on 160+ core lifts

### Templates & Routines
- Create reusable workout templates with ordered exercises
- Build multi-day weekly routines (e.g. Push / Pull / Legs) from templates
- Log any routine day directly from the routine detail view
- Set an active routine to surface it at the top of the Training tab

### AI Coach
- Coach home on the Training tab — insights plus a training overview and active-routine card
- AI-generated insights (powered by Claude) — personalized recommendations based on your full training history, muscle volume, strength score, consistency, experience level, goals, and active routine
- Coach profile to specify training goal, experience level, equipment, session length, days per week, and injury avoidances
- Free-text notes passed to the AI when generating a routine or template
- AI template generation with optional muscle targeting — pick muscles, generate a template, preview and save
- AI routine generation calibrated to your coach profile

### Greek Rank System
- Seven ranks earned by your composite Greek score: **Neophyte → Athlete → Hero → Demigod → Olympian → Titan → Aretē**
- Score blends strength (percentile across all lifts), consistency, volume, and dedication
- Rank-up celebrations tinted to the rank just reached; intro screen explains the system
- Rank unlocks profile avatar frames displayed throughout the app

### Strength Score
- Per-exercise percentile across gender- and age-adjusted standards, with tier colors/icons distinct from Greek Rank
- Collapsible score card — strongest/weakest relative lifts, age adjustment, bodyweight freshness
- "More Lifts" page shows which supplemental lifts are tracked vs. not yet logged
- Score-over-time chart with 1M / 3M / 6M / All range picker, backfilled from past PRs
- Uses your real logged 1RM when you have one instead of the formula estimate
- Valid score for cardio-only users from consistency and volume alone
- Share your score and rank, or a "Rank Up!" card, as an image

### Personal Records
- Track max weight, max reps (per weight), estimated 1RM, best cardio time, and best cardio distance
- PR banners appear inline during and after workouts with laurel wreath UI
- **PR Dashboard** — recent PRs (past week), a streak counter, PRs this month, weekly weight/rep momentum, and "Time Since Last PR" surfacing stalled lifts by Weight / Reps / Time / Distance
- **PR Progression** — tap any PR for a full history chart and table of every time you beat it, with metric and weight-context pickers
- Pin lifts to the dashboard for a live progress chart (multiple PR types per exercise); pin up to 3 PR cards on your Profile
- Personal Records screen with sortable lists (by value or by muscle group)
- Share any PR as an image

### Progress & Dashboard
- Dashboard with recent workouts, current streak, and weekly goal ring
- Muscle volume card — sets per muscle group this week vs. MEV / MAV / MRV standards, with a per-muscle-group reference table
- Weekly sets per muscle with recovery status
- Progress charts: volume, sets, or workout frequency over 30 days / 6 months / 1 year
- Workout calendar — month, year, and multi-year GitHub-style heatmap views
- Bodyweight and measurements log with trend charts

### Weekly Summary
- Recap of your most recently completed week — workouts, volume, reps, training time, muscle balance (pie chart), average RPE, estimated calories, and PRs
- Weekly streak, progress toward your weekly goal, and a 4-week rolling average
- Most Improved Lift / Cardio callouts — only when a genuine new all-time best was hit that week
- "Past Weeks" calendar to browse earlier weeks; auto-popup once per week
- Share a recap card for social / messages

### Onboarding
- Welcome screen with logo, pronunciation guide, and tagline (Start Tutorial / Skip)
- Guided tutorial plus units and optional personal-info steps (height/weight units, age, gender, bodyweight)

### Profile & Settings
- Profile photo, bio, and display name
- Avatar frame selection based on earned Greek ranks
- Dark / light / system theme with nine accent color presets
- Weight unit toggle (lbs / kg) — bulk-converts all stored values
- Workout settings: default rest timer, auto-start rest, vibrate on finish, show RPE, show plate calculator, repeat last set, pre-fill previous sets, weekly workout goal
- Notification preferences: rest timer alerts, live workout notification, daily reminder with time
- Apple Health (iOS) and Health Connect (Android) sync toggle
- GPS distance unit (km / mi)

### Auth & Accounts
- Email / password registration and login
- Apple Sign-In
- Google OAuth
- JWT access + refresh tokens
- Password change from settings; forgot-password reset via emailed link

### Payments
- RevenueCat subscription (iOS) — `premium` entitlement gates AI Coach insights and generation

---

## Tech Stack

### Mobile (Frontend)

| Technology | Purpose |
|---|---|
| Expo SDK 55 + React Native 0.83 + React 19 | Cross-platform mobile framework (New Architecture enabled) |
| TypeScript | Type safety across all screens and components |
| React Navigation v7 (Native Stack + Bottom Tabs) | Multi-tab navigation with nested stacks |
| react-native-svg | Muscle diagrams, rest timer arc, laurel / PR wreath UI |
| react-native-body-highlighter | Anatomical front/back muscle highlighter on exercise detail |
| react-native-reanimated + react-native-worklets | Screen and component animations |
| react-native-gifted-charts | Volume, PR, strength score, and bodyweight trend charts |
| Custom PanResponder DraggableList | Drag-to-reorder exercises (`components/DraggableList.tsx`) |
| react-native-view-shot + expo-sharing | Render and share branded image cards (workout, PR, score, weekly recap) |
| react-native-confetti-cannon | Rank-up and PR celebrations |
| expo-linear-gradient + expo-blur | Share-card and UI treatments |
| expo-haptics | Haptic feedback |
| react-native-maps + expo-location + expo-task-manager | GPS route map and background location tracking |
| react-native-purchases (RevenueCat) | iOS subscription and premium entitlement |
| react-native-health | iOS HealthKit workout sync (EAS build only) |
| react-native-health-connect | Android Health Connect sync (EAS build only) |
| expo-notifications | Rest timer, live workout, and re-engagement push notifications |
| @sentry/react-native | Crash and error reporting |
| AsyncStorage | Local token, preference, and session persistence |
| expo-image-picker + expo-image-manipulator | Profile photo upload |

### Backend (API)

| Technology | Purpose |
|---|---|
| Python 3 + Flask | REST API server |
| SQLAlchemy + Flask-Migrate (Alembic) | ORM and schema migrations |
| PostgreSQL (psycopg2) | Production database |
| Flask-JWT-Extended | Access + refresh token auth |
| Flask-Mail | Password-reset email |
| APScheduler | Daily re-engagement push notification cron job |
| Anthropic Claude API | AI coaching insights and workout/routine generation |

### Backend Route Modules

| Module | Responsibility |
|---|---|
| `auth_routes` | Register, login, refresh, forgot/reset password, Apple Sign-In, Google OAuth |
| `user_routes` | Profile, photo upload, weight unit conversion, device token |
| `workout_routes` | CRUD for workouts, exercises, and sets; PR upserts + history |
| `exercise_routes` | Exercise library and custom exercise creation |
| `workout_template_routes` | Workout templates |
| `routine_routes` | Multi-day routines and routine days |
| `stats_routes` | Per-exercise stats, muscle volume, progress charts, recent exercises |
| `strength_score_routes` | Strength score, percentile ranks, score history |
| `personal_record_routes` | Strength and cardio PRs, PR Dashboard aggregate, per-exercise history |
| `weekly_summary_routes` | Weekly summary and weekly summary history |
| `bodyweight_routes` | Bodyweight log |
| `measurement_routes` | Body measurement tracking |
| `ai_routes` | Claude-powered insights and workout/routine generation |
| `legal_routes` | Public homepage, privacy policy, and terms of service pages |
| `admin_routes` | Exercise image review page (HTTP Basic Auth) |
| `health_routes` | `GET /health` — public liveness probe (DB ping) |

---

## Project Structure

```
src/
├── app.py                        # Flask app factory, blueprint registration, APScheduler
├── models.py                     # All SQLAlchemy models
├── schemas.py                    # Marshmallow request validation schemas
├── routes/                       # API blueprints (one file per module above)
├── utils/
│   ├── push_service.py           # Expo Push HTTP helper (batches of 100)
│   ├── strength_standards.py     # Percentile standards, ranks, Greek score
│   └── validation.py             # validate_body decorator
├── tests/                        # pytest suite
└── workout-tracker-native/       # Expo React Native app
    ├── App.tsx                   # Root: notification handler, context providers
    ├── screens/
    │   ├── Auth/                 # Login, signup, forgot/reset password, welcome + onboarding
    │   ├── DashboardTab/         # Home, workout log, details, workout + weekly summary, GPS cardio
    │   ├── ExercisesTab/         # Exercise browser and detail
    │   ├── TrainingTab/          # Coach home, strength score, templates, routines, AI preview
    │   └── ProfileTab/           # Profile, PR dashboard + progression, bodyweight, measurements, settings, Greek rank
    ├── components/               # Shared UI components (DraggableList, WorkoutLog, share-card chrome, ...)
    ├── context/                  # AuthContext, ThemeContext, WorkoutSessionContext, PurchaseContext
    ├── navigation/               # Stack and tab navigator definitions
    ├── constants/                # Greek ranks, strength tiers, muscle groups, equipment types, PR colors
    ├── theme/                    # Spacing, typography tokens
    └── utils/                    # api wrapper, notifications, HealthKit, offline queue, PR formatting + pins
```

---

## Getting Started

### Backend

```bash
cd src
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # fill in JWT_SECRET_KEY, DATABASE_URL, ANTHROPIC_API_KEY, mail creds
flask db upgrade
flask run --debug
```

### Mobile App

```bash
cd src/workout-tracker-native
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app, or press `a` / `i` for Android emulator / iOS simulator.

> **Note:** HealthKit, Health Connect, and RevenueCat require an **EAS build** — they cannot run in Expo Go.

### Environment Variables

| Variable | Description |
|---|---|
| `JWT_SECRET_KEY` | Secret used to sign JWT tokens |
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | API key for Claude AI coaching and generation |
| `APPLE_BUNDLE_ID` | iOS bundle ID for Apple Sign-In validation |
| `MAIL_SERVER` / `MAIL_PORT` / `MAIL_USE_TLS` / `MAIL_USERNAME` / `MAIL_PASSWORD` / `MAIL_DEFAULT_SENDER` | SMTP config for password-reset email |
| `ADMIN_PASSWORD` | HTTP Basic Auth password for `/admin/*` pages (optional) |
| `RAPIDAPI_KEY` | ExerciseDB image suggestions in the admin exercise review page (optional) |

---

## Deployment

| Layer | Platform | Trigger |
|---|---|---|
| Backend | Railway | Auto-deploy on push to `main`; `flask db upgrade` runs via `startCommand` |
| iOS app | EAS Build → App Store | `eas build --profile production --platform ios` |

**Liveness probe:** `GET /health` — public, returns 200 + a DB ping (503 if the database is unreachable).
