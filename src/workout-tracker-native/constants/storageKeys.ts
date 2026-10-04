// AsyncStorage keys shared across files that would otherwise create a circular
// import if pulled from their "owning" screen/context file directly (e.g.
// AuthContext.tsx's cross-cutting clear-on-logout list needs these, but
// GreekRankScreen.tsx and CoachScreen.tsx both import useAuth from
// AuthContext.tsx). Keep this file free of any context/screen imports.
export const GREEK_RANK_CACHED_KEY = 'greek_rank_cached';
export const COACH_INSIGHTS_KEY = 'coach_insights_cache';

// Session keys. The two token keys name SecureStore (keychain/keystore) items,
// read and written only through utils/tokenStorage.ts; they were AsyncStorage
// slots in earlier builds, which tokenStorage migrates from once. USER_KEY is
// still AsyncStorage: the offline queue reads it to find whose queue to flush.
export const TOKEN_KEY = 'token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const USER_KEY = 'user';
// AsyncStorage marker that this install has set up its SecureStore tokens.
// Device-level, never cleared on logout: see loadTokens in utils/tokenStorage.ts.
export const TOKEN_STORE_READY_KEY = 'secure_token_store_ready';

export const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';
export const LIVE_WORKOUT_NOTIF_KEY = 'live_workout_notif_enabled';
// Settings owns writing this; WorkoutLog reads it before every rest-timer
// alert it schedules, so it has to be shared rather than redeclared.
export const REST_ALERTS_KEY = 'rest_timer_alerts_enabled';
// Per user: `${WEEKLY_GOAL_KEY}_${userId}`.
export const WEEKLY_GOAL_KEY = 'workout_weekly_goal';
// Per user: `${WEEKLY_DISTANCE_GOAL_KEY}_${userId}`. Optional weekly distance
// target, stored in km so a mi/km switch in Settings never changes it. No key
// means the user hasn't turned one on. Display only: it feeds no streaks.
export const WEEKLY_DISTANCE_GOAL_KEY = 'workout_weekly_distance_goal';
// Per user: `${PROFILE_FRAME_RANK_KEY}_${userId}`, the avatar frame picked on Greek Rank.
export const PROFILE_FRAME_RANK_KEY = 'profile_frame_rank';
// Per user: `${HOME_STREAK_TYPE_KEY}_${userId}`, 'weekly' | 'monthly' | 'daily',
// the streak Home's top bar shows.
export const HOME_STREAK_TYPE_KEY = 'home_streak_type';
// Per user: `${KEY}_${userId}`. The daily reminder is one scheduled
// notification on the device, so login reschedules it from these and logout
// cancels it (utils/notifications.ts); Settings edits them.
export const REMINDERS_KEY = 'workout_reminders_enabled';
export const REMINDER_HOUR_KEY = 'workout_reminder_hour';
export const REMINDER_MIN_KEY = 'workout_reminder_minute';
