# Workout Tracker

A full-stack mobile fitness app built with React Native (Expo) and a Python/Flask REST API. Track strength and cardio workouts, monitor progress over time, log bodyweight, view personal records, and generate AI-powered workout plans.

---

## Features

### Workout Logging
- Log strength workouts set-by-set with weight, reps, and RPE (rate of perceived effort)
- Log cardio sessions with duration, distance, pace, and calories
- Drag-and-drop exercise reordering within an active workout
- Previous sets from your last session displayed inline for each exercise
- Rest timer with configurable duration and audio cue
- Bodyweight exercises automatically populated from your current logged weight
- Notes field per workout

### Exercises & Templates
- Browse a full exercise library filterable by muscle group, equipment, and cardio
- Create custom exercises with multi-muscle group tagging
- Detailed exercise screens with:
  - Anatomical muscle diagram highlighting the primary muscle (front and back view)
  - Performance stats: best weight, total volume, PR, session count
  - Volume and PR progress charts
  - Full session history
- Create reusable workout templates with ordered exercises
- Log a routine directly from a template

### Routines
- Create multi-day weekly routines (e.g. Push/Pull/Legs)
- Assign workout templates to each routine day
- Log any routine day directly from the routine detail view

### AI Workout Generation
- Generate a full weekly routine or a single workout session using Claude AI
- Inputs: days per week, fitness goal, and experience level
- Generated plans are matched to exercises already in your library and saved as templates or routines

### Progress Tracking
- Dashboard with recent workouts, rotating motivational message, and quick-log button
- Personal records screen for both strength (weight/reps) and cardio (distance/pace/calories) PRs
- Bodyweight log with a trend chart
- Stats per exercise across all sessions

### GPS Cardio (in progress)
- Track outdoor cardio (runs, rides) with live GPS route mapping
- Route displayed on a map with distance, pace, and elapsed time

### Profile & Settings
- Edit profile info and profile photo
- Change password
- Dark mode / light mode toggle
- Unit preference (lbs / kg, miles / km)

### Auth
- Register and log in with email and password
- JWT-based authentication with 30-day token expiry
- Password change from within the app

---

## Tech Stack

### Mobile (Frontend)

| Technology | Purpose |
|---|---|
| React Native 0.81 + Expo 54 | Cross-platform mobile framework |
| TypeScript | Type safety across all screens and components |
| React Navigation (Stack + Bottom Tabs) | Multi-tab navigation with nested stacks |
| react-native-gifted-charts | Volume, PR, and bodyweight trend charts |
| react-native-body-highlighter | Anatomical SVG body diagrams |
| react-native-draggable-flatlist | Drag-and-drop exercise reordering |
| react-native-maps | GPS route map display |
| expo-location | Live GPS tracking |
| react-native-svg | SVG-based rest timer arc |
| react-native-reanimated | Smooth animations |
| AsyncStorage | Local token and preference persistence |
| expo-image-picker | Profile photo upload |
| expo-linear-gradient | UI gradient accents |

### Backend (API)

| Technology | Purpose |
|---|---|
| Python 3 + Flask | REST API server |
| SQLAlchemy + Flask-Migrate | ORM and database migrations |
| PostgreSQL / SQLite | Production / development database |
| Flask-JWT-Extended | JWT auth (30-day access tokens, header-based) |
| Flask-CORS | Configurable CORS for browser clients |
| Anthropic Claude API | AI workout and routine generation |

### Backend Route Modules

| Module | Responsibility |
|---|---|
| `auth_routes` | Register, login |
| `user_routes` | Profile read/update, photo upload |
| `workout_routes` | CRUD for workouts, sets, exercises |
| `exercise_routes` | Exercise library, custom exercise creation |
| `workout_template_routes` | Workout templates |
| `routine_routes` | Multi-day routines and routine days |
| `stats_routes` | Per-exercise stats, last-session sets, PR history |
| `bodyweight_routes` | Bodyweight log |
| `personal_record_routes` | Strength and cardio PRs |
| `ai_routes` | Claude-powered workout generation |

---

## Project Structure

```
Workout_Tracker/
├── src/
│   ├── app.py                    # Flask app factory
│   ├── models.py                 # SQLAlchemy models
│   ├── routes/                   # API blueprints
│   ├── tests/                    # pytest test suite
│   └── workout-tracker-native/   # Expo React Native app
│       ├── screens/
│       │   ├── DashboardTab/     # Dashboard, workout log, workout details
│       │   ├── ExercisesTab/     # Exercise list, detail, templates, routines
│       │   └── ProfileTab/       # Profile, bodyweight, PRs, settings
│       ├── components/           # Shared UI components
│       ├── context/              # Auth, Theme, WorkoutSession contexts
│       ├── navigation/           # Stack and tab navigator definitions
│       ├── theme/                # Spacing, typography, color tokens
│       └── types/                # Shared TypeScript model types
```

---

## Getting Started

### Backend

```bash
cd src
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # fill in JWT_SECRET_KEY, DATABASE_URL, etc.
flask db upgrade
python app.py
```

### Mobile App

```bash
cd src/workout-tracker-native
npm install
npx expo start
```

Scan the QR code with the Expo Go app, or press `a` for Android emulator / `i` for iOS simulator.

### Environment Variables

| Variable | Description |
|---|---|
| `JWT_SECRET_KEY` | Secret used to sign JWT tokens |
| `DATABASE_URL` | PostgreSQL connection string (defaults to SQLite in dev) |
| `ANTHROPIC_API_KEY` | API key for Claude AI workout generation |
| `CORS_ORIGINS` | Comma-separated allowed browser origins (omit or `*` for dev) |

---

## Running Tests

```bash
cd src
python -m pytest tests/ -q
```
