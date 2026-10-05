import eas from '../eas.json';

// EXPO_PUBLIC_BETA_PREMIUM makes PurchaseContext grant premium to everyone. A
// production build carrying it gives the App Store app away; beta testers keep
// premium through a RevenueCat promotional grant instead.
it('production builds never set EXPO_PUBLIC_BETA_PREMIUM', () => {
  expect(eas.build.production.env).not.toHaveProperty('EXPO_PUBLIC_BETA_PREMIUM');
});
