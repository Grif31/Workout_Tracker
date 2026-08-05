// AsyncStorage keys shared across files that would otherwise create a circular
// import if pulled from their "owning" screen/context file directly (e.g.
// AuthContext.tsx's cross-cutting clear-on-logout list needs these, but
// GreekRankScreen.tsx and CoachScreen.tsx both import useAuth from
// AuthContext.tsx). Keep this file free of any context/screen imports.
export const GREEK_RANK_CACHED_KEY = 'greek_rank_cached';
export const COACH_INSIGHTS_KEY = 'coach_insights_cache';
