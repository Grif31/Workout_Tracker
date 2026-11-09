# Frontend notes (src/workout-tracker-native)

Moved here from the root CLAUDE.md so they only load when working in the app.

Long-form internals (widgets, Live Activities, GPS run, the full AsyncStorage key tables, IAP testing steps) are in `docs/app-reference.md`. Read the relevant section before changing those areas.

### Testing in-app purchases
The dev build (`com.aretefitness.app.dev`) can't load plans. Use the `development-store` EAS profile with `.env.purchase-testing` swapped in, and swap `.env.normal` back afterwards. Steps in `docs/app-reference.md`.

### Animations follow Reduce Motion
Decorative `Animated` motion (slides, scales, springs, count-ups, entrances) goes through `motionTiming` / `motionSpring` from `utils/motion.ts`, not `Animated.timing` / `Animated.spring`: with the system's Reduce Motion on they jump straight to the end, callbacks included. Not for an infinite `Animated.loop` (it would spin at 0 ms: check `reduceMotion()` and don't start a loop that moves or scales) or timing that means something (`HoldButton`'s hold-to-confirm, dragging). List layout changes go through `utils/layoutAnimation.ts`, gifted-charts take `isAnimated={!reduceMotion()}`, and Reanimated's `entering=` animations follow the setting by themselves. Opacity-only pulses and fades may stay. `__tests__/codeGuardrails.test.ts` enforces all three: a raw `Animated.timing`/`spring` is allowed only in the files listed in `RAW_ANIMATION_ALLOWED`, each with its reason and count, so a deliberate exception goes there with why.

### AsyncStorage keys — define as named constants, share when used across files
```typescript
const MY_KEY = 'my_feature_key';
```
Shared keys that cross file boundaries live in `constants/` or are exported from the file that owns them (e.g. `COACH_PROFILE_KEY` exported from `components/coach/CoachProfileModal.tsx`, `REST_TIMER_KEY` exported from `components/workout/types.ts`). Never use the same key string as a bare literal in two different files.

### Charts (`react-native-gifted-charts` `LineChart`)
Don't derive `maxValue`/`yAxisOffset` from raw `min`/`max` + a percentage pad — on a narrow-range series (e.g. a Rep Record spanning 1-2 reps) each tick's *label* rounds independently and adjacent ticks can round to the same displayed number, and the labels can drift out of sync with where points actually plot. Use `computeChartYAxisRange(values, sections)` from `utils/prFormat.ts` (also mirrored inline in `StrengthScoreScreen.tsx`), which snaps the whole range to whole-number, evenly-divisible steps up front.

### WorkoutLog prefill: build it with `buildTemplatePrefill`
Anything that sends a template or routine day to WorkoutLog goes through `buildTemplatePrefill` in `utils/templatePrefill.ts`. A new field WorkoutLog reads must be added to `PrefillWorkoutData`, the mapper in `WorkoutLog.tsx` and `buildTemplatePrefill`; a missing optional field fails silently. `WorkoutDetails.buildPrefill` is the separate path for Edit / Perform Again.

### Home customization is held back
`HOME_CUSTOMIZATION_ENABLED` (`constants/dashboardCards.ts`) is `false`: Home renders `FIXED_HOME_ORDER` at full width and a saved `dashboard_layout_${uid}` is ignored, not deleted. Only list `'half'` in a card's `sizes` if it has a compact variant written for it.

### Home screen widgets (iOS `expo-widgets`, Android `react-native-android-widget`)
- iOS widget layout functions are not app code: they read only props and env (no imports, helpers, theme, `StyleSheet`). `__tests__/widgetLayouts.test.ts` enforces it; add new layouts there.
- All labels/colors come from `utils/widgetProps.ts`. Only `utils/widgets.ts` talks to either library, and widget files are never imported statically (lazy `require` in a `try`).
- Widget snapshot: write a section with data you already fetched, never a new request. A new screen that fetches `/api/stats/greek-rank` or a score should write it (`writeWidgetGreekRank` / `writeWidgetScore`). Store dates, never only a count.
- iOS widget changes need an EAS build to test; Android can be prebuilt on Windows (delete `android/` after).

### Live Activity (iOS workout)
- Everything goes through `utils/liveActivity.ts`; props from `utils/liveActivityProps.ts`. Update only when something shown changes (`liveKey`), never per second.
- `clearSession` must never end it (it runs on every resume). End explicitly on save, discard, unmount without minimize, logout/login and the cold-launch sweep. A new way to leave or finish a workout must end it too.

### GPS run session (`GpsRunContext`)
- The run lives in the provider; the screen is only a view and its unmount stops nothing. Pure math in `utils/gpsRun.ts`.
- Read with `useGpsRunStatus()` unless you need the live route: `useGpsRun()` re-renders every fix.
- One session at a time: a new way to start a workout or run must go through `utils/sessionConflict.ts`.
- Never run `cleanupOrphanedTracking()` when a screen opens (it would stop a minimized run). Auto-pause comes from fixes, never a timer.

### AsyncStorage keys
Full key tables (device-level and per-user `_${uid}`) are in `docs/app-reference.md`; add new keys there.
- Per-user keys carry the `_${userId}` suffix and need no clearing on logout.
- **Logout and login** clear `greek_rank_cached`, `@theme_accent`, `coach_insights_cache` (`AuthContext.tsx`); logout also clears `minimized_workout_session`, `user` and the SecureStore tokens. A stored workout (minimized or crash backup) carries its `ownerId`: `WorkoutSessionContext` restores nothing until an account signs in, gives each copy only to its owner, and stashes it under `minimized_workout_session_${uid}` across a sign-out. The daily reminder is cancelled on logout and rescheduled on login.
- `offline_workout_queue_${uid}` is never cleared on logout and nothing in it is deleted for the user. `secure_token_store_ready` is never cleared.
