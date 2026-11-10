import eas from '../eas.json';
import pkg from '../package.json';
const { envMismatches } = require('../scripts/publishUpdate');

// EXPO_PUBLIC_BETA_PREMIUM makes PurchaseContext grant premium to everyone. A
// production build carrying it gives the App Store app away; beta testers keep
// premium through a RevenueCat promotional grant instead.
it('production builds never set EXPO_PUBLIC_BETA_PREMIUM', () => {
  expect(eas.build.production.env).not.toHaveProperty('EXPO_PUBLIC_BETA_PREMIUM');
});

// publishUpdate.js publishes to the channel and EAS environment named after the
// profile, so a build must listen on its own profile's name
it('each store-facing build listens on the channel named after its profile', () => {
  expect(eas.build.production.channel).toBe('production');
  expect(eas.build.preview.channel).toBe('preview');
});

it('updates are published only through the env-checking script', () => {
  expect(pkg.scripts['update:production']).toBe('node scripts/publishUpdate.js production');
  expect(pkg.scripts['update:preview']).toBe('node scripts/publishUpdate.js preview');
});

describe('envMismatches', () => {
  const profile = { EXPO_PUBLIC_API_URL: 'https://api', EXPO_PUBLIC_USE_RN_FETCH: '1', NODE_ENV: 'x' };

  it('passes when the EAS environment carries exactly the profile values', () => {
    expect(envMismatches(profile, { EXPO_PUBLIC_API_URL: 'https://api', EXPO_PUBLIC_USE_RN_FETCH: '1', PATH: '/bin' })).toEqual([]);
  });

  it('flags a missing value, a changed value and an extra one', () => {
    expect(envMismatches(profile, { EXPO_PUBLIC_API_URL: 'http://localhost', EXPO_PUBLIC_BETA_PREMIUM: 'true' })).toEqual([
      'EXPO_PUBLIC_API_URL differs from eas.json',
      'EXPO_PUBLIC_USE_RN_FETCH is missing',
      "EXPO_PUBLIC_BETA_PREMIUM is set but the build profile doesn't set it",
    ]);
  });
});
