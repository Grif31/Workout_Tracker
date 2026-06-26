# Aretē Fitness

A full-stack mobile fitness app with a Greek mythology progression system. Track strength and cardio workouts, earn Greek ranks as you grow stronger, get AI-powered coaching insights, and monitor progress across every dimension of your training.

**Platform:** iOS (primary) · Android  
**Backend:** [Railway](https://workouttracker-production-601f.up.railway.app) · auto-deploys from `main`

---

## Features

### Workout Logging
- Log strength workouts set-by-set with weight, reps, set type (normal / warm-up / drop / failure), and optional RPE
- Log cardio sessions with duration, distance, and intensity
- GPS cardio tracking — live route map with real-time distance, pace, and elapsed time
- Drag-and-drop exercise reordering within an active workout
- Previous sets from your last session shown inline per exercise
- Rest timer with configurable duration, audio cue, and notification when minimized
- Bodyweight exercises auto-populated from your current logged weight
- Minimize any workout to a persistent bottom bar — resume later where you left off
- Offline queue — workouts saved locally and synced when connection resumes
- Share a workout as a branded image card

### Exercises & Library
- Browse and search a full exercise library filtered by muscle group, equipment, or type
- Create custom exercises with muscle group and equipment tagging
- Exercise detail screen with:
  - Anatomical SVG muscle diagram (front and back)
  - Performance stats: max weight, total volume, PR, session count
  - Volume and PR progress charts
  - Full session history

### Templates & Routines
- Create reusable workout templates with ordered exercises
- Build multi-day weekly routines (e.g. Push / Pull / Legs) from templates
- Log any routine day directly from the routine detail view
- Set an active routine to surface it at the top of the Training tab

### AI Coach
- Dedicated Coach tab
- AI-generated insights (powered by Claude) — personalized recommendations based on your full training history, muscle volume, strength score, consistency, and active routine
- Coach profile to specify training goal, experience level, equipment, session length, days per week, and injury avoidances
- AI template generation with optional muscle targeting — pick muscles, generate a template, preview and save
- AI routine generation calibrated to your coach profile

### Greek Rank System
- Seven ranks earned by your composite Greek score: **Neophyte → Athlete → Hero → Demigod → Olympian → Titan → Aretē**
- Score blends strength (percentile across all lifts), consistency, volume, and dedication
- Rank unlocks profile avatar frames displayed throughout the app
- Strength score shows individual percentile per exercise across gender-specific standards

### Personal Records
- Track max weight, max reps (per weight), estimated 1RM, best cardio time, and best cardio distance
- PR banners appear inline during and after workouts with laurel wreath UI
- Personal Records screen with sortable lists (by value or by muscle group)
- Pin up to 3 PR cards on your Profile for quick access

### Progress & Dashboard
- Dashboard with recent workouts, current streak, and weekly goal ring
- Muscle volume card — sets per muscle group this week vs. MEV / MAV / MRV standards
- Weekly sets per muscle with recovery status
- Progress charts: volume, sets, or workout frequency over 30 days / 6 months / 1 year
- Workout calendar — month, year, and multi-year GitHub-style heatmap views
- Bodyweight and measurements log with trend charts

### Profile & Settings
- Profile photo, bio, and display name
- Avatar frame selection based on earned Greek ranks
- Dark / light / system theme with six accent color presets
- Weight unit toggle (lbs / kg) — bulk-converts all stored values
- Rest timer duration, notification preferences, and vibration settings
- Apple Health (iOS) and Health Connect (Android) sync toggle
- GPS distance unit (km / mi)

### Auth & Accounts
- Email / password registration and login
- Apple Sign-In
- Google OAuth
- JWT access + refresh tokens
- Password change from settings

### Payments
- RevenueCat subscription (iOS) — `premium` entitlement gates AI Coach insights and generation

---

## Tech Stack

### Mobile (Frontend)

| Technology | Purpose |
|---|---|
| Expo SDK 55 + React Native 0.83 | Cross-platform mobile framework (New Architecture enabled) |
| TypeScript | Type safety across all screens and components |
| React Navigation v7 (Stack + Bottom Tabs) | Multi-tab navigation with nested stacks |
| react-native-svg | SVG coach character, muscle diagrams, rest timer arc |
| react-native-reanimated | Smooth screen and component animations |
| react-native-gifted-charts | Volume, PR, and bodyweight trend charts |
| react-native-draggable-flatlist | Drag-and-drop exercise reordering |
| react-native-maps + expo-location | GPS route map and live location tracking |
| react-native-purchases (RevenueCat) | iOS subscription and premium entitlement |
| react-native-health | iOS HealthKit workout sync (EAS build only) |
| react-native-health-connect | Android Health Connect sync (EAS build only) |
| expo-notifications | Rest timer, live workout, and re-engagement push notifications |
| AsyncStorage | Local token, preference, and session persistence |
| expo-image-picker | Profile photo upload |

### Backend (API)

| Technology | Purpose |
|---|---|
| Python 3 + Flask | REST API server |
| SQLAlchemy + Flask-Migrate (Alembic) | ORM and schema migrations |
| PostgreSQL (psycopg2) | Production database |
| Flask-JWT-Extended | Access + refresh token auth |
| APScheduler | Daily re-engagement push notification cron job |
| Anthropic Claude API | AI coaching insights and workout/routine generation |

### Backend Route Modules

| Module | Responsibility |
|---|---|
| `auth_routes` | Register, login, refresh, Apple Sign-In, Google OAuth |
| `user_routes` | Profile, photo upload, weight unit conversion, device token |
| `workout_routes` | CRUD for workouts, exercises, and sets |
| `exercise_routes` | Exercise library and custom exercise creation |
| `workout_template_routes` | Workout templates |
| `routine_routes` | Multi-day routines and routine days |
| `stats_routes` | Per-exercise stats, muscle volume, progress charts, strength score |
| `personal_record_routes` | Strength and cardio PRs |
| `bodyweight_routes` | Bodyweight log |
| `measurement_routes` | Body measurement tracking |
| `ai_routes` | Claude-powered insights and workout/routine generation |
| `legal_routes` | Privacy policy and terms of service pages |

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
│   └── strength_standards.py     # Percentile standards, ranks, Greek score
├── tests/                        # pytest suite
└── workout-tracker-native/       # Expo React Native app
    ├── App.tsx                   # Root: notification handler, context providers
    ├── screens/
    │   ├── DashboardTab/         # Home, workout log entry, details, summary, GPS cardio
    │   ├── ExercisesTab/         # Exercise browser and detail
    │   ├── TrainingTab/          # AI coach, strength score, muscle volume, templates, routines
    │   └── ProfileTab/           # Profile, PRs, bodyweight, measurements, settings, Greek rank
    ├── components/               # Shared UI components
    ├── context/                  # AuthContext, ThemeContext, WorkoutSessionContext, PurchaseContext
    ├── navigation/               # Stack and tab navigator definitions
    ├── constants/                # Greek ranks, strength tiers, muscle groups, PR colors
    ├── theme/                    # Spacing, typography tokens
    └── utils/                   # API fetch wrapper, notifications, HealthKit, offline queue
```

---

## Getting Started

### Backend

```bash
cd src
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # fill in JWT_SECRET_KEY, DATABASE_URL, ANTHROPIC_API_KEY
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

---

## Deployment

| Layer | Platform | Trigger |
|---|---|---|
| Backend | Railway | Auto-deploy on push to `main`; `flask db upgrade` runs via `startCommand` |
| iOS app | EAS Build → App Store | `eas build --profile production --platform ios` |
