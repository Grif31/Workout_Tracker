// Alternate app icons aren't designed yet — flip to true when the icon assets
// ship. Gates the Settings row, Paywall perk, and onboarding premium list.
export const APP_ICONS_ENABLED = false;

// Gates the Settings Health section. This was false because iOS sync was dead:
// react-native-health is an old-architecture bridge module and RN 0.83 is
// bridgeless-only, so it never registered and every call threw. Android
// (react-native-health-connect, a real TurboModule) was always fine and was
// only collateral damage from this one flag covering both platforms.
// iOS now runs on @kingstinct/react-native-healthkit — verify in a TestFlight
// build before the next App Store submission.
export const HEALTH_SYNC_ENABLED = true;
