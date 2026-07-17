const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = {
  expo: {
    name: IS_DEV ? 'Aretē (Dev)' : 'Aretē',
    slug: 'workout-tracker-native',
    scheme: 'aretefitness',
    version: '1.0.1',
    orientation: 'portrait',
    icon: './assets/Arete_icon.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/Arete_splash.png',
      resizeMode: 'contain',
      backgroundColor: '#141416',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV ? 'com.aretefitness.app.dev' : 'com.aretefitness.app',
      buildNumber: '2',
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
        foregroundImage: './assets/Arete_icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: IS_DEV ? 'com.aretefitness.app.dev' : 'com.aretefitness.app',
      versionCode: 2,
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
        'android.permission.RECORD_AUDIO',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      eas: {
        projectId: '356b88e9-4302-43fc-b50a-6d83030b8fa6',
      },
    },
    plugins: [
      'expo-dev-client',
      'expo-asset',
      'expo-web-browser',
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
        },
      ],
      [
        'react-native-maps',
        {
          googleMapsApiKey: 'YOUR_GOOGLE_MAPS_API_KEY_HERE',
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
        'react-native-health',
        {
          NSHealthShareUsageDescription: 'Aretē reads health data to display workout metrics.',
          NSHealthUpdateUsageDescription: 'Aretē writes workout sessions to Apple Health.',
        },
      ],
      'react-native-health-connect',
      'expo-apple-authentication',
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
