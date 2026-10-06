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

// Dev only: show onboarding on every sign-in or launch, even for an account
// that finished it or has logged workouts, so the flow can be tried on a real
// account. __DEV__ keeps it out of release builds whatever this is set to.
export const FORCE_ONBOARDING = __DEV__ && false;

// Dev only: treat the account as free and give the paywall sample plans, so
// its design can be reviewed in the normal dev build, which can't load the
// real App Store products (see "Testing in-app purchases" in CLAUDE.md).
// "Buying" a sample plan just unlocks premium until the app restarts.
// Ignored when a RevenueCat key is set, and never on in release builds.
export const PAYWALL_PREVIEW = __DEV__ && false;
