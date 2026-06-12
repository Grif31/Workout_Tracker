const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = {
  expo: {
    name: IS_DEV ? 'Aretē (Dev)' : 'Aretē',
    slug: 'workout-tracker-native',
    scheme: 'aretefitness',
    version: '1.0.0',
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
      // react-native-purchases is NOT a config plugin — listing it here makes
      // Expo import its JS bundle as a plugin and crash. It needs no plugin;
      // autolinking handles the native module in EAS builds.
    ],
  },
};
