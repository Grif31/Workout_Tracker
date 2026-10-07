// Shared palette for share-card components (PRShareCard, WorkoutShareCard,
// WeeklySummaryShareCard, StrengthScoreShareCard, CardioShareCard).
// Fixed dark look, independent of the app's light/dark theme — these render
// as static images for sharing outside the app, so they must look identical
// regardless of the viewer's theme.
export const SHARE_BG          = '#0D0D0D'; // outer card background
export const SHARE_SURFACE     = '#1C1C1E'; // stats row / route-trace box background
export const SHARE_DIVIDER     = '#2C2C2E'; // stat divider line
export const SHARE_TEXT        = '#FFFFFF'; // primary text (names, stat values)
export const SHARE_TEXT_MUTED  = '#8E8E93'; // secondary text (date, stat labels)
export const SHARE_TEXT_FOOTER = '#636366'; // footer text ("aretefitnessapp.com")
// Solid backing the card sits on in the captured image. Without it the rounded
// corners are transparent, which other apps fill with black or white wedges.
export const SHARE_BACKING     = '#000000';
