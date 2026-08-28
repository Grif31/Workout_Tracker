// Alternate app icons aren't designed yet — flip to true when the icon assets
// ship. Gates the Settings row, Paywall perk, and onboarding premium list.
export const APP_ICONS_ENABLED = false;

// Apple Health / Health Connect sync isn't working yet — flip to true once
// fixed. Gates the Settings Health section only; healthKit.ts/healthConnect.ts
// and the sync call sites in WorkoutLog.tsx are untouched.
export const HEALTH_SYNC_ENABLED = false;
