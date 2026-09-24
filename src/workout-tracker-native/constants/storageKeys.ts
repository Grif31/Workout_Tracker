// AsyncStorage keys shared across files that would otherwise create a circular
// import if pulled from their "owning" screen/context file directly (e.g.
// AuthContext.tsx's cross-cutting clear-on-logout list needs these, but
// GreekRankScreen.tsx and CoachScreen.tsx both import useAuth from
// AuthContext.tsx). Keep this file free of any context/screen imports.
export const GREEK_RANK_CACHED_KEY = 'greek_rank_cached';
export const COACH_INSIGHTS_KEY = 'coach_insights_cache';

// Session keys: written by AuthContext, read and rotated by api.ts on token
// refresh, and read by the offline queue to find whose queue to flush.
export const TOKEN_KEY = 'token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const USER_KEY = 'user';

export const ONBOARDING_COMPLETE_KEY = 'onboarding_complete';
export const LIVE_WORKOUT_NOTIF_KEY = 'live_workout_notif_enabled';
// Settings owns writing this; WorkoutLog reads it before every rest-timer
// alert it schedules, so it has to be shared rather than redeclared.
export const REST_ALERTS_KEY = 'rest_timer_alerts_enabled';
// Per user: `${WEEKLY_GOAL_KEY}_${userId}`.
export const WEEKLY_GOAL_KEY = 'workout_weekly_goal';
// Per user: `${PROFILE_FRAME_RANK_KEY}_${userId}`, the avatar frame picked on Greek Rank.
export const PROFILE_FRAME_RANK_KEY = 'profile_frame_rank';
