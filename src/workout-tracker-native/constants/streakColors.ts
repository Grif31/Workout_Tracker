// Flame colors for the streak icon (components/StreakFlame.tsx). Named here
// rather than inline for the same reason as PR gold: they're brand marks, not
// theme tokens, and must not drift between light and dark mode.
export const FLAME_TOP    = '#FF9F1C'; // outer flame, upper
export const FLAME_MID    = '#FF7A1E'; // outer flame, middle stop: keeps the
                                       // top-to-bottom blend from banding
export const FLAME_BOTTOM = '#FF5A1F'; // outer flame, lower (hotter, redder)
export const FLAME_CORE   = '#FFD84D'; // inner core
