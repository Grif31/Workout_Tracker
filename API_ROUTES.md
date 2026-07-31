# Aretē Fitness — API Route Reference

All routes are Flask endpoints under the backend (`src/routes/`). Unless noted otherwise, every route requires a valid JWT access token (`@jwt_required()`, `Authorization: Bearer <token>`). Routes are grouped by blueprint file and sorted alphabetically by path within each group.

**Auth key:** 🌐 Public (no token) · 🔒 JWT required · 🔑 Admin (HTTP Basic Auth via `ADMIN_PASSWORD`) · 🔄 Refresh token required

---

## `auth_routes.py` — Login, signup, password reset, social auth

| Method & Path | Auth | Description |
|---|---|---|
| `POST /api/auth/social` | 🌐 | Sign in or auto-register via Apple/Google/Facebook token; verifies the provider token server-side and issues our own JWTs. |
| `POST /api/forgot-password` | 🌐 | Requests a 6-digit OTP emailed to the account (always returns the same message, win or lose, to prevent email enumeration). |
| `POST /api/login` | 🌐 | Email/username + password login; returns access + refresh JWTs. Rate-limited to 10/min. |
| `POST /api/me/change-password` | 🔒 | Changes the current user's password given their current password (blocked for social-only accounts). |
| `POST /api/refresh` | 🔄 | Exchanges a valid refresh token for a new access + refresh token pair. |
| `POST /api/reset-password` | 🌐 | Completes a password reset using the emailed OTP + a new password. |
| `POST /api/signup` | 🌐 | Creates a new account and returns JWTs. Rate-limited to 5/min. |
| `POST /api/verify-otp` | 🌐 | Checks whether an OTP is valid without consuming it (used by the reset-password UI to validate the code before showing the new-password step). |

---

## `user_routes.py` — Current user profile & account

| Method & Path | Auth | Description |
|---|---|---|
| `DELETE /api/me` | 🔒 | Permanently deletes the account and all owned data (workouts, PRs, routines, templates, custom exercises, etc.) in FK-safe order. |
| `DELETE /api/me/device-token` | 🔒 | Unregisters this device's push-notification token (e.g. on logout). |
| `GET /api/me` | 🔒 | Returns the current user's profile plus a lightweight list of their workouts (id/name/date/notes). |
| `PATCH /api/me` | 🔒 | Updates profile fields (name, bio, photo URL, bodyweight, height, weight unit, gender, birth date). Changing `weight_unit` bulk-converts stored PRs/bodyweight logs to the new unit. |
| `POST /api/me/avatar` | 🔒 | Uploads and stores a new profile picture (jpg/png/webp, 5 MB max). |
| `POST /api/me/device-token` | 🔒 | Registers/updates this device's Expo push token for notifications. |

---

## `workout_routes.py` — Workouts, sets, PRs

| Method & Path | Auth | Description |
|---|---|---|
| `DELETE /api/workouts/<id>` | 🔒 | Deletes a workout and all its exercises/sets. |
| `GET /api/workouts` | 🔒 | Paginated list of the user's workouts (`?page=`, `?per_page=`). |
| `GET /api/workouts/<id>` | 🔒 | Full detail for one workout — exercises, sets, notes, cardio fields, route polyline. |
| `GET /api/workouts/dates` | 🔒 | Distinct dates the user has logged a workout (used for calendar views). |
| `GET /api/workouts/export` | 🔒 | Downloads the user's entire workout history as CSV (one row per set). |
| `GET /api/workouts/recent` | 🔒 | Most recent workouts (lightweight list, used for quick "perform again" style flows). |
| `POST /api/workouts` | 🔒 | Creates a new workout with exercises/sets; computes and upserts strength, cardio, and duration PRs for what was just logged. |
| `PUT/PATCH /api/workouts/<id>` | 🔒 | Edits an existing workout's exercises/sets/notes; recomputes PRs for any affected exercise templates. |

---

## `exercise_routes.py` — Exercise library

| Method & Path | Auth | Description |
|---|---|---|
| `DELETE /api/exercises/<id>` | 🔒 | Deletes a custom exercise the user created (cannot delete global library exercises or another user's custom ones). |
| `GET /api/exercises` | 🔒 | Lists exercises available to the user — the global library plus their own custom exercises; filterable by `equipment` / `muscle_group`. |
| `POST /api/exercises` | 🔒 | Creates a new custom exercise (name, muscle group(s), equipment, type); rejects exact name+equipment duplicates. |

---

## `workout_template_routes.py` — Reusable workout templates

| Method & Path | Auth | Description |
|---|---|---|
| `DELETE /api/workout-templates/<id>` | 🔒 | Deletes a template, unless it's currently part of a routine (409 with the routine name instead). |
| `GET /api/workout-templates` | 🔒 | Lists the user's saved workout templates. |
| `GET /api/workout-templates/<id>` | 🔒 | Full detail for one template, including its exercises. |
| `PATCH /api/workout-templates/<id>` | 🔒 | Updates a template's name, exercise list, and/or saved programming (sets/reps/RPE per exercise). |
| `POST /api/workout-templates` | 🔒 | Creates a new standalone workout template from a list of exercises. |

---

## `routine_routes.py` — Multi-day training routines

| Method & Path | Auth | Description |
|---|---|---|
| `DELETE /api/routines/<id>` | 🔒 | Deletes a routine and its day assignments. |
| `GET /api/routines` | 🔒 | Lists the user's routines. |
| `GET /api/routines/<id>` | 🔒 | Full detail for one routine, including each day's template. |
| `PATCH /api/routines/<id>` | 🔒 | Updates a routine's name/description/day structure (replaces all days when `days` is sent). |
| `POST /api/routines` | 🔒 | Creates a routine — one or more days, each pointing at an existing template or a fresh one built from a chosen exercise list. |
| `POST /api/routines/<id>/activate` | 🔒 | Sets this routine as the user's active routine. |
| `POST /api/routines/deactivate` | 🔒 | Clears the user's active routine. |

---

## `personal_record_routes.py` — Personal records

| Method & Path | Auth | Description |
|---|---|---|
| `GET /api/personal-records` | 🔒 | All of the user's current PRs across every exercise, with exercise name/equipment/muscle group and a human-readable label per PR. |
| `GET /api/personal-records/<exercise_template_id>` | 🔒 | PRs for a single exercise — max weight, estimated 1RM, per-weight rep records, and (for cardio) best times/distances per milestone. |

---

## `bodyweight_routes.py` — Bodyweight log

| Method & Path | Auth | Description |
|---|---|---|
| `DELETE /api/bodyweight/<id>` | 🔒 | Removes a bodyweight entry; if it was the most recent, `User.bodyweight` falls back to the next-latest entry (or `null`). |
| `GET /api/bodyweight` | 🔒 | All of the user's bodyweight log entries, newest first. |
| `POST /api/bodyweight` | 🔒 | Logs a new bodyweight entry; updates the live `User.bodyweight` scalar when it's the most recent entry. |

---

## `measurement_routes.py` — Body measurements & progress photos

| Method & Path | Auth | Description |
|---|---|---|
| `DELETE /api/measurements/<id>` | 🔒 | Deletes a body-measurement entry. |
| `DELETE /api/progress-photos/<id>` | 🔒 | Deletes a progress photo (row + file on disk). |
| `GET /api/measurements` | 🔒 | All of the user's body-measurement entries (waist, chest, arms, legs), newest first. |
| `GET /api/progress-photos` | 🔒 | All of the user's progress photos, newest first. |
| `POST /api/measurements` | 🔒 | Logs a new body-measurement entry. |
| `POST /api/progress-photos` | 🔒 | Uploads a new progress photo (jpg/png/webp, 5 MB max) with optional notes. |

---

## `stats_routes.py` — Dashboards, progress, Strength Score, Weekly Summary

| Method & Path | Auth | Description |
|---|---|---|
| `GET /api/stats/dashboard` | 🔒 | Home-screen stats: this-week volume/workouts, an 8-week trend, and related dashboard summary numbers. |
| `GET /api/stats/exercise` | 🔒 | Full stats + session history for one exercise by name (+ optional `exercise_template_id` to disambiguate) — personal bests, totals, and per-session history; branches to distance/pace stats for cardio. |
| `GET /api/stats/exercise/last-session` | 🔒 | The most recent logged sets for one exercise, used to pre-fill "perform again"-style flows. |
| `GET /api/stats/muscle-volume` | 🔒 | Weekly working-set volume per muscle group, with MEV/MAV/MRV zone classification (premium). |
| `GET /api/stats/profile` | 🔒 | Profile-tab stats: total workouts/volume, current & longest streaks (daily/weekly/monthly). |
| `GET /api/stats/progress` | 🔒 | Bucketed volume/sets/workout-count history for the Progress tab chart (`?range=30d\|6m\|1y`). |
| `GET /api/stats/recent-exercises` | 🔒 | The user's 10 most recently logged exercises, for quick-add pickers. |
| `GET /api/stats/strength-score` | 🔒 | Full Strength Score computation — overall percentile, Big 6 + supplemental lift breakdowns, muscle-group scores, Greek Rank composite. Requires gender + bodyweight to be set. |
| `GET /api/stats/strength-score/exercise` | 🔒 | Lightweight single-lift percentile/rank lookup (`?exercise_template_id=`), for showing a Strength Score badge on one exercise without the cost of the full computation. |
| `GET /api/stats/strength-score/history` | 🔒 | Strength Score snapshots over time, for the score-over-time chart. |
| `GET /api/stats/weekly-summary` | 🔒 | Recap of the most recently completed (or a specified) week — workouts, volume, distance, PRs earned, bodyweight change, muscle balance, most-improved lift/cardio, calories. |
| `GET /api/stats/weekly-summary/history` | 🔒 | Condensed list of past weeks (date range, workout count, volume) for the "Past Weeks" picker. |

---

## `ai_routes.py` — AI Coach (Claude-powered)

| Method & Path | Auth | Description |
|---|---|---|
| `POST /api/ai/generate` | 🔒 | Generates a new routine or template via Claude, using the user's goal/equipment/schedule/injuries plus recent training data (top PRs, muscle-set counts, layoff detection). Returns a preview, not yet saved. |
| `POST /api/ai/insights` | 🔒 | Generates 3–5 personalized coaching insights (deload/rest/frequency/routine/achievement/suggestion) from recent volume vs. MEV/MRV thresholds, PR recency, and bodyweight trend. Rate-limited to 5/day. |
| `POST /api/ai/save` | 🔒 | Persists a previously generated (preview) routine or template. |

---

## `admin_routes.py` — Exercise-image admin tools

*Base path: `/admin`. All routes require HTTP Basic Auth against `ADMIN_PASSWORD`, not a JWT.*

| Method & Path | Auth | Description |
|---|---|---|
| `GET /admin/exercises` | 🔑 | Serves the admin HTML page for reviewing/assigning exercise images. |
| `GET /admin/exercises/<id>/suggest` | 🔑 | Searches ExerciseDB (via RapidAPI) for GIFs matching an exercise's name + equipment. |
| `GET /admin/exercises/data` | 🔑 | JSON list of every exercise template with its current image status, for the admin page's table. |
| `GET /admin/exercises/image-proxy/<exercisedb_id>` | 🔑 | Streams an ExerciseDB thumbnail through the server so the RapidAPI key never reaches the browser. |
| `POST /admin/exercises/<id>/apply-suggestion` | 🔑 | Downloads a chosen ExerciseDB GIF and re-hosts it under our own `/static` path as the exercise's image. |
| `POST /admin/exercises/<id>/image` | 🔑 | Directly sets (or clears) an exercise template's `image_url`. |

---

## `legal_routes.py` — Public marketing / legal pages

| Method & Path | Auth | Description |
|---|---|---|
| `GET /` | 🌐 | Public marketing homepage. |
| `GET /privacy` | 🌐 | Privacy Policy page. |
| `GET /terms` | 🌐 | Terms of Service page. |

---

## `health_routes.py` — Liveness probe

| Method & Path | Auth | Description |
|---|---|---|
| `GET /health` | 🌐 | Liveness probe — returns 200 + a DB ping, or 503 if the database is unreachable. Used by Railway's health checks. |
