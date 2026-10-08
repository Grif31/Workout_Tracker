const IS_DEV = process.env.APP_VARIANT === 'development';
const IOS_BUNDLE_ID = IS_DEV ? 'com.aretefitness.app.dev' : 'com.aretefitness.app';

// Google sign-in OAuth clients (Google Cloud console, Credentials). Not
// secrets: they ship inside the app. One iOS client per bundle ID, so the dev
// build signs in as itself; the backend's GOOGLE_CLIENT_IDS lists every client.
// Android's own clients (package plus signing SHA-1) are matched by Google
// itself and never named here; the app passes the Web client's ID instead.
const GOOGLE_IOS_CLIENT_ID = IS_DEV
  ? '722911736139-je9hmktkpeddboafh2acl175il3a1u12.apps.googleusercontent.com'
  : '722911736139-v5vbpr2a1iu7jgmfchc671nju2707o2m.apps.googleusercontent.com';
// Google returns to the app through this URL scheme: the client ID reversed
const GOOGLE_IOS_URL_SCHEME = GOOGLE_IOS_CLIENT_ID.split('.').reverse().join('.');
// Android asks for tokens with the Web client's ID (one for both builds)
const GOOGLE_WEB_CLIENT_ID = '722911736139-dl922st1nco0mk1s8vfhiek6dphevme9.apps.googleusercontent.com';

module.exports = {
  expo: {
    name: IS_DEV ? 'Aretē (Dev)' : 'Aretē',
    slug: 'workout-tracker-native',
    scheme: 'aretefitness',
    version: '1.1.9',
    orientation: 'portrait',
    icon: './assets/Arete_icon.png',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: IOS_BUNDLE_ID,
      buildNumber: '3',
      entitlements: {
        'com.apple.developer.usernotifications.time-sensitive': true,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'Aretē uses your location to track GPS cardio workouts.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Aretē uses your location to record your workout route, including while your screen is off or the app is in the background.',
        // Background location keeps recording the route while the screen is locked
        UIBackgroundModes: ['location'],
        NSPhotoLibraryUsageDescription:
          'Aretē accesses your photos to set a profile picture and add progress photos.',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        // Not the iOS icon: Android shows only the middle two thirds of this
        // layer, masked to the launcher's shape, which cut off the plates and
        // the A's legs. This is the same logo cut out and scaled to 62% so it
        // fits Android's safe circle, over a flat gray matching the iOS icon's.
        foregroundImage: './assets/Arete_adaptive_foreground.png',
        backgroundColor: '#F2F2F2',
      },
      package: IS_DEV ? 'com.aretefitness.app.dev' : 'com.aretefitness.app',
      versionCode: 3,
      permissions: [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_LOCATION',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.VIBRATE',
      ],
      // Nothing records audio (image picker is photos-only), and App Review and
      // the Play listing both surface a mic permission. Blocked rather than just
      // omitted so a library's config plugin can't merge it back in.
      blockedPermissions: ['android.permission.RECORD_AUDIO'],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      eas: {
        projectId: '356b88e9-4302-43fc-b50a-6d83030b8fa6',
      },
      // Read by hooks/useSocialAuth.ts through expo-constants
      googleSignIn: { iosClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID },
    },
    plugins: [
      'expo-dev-client',
      [
        // SDK 56 removed the top-level `splash` field. SDK 55 handled that field
        // with two defaults this plugin doesn't apply, so both are set here:
        // without them the full-screen splash image drew as a 100pt thumbnail
        // in the middle of the screen, before SplashView (which mirrors this
        // image full screen) took over.
        'expo-splash-screen',
        {
          image: './assets/Arete_splash.png',
          resizeMode: 'contain',
          backgroundColor: '#141416',
          // iOS: draw the image full screen, as the old top-level field did.
          enableFullScreenImage_legacy: true,
          // Android's system splash only shows a centred image; 200 is what
          // SDK 55 used for the top-level field (the plugin defaults to 100).
          imageWidth: 200,
        },
      ],
      'expo-font',
      'expo-sharing',
      'expo-status-bar',
      '@react-native-community/datetimepicker',
      [
        // Auth tokens live in the keychain/keystore. The plugin's default Face ID
        // prompt string is for biometric-gated items, which the app has none of;
        // its Android backup rules stay on, since restored keystore ciphertext
        // can't be decrypted on a new device anyway.
        'expo-secure-store',
        { faceIDPermission: false },
      ],
      'expo-asset',
      'expo-web-browser',
      [
        // react-native-health-connect's androidx.health.connect:connect-client
        // dependency requires API 26+ — Expo's default minSdk (24) fails the
        // manifest merge otherwise ("uses-sdk:minSdkVersion 24 cannot be
        // smaller than version 26 declared in library [...connect-client]").
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 26,
          },
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'Aretē uses your location to track GPS cardio workouts.',
          locationAlwaysAndWhenInUsePermission:
            'Aretē uses your location to record your workout route, including while your screen is off or the app is in the background.',
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission:
            'Aretē accesses your photos to set a profile picture and add progress photos.',
          // The plugin adds RECORD_AUDIO and an iOS mic prompt by default, for video.
          microphonePermission: false,
        },
      ],
      [
        'react-native-maps',
        {
          // The plugin's config keys are androidGoogleMapsApiKey/iosGoogleMapsApiKey,
          // NOT a flat googleMapsApiKey — that got silently ignored on both
          // platforms, leaving no com.google.android.geo.API_KEY meta-data in
          // AndroidManifest.xml ("API key not found" on Android). iOS has no
          // key here since it isn't forced onto the Google provider — it just
          // uses Apple Maps by default.
          // Read from env (GOOGLE_MAPS_API_KEY_ANDROID), not hardcoded — set
          // it in .env locally (gitignored) and as an EAS secret for cloud
          // builds so the key value itself never lands in git history.
          androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/Arete_icon.png',
          color: '#ffffff',
          defaultChannel: 'default',
        },
      ],
      [
        // Replaced react-native-health, which is an old-architecture bridge
        // module and therefore dead under RN 0.83's bridgeless-only runtime.
        // This plugin takes the raw Info.plist key names, unlike the old one.
        '@kingstinct/react-native-healthkit',
        {
          NSHealthShareUsageDescription:
            'Aretē reads your heart rate from Apple Health to show heart rate on your workouts.',
          NSHealthUpdateUsageDescription: 'Aretē writes workout sessions to Apple Health.',
        },
      ],
      'react-native-health-connect',
      'expo-apple-authentication',
      ['@react-native-google-signin/google-signin', { iosUrlScheme: GOOGLE_IOS_URL_SCHEME }],
      [
        // iOS home screen widget (TODO.md section 19). Both identifiers follow
        // the app's, so the dev build's widget reads the dev app's App Group and
        // never the store app's. enableAndroid stays off until the iOS widget
        // is proven on a device.
        'expo-widgets',
        {
          bundleIdentifier: `${IOS_BUNDLE_ID}.widgets`,
          groupIdentifier: `group.${IOS_BUNDLE_ID}`,
          // Each name must match its createWidget call in widgets/. The
          // accessory families are the lock screen widgets.
          widgets: [
            {
              name: 'WeeklyGoalWidget',
              displayName: 'Weekly Goal',
              description: 'Your workouts this week against your goal, and your streak.',
              supportedFamilies: ['systemSmall', 'systemMedium', 'accessoryCircular', 'accessoryInline'],
            },
            {
              name: 'GreekRankWidget',
              displayName: 'Greek Rank',
              description: 'Your Greek Rank and how close you are to the next one.',
              supportedFamilies: ['systemSmall', 'systemMedium', 'accessoryRectangular'],
            },
            {
              name: 'UpNextWidget',
              displayName: 'Up Next',
              description: "Your routine's next day, one tap from starting it.",
              supportedFamilies: ['systemSmall', 'systemMedium'],
            },
          ],
        },
      ],
      [
        // Android home screen widgets, the twins of the iOS ones above. Each
        // name must be a key of ANDROID_WIDGETS in widgets/androidWidgets.tsx.
        // One resizable widget each, rather than one per size as on iOS: 2x2
        // draws the small layout, about 4 cells wide the medium one.
        // Android only redraws a widget on its update period (30 minutes at
        // the least), and that redraw is what rolls the week over on Monday
        // with the app closed: hourly keeps it within the hour.
        'react-native-android-widget',
        {
          widgets: [
            {
              name: 'WeeklyGoal',
              label: 'Weekly Goal',
              description: 'Your workouts this week against your goal, and your streak.',
              minWidth: '110dp',
              minHeight: '110dp',
              targetCellWidth: 2,
              targetCellHeight: 2,
              resizeMode: 'horizontal|vertical',
              updatePeriodMillis: 60 * 60 * 1000,
            },
            {
              name: 'GreekRank',
              label: 'Greek Rank',
              description: 'Your Greek Rank and how close you are to the next one.',
              minWidth: '110dp',
              minHeight: '110dp',
              targetCellWidth: 2,
              targetCellHeight: 2,
              resizeMode: 'horizontal|vertical',
              updatePeriodMillis: 60 * 60 * 1000,
            },
            {
              name: 'UpNext',
              label: 'Up Next',
              description: "Your routine's next day, one tap from starting it.",
              minWidth: '110dp',
              minHeight: '110dp',
              targetCellWidth: 2,
              targetCellHeight: 2,
              resizeMode: 'horizontal|vertical',
              updatePeriodMillis: 60 * 60 * 1000,
            },
          ],
        },
      ],
      // Sentry source-map upload — only active once SENTRY_ORG/SENTRY_PROJECT
      // are set (EAS env or .env). Runtime crash reporting works without it,
      // but stack traces stay minified until this is configured along with
      // SENTRY_AUTH_TOKEN in EAS secrets.
      ...(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
        ? [[
            '@sentry/react-native/expo',
            {
              organization: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
            },
          ]]
        : []),
      // react-native-purchases is NOT a config plugin — listing it here makes
      // Expo import its JS bundle as a plugin and crash. It needs no plugin;
      // autolinking handles the native module in EAS builds.
    ],
  },
};
