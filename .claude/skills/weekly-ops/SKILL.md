---
name: weekly-ops
description: Weekly read-only production check — Railway errors, health, migration head, premium sync state, and a Coach insight feedback digest
disable-model-invocation: true
---

Run the weekly production check for Aretē. Hand the whole job to the `ops-maintainer` agent (it has the Railway runbooks and the `DATABASE_PUBLIC_URL` override). Everything is READ-ONLY: SELECT queries only, no redeploys, no env var changes, no `--apply`.

Give the agent this brief:

1. **Health**: `curl.exe https://workouttracker-production-601f.up.railway.app/health`. Report status and the DB ping.
2. **Errors (last 7 days)**: scan `railway logs --service Workout_Tracker` for 5xx responses, tracebacks and repeated warnings. Group by route and exception, with counts and the first/last time seen. Flag anything new since the last deploy.
3. **Migrations**: `flask db current` against prod vs. the head in `src/migrations/versions/`. Report any mismatch.
4. **Premium** (`PREMIUM_ENFORCED` has been on since 2026-10-31, gating the AI routes):
   - Confirm `PREMIUM_ENFORCED`, `REVENUECAT_WEBHOOK_SECRET` and `REVENUECAT_SECRET_KEY` are still set on Railway (names only, never print values).
   - Count `is_premium = true` users, and the change from last week if a previous report gives it.
   - List any `/api/webhooks/revenuecat` failures or non-2xx responses in the logs: a missed webhook leaves a paying user locked out of the Coach.
   - Count 402 `Premium required` refusals on the AI routes. A spike means paying users are being refused, not that free users are hitting the gate.
   - Paywall funnel for the last 7 days from `paywall_events`: people at each step (`upsell_shown` → `paywall_viewed` → `plan_selected` → `purchase_started` → `purchase`), purchases and restores by `outcome`, and purchases by `source`. Counts only, no user ids.
5. **Coach feedback digest** from `insight_feedback`, rows with `created_at` in the last 7 days:
   - total votes, helpful vs. not helpful, and the same split for the 4 weeks before for comparison
   - not-helpful votes by `reason` (`known` / `irrelevant` / `wrong` / `vague` / none)
   - helpful rate by `insight_type`
   - the 5 most-downvoted titles (titles only, no user ids or emails)
6. **Usage snapshot**: new signups, users who logged at least one workout, and total workouts in the last 7 days.
7. **Expo SDK drift**: `npx expo install --check` in `src/workout-tracker-native/`. It lives here, not in the Monday cloud routine, because the cloud sandbox's proxy blocks the Expo versions API. List any package off the SDK's expected version.

While the agent runs, check Sentry yourself (the agent has no Sentry tools; both the app and the Flask backend report there): use `search_issues` for unresolved issues first seen or regressed in the last 7 days, with event and user counts and the release they started in. Merge these into the report.

Then give the user a short report: **Action needed** first (errors, failed checks), then **Coach feedback** in 3–5 lines with one concrete suggestion for the insights prompt if the data supports it, then **All clear** for checks that passed in one line each. If the feedback sample is under ~20 votes, say so instead of drawing conclusions.
