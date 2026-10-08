# Frontend notes (src/workout-tracker-native)

Moved here from the root CLAUDE.md so they only load when working in the app.

### Testing in-app purchases
The normal dev build can't load plans: its bundle ID is `com.aretefitness.app.dev` and Apple only serves the in-app purchases to `com.aretefitness.app`. Use the `development-store` EAS profile, a dev client with the production bundle ID (it replaces the App Store/TestFlight copy on the phone while installed):
```bash
eas build --profile development-store --platform ios   # once, then install it
cp .env.purchase-testing .env && npx expo start -c     # RevenueCat key on, beta premium off
```
A dev client takes its `EXPO_PUBLIC_*` values from the local `.env` at bundle time, not from the profile's `env`, which is why the swap is needed; `.env.purchase-testing` is local and gitignored. Sign in with an account that has no premium grant, with a Sandbox Apple Account set on the phone (Settings → Developer). Put the normal one back afterwards (`cp .env.normal .env`, then restart with `-c`), or every account in dev reads as free. Keep `.env.normal` in step with `.env` when adding a variable.

### AsyncStorage keys — define as named constants, share when used across files
```typescript
const MY_KEY = 'my_feature_key';
```
Shared keys that cross file boundaries live in `constants/` or are exported from the file that owns them (e.g. `COACH_PROFILE_KEY` exported from `components/coach/CoachProfileModal.tsx`, `REST_TIMER_KEY` exported from `components/workout/types.ts`). Never use the same key string as a bare literal in two different files.

### Charts (`react-native-gifted-charts` `LineChart`)
Don't derive `maxValue`/`yAxisOffset` from raw `min`/`max` + a percentage pad — on a narrow-range series (e.g. a Rep Record spanning 1-2 reps) each tick's *label* rounds independently and adjacent ticks can round to the same displayed number, and the labels can drift out of sync with where points actually plot. Use `computeChartYAxisRange(values, sections)` from `utils/prFormat.ts` (also mirrored inline in `StrengthScoreScreen.tsx`), which snaps the whole range to whole-number, evenly-divisible steps up front.

### WorkoutLog prefill — build it with `buildTemplatePrefill`

Anything that sends a template or routine day to WorkoutLog goes through `buildTemplatePrefill` in `utils/templatePrefill.ts` (Home's routine card, Coach's template Log, RoutineDetail, TemplateDetail). Four screens used to hand-roll this object and each dropped a different field, so the same template logged from different places gave different workouts (no exercise GIFs from some, no programmed sets/reps/RPE from others). Adding a field WorkoutLog reads means adding it to `PrefillWorkoutData`, to the mapper in `WorkoutLog.tsx`, and to `buildTemplatePrefill` — a `.map()` result is only checked for assignability, so a missing optional field fails silently rather than at compile time. `WorkoutDetails.buildPrefill` is the separate path for Edit / Perform Again, off a logged workout rather than a template.

### Home card sizes — a width is a rendering, not a style

> **Currently held back.** `HOME_CUSTOMIZATION_ENABLED` in `constants/dashboardCards.ts` is `false` until arrange mode is rebuilt as press-and-hold drag on the real cards (TODO.md section 20, Part B). While off: no customize button, Home renders `FIXED_HOME_ORDER` (Active Routine, Cardio This Week, Week Calendar, Recent Workouts) at full width, the Weekly Goal and Greek Rank widgets don't render, and `/api/stats/greek-rank` isn't fetched. A saved `dashboard_layout_${uid}` is **ignored, not deleted**: the earlier arrange mode could hide a card, and with no button to unhide it that card would be stranded. Everything below is built and tested (`__tests__/DashboardCustomization.test.tsx` mocks the flag on), so flipping it restores working code.

`DASHBOARD_CARDS` entries declare `sizes: CardSize[]` (`'full' | 'half'`), best-first, and the head is the card's default. **Only list `'half'` for a card that has a compact variant written for it** — narrowing is never just a width change, and the arrange-mode size toggle only appears for cards with more than one size, so an undeclared size can't be picked. Week Calendar (seven day columns) and Recent Workouts (a list) are full-only on purpose.

`packRows(layout)` turns the visible cards into rows: a `half` pairs with the next `half`, everything else takes its own row, and a trailing unpaired `half` stays half width rather than stretching. A card's compact branch reads `cardSize(layout, id) === 'half'`.

### Home screen widgets — `expo-widgets` (iOS), `react-native-android-widget` (Android)

Proven on a device 2026-09-25 (TODO.md section 19). Widgets live in `widgets/`, one file per widget, and are declared in the `expo-widgets` plugin entry in `app.config.js`, whose `name` must match `createWidget`'s first argument. The plugin generates an `ExpoWidgetsTarget` extension (bundle ID `<app bundle id>.widgets`) and App Group `group.<app bundle id>`, so dev and production builds never share widget data. Widgets exist only in EAS builds, and iOS can't be prebuilt on Windows: the first test of any widget change is `eas build --profile development --platform ios`. A new widget or App Group needs EAS to create its identifier and profile, which it prompts for during the build.

- **The layout function is not app code.** Its `'widget'` directive makes babel ship the function as a string that the extension evaluates in its own runtime, where the `@expo/ui/swift-ui` components and modifiers are globals. It can read only its props and environment: no helpers, constants, theme hooks or `StyleSheet`. The file's imports exist only for types. `__tests__/widgetLayouts.test.ts` compiles each layout the way Metro does and runs it for every family and state in a scope that records every free name, failing on anything that isn't a JS built-in or an `@expo/ui` export; add a new layout to it.
- **Every label, count and color comes from `utils/widgetProps.ts`** (`weeklyGoalProps`, `greekRankProps`), worked out in the app for one moment; the layout only picks the light or dark value from `env.colorScheme` and arranges it for `env.widgetFamily`. `renderWidgets` sends one timeline entry per moment the picture changes without new data (`widgetTimelineDates`: now, midnight next Monday, the moment the snapshot turns stale), each with that moment's props, so the rollover and the stale note need no date logic in the layout. Surfaces set their own `containerBackground` (#1C1C1E / #FFFFFF); iOS 17 has no default. Rank names as text use `GREEK_RANK_TEXT_COLORS`, not `GREEK_RANK_COLORS`, which fails 4.5:1 as text on one background or the other.
- iOS widgets: `WeeklyGoalWidget` (small, medium, lock screen circle and inline), `GreekRankWidget` (small, medium, lock screen rectangle) and `UpNextWidget` (small, medium). A `Gauge`'s `currentValueLabel` isn't reliably drawn (the lock screen showed an empty ring on Monday), so a ring's count is laid over it in a `ZStack`. A layout is saved into the App Group when the app runs `createWidget`, so a widget added before the app's first launch shows a red "No layout found" box until then.
- **Images are files in the App Group.** `Image uiImage` takes a file URL the extension can read, so `utils/widgetImages.ts` copies the bundled logos (`assets/widgets/`) into `widgetsDirectory`, with a version in the file name so a changed logo is a new file.
- **Taps are deep links.** Each widget sets `widgetURL` to one of `WIDGET_LINKS` (`aretefitness://widget/...`); `navigation/useWidgetLinks.ts`, mounted in `AppTabs`, routes them via `widgetRouteFor`. Up Next's Start (`upNextStartLink`, `?routine=&day=`) fetches the routine and opens WorkoutLog through `buildTemplatePrefill`, like Home's routine card; the day index is into the days sorted by `day_order`.
- **Up Next's muscle diagram** comes from `muscleDiagramSvg` (`utils/muscleDiagramSvg.ts`), one SVG of the same body outlines `MuscleDiagram` draws, from the `MUSCLE_SLUGS` map they share. Android's `SvgWidget` draws it directly. iOS widgets can't draw SVG, so `utils/widgetDiagrams.ts` queues a PNG per day, muscle set and accent (`diagramKey`), `components/WidgetDiagramRenderer.tsx` (mounted behind the navigator in `AppTabs`, iOS only) renders and captures each with `react-native-view-shot`, and the widgets redraw once a batch is in the App Group. Every day's diagram is made, not just the next one's, because the next day moves with what gets logged, and the widget may need any of them with the app closed. AppTabs only exists once someone is logged in and the preload is done, so a tap while logged out lands after login.
- **Data only flows in from the app.** The widget can't reach the JWT, so it shows whatever the app last handed it. iOS gets it through `updateTimeline`, which writes the App Group and reloads the widget; Android's task handler reads the stored snapshot. Only `utils/widgets.ts` talks to either library.

**The widget snapshot** (`utils/widgetSnapshot.ts`, pure; `utils/widgetData.ts`, storage) is the one source every widget draws from: sections `week`, `greekRank`, `scores`, `routine`, `accent`, plus `version`, `updatedAt` and `userId`.
- **Write a section with data you already fetched, never a new request.** The write points: `PreloadScreen` on every app open (week, Greek Rank, scores); Home (week from `/api/stats/profile` + `/api/workouts/dates`, routine, accent); every screen that fetches `/api/stats/greek-rank` (Greek Rank, Coach, Profile, Workout Summary) calls `writeWidgetGreekRank`; the two score screens and Coach call `writeWidgetScore`. A new screen that fetches one of these should write it too. Workout saves and deletes, goal and unit changes reach the widgets through Home's refetch on focus.
- **Writes are merged by section and queued.** A section passed replaces the stored one, the rest stay; `writeWidgetScore` merges one score into `scores`. A write is dropped unless its user is the one in `USER_KEY`, so a fetch that lands after logout can't bring the old account back, and a write for a different user than the stored one starts empty.
- **Week-bound sections carry their Monday** (`weekStart`), because a widget redraws days later with the app closed. `viewWeek` and `viewRoutine` recompute this week from a given date: on Monday the goal reads 0 without the app opening. The routine's next day is the rotation's (`nextIndex`, written by Home from `routineRotation`) and so does not reset on Monday; only a snapshot from an older build, with no `nextIndex`, falls back to the week-based rule. Store dates, never only a count. iOS gets that through its timeline entries' props; Android's task handler calls them with the current date.
- **Logout and login clear it** (`clearWidgetSnapshot` in `AuthContext`), and every widget has a logged-out state for a missing snapshot and a stale state once it's 7 days old (`isStale`).
- **Never import a widget file statically.** `createWidget` builds its native object on import, which throws in Expo Go or a binary built before the widget. `utils/widgets.ts` requires it inside a `try`, like `utils/healthKit.ts`.
- The plugin also sets `NSSupportsLiveActivities` in Info.plist unconditionally.

**Android** uses `react-native-android-widget` (expo-widgets 57's Android side is a placeholder; revisit on SDK 58). Widgets `WeeklyGoal` and `GreekRank` are declared in that library's plugin entry in `app.config.js`; each `name` must be a key of `ANDROID_WIDGETS` in `widgets/androidWidgets.tsx`. It works differently from iOS:
- The layouts (`widgets/androidWidgets.tsx`, parts in `widgets/androidParts.tsx`) are ordinary app JS built from the library's `FlexWidget`/`TextWidget`/`ImageWidget`/`SvgWidget`, not React Native views, drawn from the same `utils/widgetProps.ts` props as iOS so both platforms say the same thing. They render outside any React tree, so no hooks or `useTheme()`: each is drawn once per color scheme and returned as a `{ light, dark }` pair. RemoteViews have no percentage widths and no opacity, so bars get a width in dp from the widget's size and the stale state dims with rgba colors; rings and icons are SVG strings.
- **One resizable widget each**, the Android convention, rather than one per size: at 2x2 it draws the small layout, from `MEDIUM_MIN_WIDTH` (220dp) the medium one, reading the width Android passes with each draw.
- Android asks for a drawing (widget added, resized, or its hourly `updatePeriodMillis`) often with the app closed, by starting the JS runtime headless without mounting `App`. That's why `registerAndroidWidgets()` runs in `index.js`, before `registerRootComponent`. The task handler (`widgets/androidWidgetTaskHandler.tsx`) runs in the app's process, reads the saved snapshot and draws it for the current date, which is what rolls the week over on Monday (within the hour; Android's floor is 30 minutes). `requestWidgetUpdate` redraws placed widgets as soon as the app writes.
- Taps use `clickAction="OPEN_URI"` with the same `WIDGET_LINKS` as iOS, so `useWidgetLinks` handles both.
- Importing the library calls `TurboModuleRegistry.getEnforcing`, so it is lazy-loaded in `utils/widgets.ts` for the same reason as iOS.
- Unlike iOS, Android can be prebuilt and compiled on Windows: `npx expo prebuild --platform android --no-install`, then `./gradlew :react-native-android-widget:compileDebugJavaWithJavac` from `android/` with `JAVA_HOME` set to Android Studio's `jbr`. Delete the generated `android/` folder afterwards; it isn't gitignored and EAS generates its own.
- `@expo/ui` pulls in `react-dom` as a peer, which npm resolves to the newest version (needing a newer React) unless `react-dom` is pinned to SDK 57's version in `package.json`. The dev profile's legacy peer deps hide that; a production build's `npm ci` doesn't.

### AsyncStorage keys

**Device-level (shared across all accounts on the device):**
| Key | Default | Controls |
|---|---|---|
| `rest_timer_alerts_enabled` | true | Rest timer local notification |
| `live_workout_notif_enabled` | true | Live workout system notification |
| `minimized_workout_session` | — | Serialized minimized workout state (WorkoutSessionContext) |
| `greek_rank_cached` | — | Cached current Greek rank name (avoids fetch on cold open) |
| `coach_insights_cache` | — | Cached AI coach insights JSON |
| `secure_token_store_ready` | — | Marks that this install set up its SecureStore tokens. Never cleared on logout: iOS keeps keychain items across an uninstall and AsyncStorage doesn't, so a missing marker is how `loadTokens` recognises a fresh install and drops a previous install's tokens. Its first absence on an updated install is also when the pre-SecureStore AsyncStorage tokens get migrated |
| `widget_snapshot` | — | Everything the home screen widgets show, as one versioned JSON blob for whoever is logged in (`WIDGET_SNAPSHOT_KEY`, `utils/widgetSnapshot.ts`). Written only through `utils/widgetData.ts`; cleared on logout and login (see Home screen widgets) |

**Per-user (key includes user ID suffix `_${userId}`):**
| Key pattern | Default | Controls |
|---|---|---|
| `workout_reminders_enabled_${uid}` | false | Daily reminder notification |
| `workout_reminder_hour_${uid}` | '9' | Reminder hour |
| `workout_reminder_minute_${uid}` | '00' | Reminder minute |
| `health_sync_enabled_${uid}` | false | Apple Health / Health Connect sync toggle |
| `plate_calc_bar_${uid}` | 'standard' | Last-used bar type in plate calculator |
| `plate_calc_plates_${uid}` | all on | Plate sizes switched **off** in the plate calculator, per unit: JSON `{lbsOff, kgOff}`, so a plate added in a later release starts on. Older builds stored one unitless array of plates switched on; `enabledPlatesFor` in `utils/plateCalc.ts` reads both and applies an old array only to the unit whose plates it names |
| `default_rest_timer_${uid}` | '90' | Default rest timer duration in seconds |
| `gps_distance_unit_${uid}` | 'mi' | Distance unit for GPS cardio activities ('km' or 'mi') |
| `workout_weekly_goal_${uid}` | '3' | Weekly workout target (integer string) |
| `workout_weekly_distance_goal_${uid}` | — | Optional weekly distance target, stored in **km** (display converts to the GPS distance unit, so a mi/km switch never changes it). Absent = no goal. Set in Coach's Weekly Goal modal, shown as a fill line on the Weekly Goal card and as the Distance chart's goal line. Display only: no streak or summary reads it |
| `workout_auto_rest_${uid}` | true | Auto-start rest timer after a set |
| `workout_vibrate_${uid}` | true | Vibrate when rest timer completes |
| `workout_show_rpe_${uid}` | false | Show RPE input per set |
| `workout_show_plate_calc_${uid}` | true | Show plate calculator in workout |
| `workout_repeat_last_set_${uid}` | false | Add Set pre-fills the new set with the last set's values |
| `workout_prefill_previous_sets_${uid}` | true | Adding an exercise pre-fills its sets with last session's reps/weight for that exercise |
| `onboarding_complete_${uid}` | — | This account finished or skipped onboarding on this phone (`utils/onboarding.ts`). Checked after the preload: an account with logged workouts skips onboarding and gets the flag. The unsuffixed `onboarding_complete` from older builds was one flag for the whole phone, which let a second account skip onboarding; it's handed to whichever account is signed in when the update lands, then deleted |
| `profile_frame_rank_${uid}` | 'Neophyte' | Selected avatar frame rank name |
| `home_streak_type_${uid}` | 'weekly' | Which streak Home's top bar shows ('weekly' \| 'monthly' \| 'daily'), picked in its streak modal |
| `@pr_pins_${uid}` | — | JSON array of 3 pinned PR slots on Profile (Pin\|null)[] |
| `pr_dashboard_pins_${uid}` | — | Exercises (optionally a specific PR type + context) pinned to PR Dashboard's Pinned Progression section — JSON `{id, name, prType?, weightContext?}[]`, max 6 slots total; an exercise can have more than one pin for different PR types (keyed by exercise+type+context, not exercise id alone). Toggled from PRProgressionScreen. Legacy pins with no `prType` loosely match any type on that exercise |
| `coach_free_insight_${uid}` | — | A free account's weekly AI insights and when they were fetched (JSON `{insights, fetchedAt}`). CoachScreen shows the first in full, counts the rest as locked, and offers a new fetch after 7 days. Premium accounts use `coach_insights_cache` instead |
| `coach_profile_${uid}` | — | Coach personalization JSON (goal/equipment/schedule/injuries) |
| `dashboard_layout_${uid}` | — | Home card order, hidden ids and per-card widths (`utils/dashboardLayout.ts`). **Not read while `HOME_CUSTOMIZATION_ENABLED` is off** (see Home card sizes). Edited in Home's arrange mode (the options button in the Dashboard top bar swaps the cards for draggable chips in place; there is no separate screen). `normalizeLayout` repairs a stored layout against `constants/dashboardCards.ts`: unknown ids are dropped, cards added in later releases slot back at their default position (so a saved layout never hides a new card), and a stored size the card no longer renders falls back to one it does |
| `strength_score_last_tier_${uid}` | — | Last celebrated overall Strength Score tier index (`STRENGTH_TIERS` ordinal), used to detect rank-up moments across app opens |
| `endurance_score_last_tier_${uid}` | — | Same thing for the Endurance Score — its own slot, so ranking up as a runner and as a lifter are separate moments |
| `weekly_summary_last_shown_${uid}` | — | Monday date-string of the last week the Weekly Summary auto-popup was checked/shown for, so it only appears once per week |
| `exercise_list_cache_${uid}` | — | Exercise list cache, 24h TTL (`utils/exerciseCache.ts`; falls back to un-suffixed key when no userId passed) |
| `offline_workout_queue_${uid}` | — | Offline workout queue (`utils/offlineQueue.ts`) — deliberately NOT cleared on logout; each user's queue waits for them and is only flushed while they are logged in |
| `gps_run_checkpoint_${uid}` | — | In-progress GPS run checkpoint (route/distance/elapsed) written every ~10 points; restore offered on next screen open after a crash |
| `coach_settings_${uid}` | — | Legacy onboarding settings (migrated to coach_profile on first open) |
| `coach_insights_cache` | — | Cached AI coaching insights JSON + fetchedAt timestamp |
| `coach_settings` | — | Legacy key — migrated to `coach_profile` on first CoachProfileModal open |

**On logout**, `AuthContext.tsx` deletes the `token`/`refresh_token` SecureStore items (`clearStoredTokens`) and clears via `AsyncStorage.multiRemove`: `user`, `greek_rank_cached`, `@theme_accent`, `coach_insights_cache`, `minimized_workout_session`. **On login**, the same four cache keys (`greek_rank_cached`, `@theme_accent`, `coach_insights_cache`, `minimized_workout_session`) are cleared before the new session starts, so a freshly logged-in user never sees the previous account's cached data. Per-user-suffixed keys (`coach_profile_${uid}`, `workout_weekly_goal_${uid}`, `@pr_pins_${uid}`, etc.) don't need clearing — each account already has its own slot. The daily workout reminder is the exception that needs work: its setting is per user but it's one scheduled notification on the device, so logout cancels it and login reschedules the incoming user's (`restoreWorkoutReminder` in `utils/notifications.ts`).

---
