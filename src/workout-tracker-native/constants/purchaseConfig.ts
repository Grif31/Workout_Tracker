// Build-time purchase settings, in their own module so tests can swap them:
// babel inlines process.env reads, which freezes them inside whatever file
// reads them.
export const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
// Only the development and preview profiles set EXPO_PUBLIC_BETA_PREMIUM. Production must not:
// beta testers keep premium through a RevenueCat promotional grant (scripts/grant_beta_premium.py).
export const BETA_PREMIUM = process.env.EXPO_PUBLIC_BETA_PREMIUM === 'true';
