import '@testing-library/jest-native/extend-expect';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialIcons: 'MaterialIcons',
  FontAwesome: 'FontAwesome',
  FontAwesome5: 'FontAwesome5',
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true })),
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' })
  ),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-gifted-charts', () => ({
  BarChart: () => null,
  LineChart: () => null,
}));

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  const nav = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    setOptions: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    isFocused: jest.fn(() => true),
  };
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (cb: () => void) => { useEffect(() => { cb(); return () => {}; }, []); },
    useNavigation: () => nav,
    useRoute: () => ({ params: {} }),
  };
});

jest.mock('./context/AuthContext', () => {
  const loginFn = jest.fn();
  const logoutFn = jest.fn();
  const updateUserFn = jest.fn();
  return {
    useAuth: () => ({
      user: {
        id: 1, username: 'testuser', email: 'test@example.com',
        name: 'Test User', bio: null, bodyweight: 185,
        weight_unit: 'lbs', profile_pic_url: null, active_routine_id: null,
      },
      token: 'test-token',
      login: loginFn,
      logout: logoutFn,
      updateUser: updateUserFn,
      loading: false,
    }),
    AuthProvider: ({ children }: any) => children,
  };
});

jest.mock('./context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#000', surface: '#1C1C1E', border: '#333',
      textPrimary: '#FFF', textSecondary: '#AAA', placeholder: '#666',
      accent: '#30D158', accentText: '#000', save: '#30D158', danger: '#FF453A',
    },
    mode: 'dark',
    accentPreset: { name: 'Green', value: '#30D158', text: '#000' },
    toggleMode: jest.fn(),
    setAccentPreset: jest.fn(),
  }),
  ThemeProvider: ({ children }: any) => children,
  ACCENT_PRESETS: [{ name: 'Green', value: '#30D158', text: '#000' }],
}));

jest.mock('./context/WorkoutSessionContext', () => ({
  useWorkoutSession: () => ({
    session: null,
    saveSession: jest.fn(),
    clearSession: jest.fn(),
    isWorkoutOpen: false,
    setWorkoutOpen: jest.fn(),
  }),
  WorkoutSessionProvider: ({ children }: any) => children,
}));

jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: View, Svg: View, Path: View, Circle: View };
});

jest.mock('react-native-body-highlighter', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(() => Promise.resolve('file://mock.png')),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(() => Promise.resolve()),
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
}));

// react-native-reanimated and worklets require native init — stub without importing real module
jest.mock('react-native-worklets', () => ({
  createSerializable: jest.fn((v: any) => v),
  makeShareable: jest.fn((v: any) => v),
  makeShareableCloneRecursive: jest.fn((v: any) => v),
  isShareableRef: jest.fn(() => false),
  runOnUI: jest.fn((fn: any) => fn),
  runOnJS: jest.fn((fn: any) => fn),
}));
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const shared = (v: any) => ({ value: v });
  return {
    __esModule: true,
    default: { createAnimatedComponent: (c: any) => c },
    createAnimatedComponent: (c: any) => c,
    useSharedValue: shared,
    useDerivedValue: (fn: any) => shared(fn()),
    useAnimatedStyle: (fn: any) => fn(),
    useAnimatedProps: (fn: any) => fn(),
    useAnimatedRef: () => ({ current: null }),
    useAnimatedScrollHandler: jest.fn(),
    useAnimatedGestureHandler: jest.fn(),
    withTiming: (v: any) => v,
    withSpring: (v: any) => v,
    withDelay: (_: any, v: any) => v,
    withRepeat: (v: any) => v,
    withSequence: (...args: any[]) => args[args.length - 1],
    cancelAnimation: jest.fn(),
    runOnJS: (fn: any) => fn,
    runOnUI: (fn: any) => fn,
    interpolate: jest.fn((v: any) => v),
    interpolateColor: jest.fn((v: any) => v),
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Easing: { linear: (t: any) => t, ease: (t: any) => t, bezier: () => (t: any) => t },
    getUseOfValueInStyleWarning: jest.fn(),
    addWhitelistedNativeProps: jest.fn(),
    addWhitelistedUIProps: jest.fn(),
    View: RN.View,
    Text: RN.Text,
    Image: RN.Image,
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
  };
});

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (c: any) => c,
  captureException: jest.fn(),
  setUser: jest.fn(),
}));

// react-native-purchases ships untransformable minified deps — never load real IAP in tests
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    logIn: jest.fn(() => Promise.resolve()),
    getCustomerInfo: jest.fn(() => Promise.resolve({ entitlements: { active: {} } })),
    getOfferings: jest.fn(() => Promise.resolve({ current: null })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(() => Promise.resolve({ entitlements: { active: {} } })),
  },
}));

jest.mock('./context/PurchaseContext', () => ({
  usePurchase: () => ({
    isPremium: true,
    offerings: null,
    purchasePackage: jest.fn(() => Promise.resolve(true)),
    restorePurchases: jest.fn(() => Promise.resolve(true)),
    loading: false,
  }),
  PurchaseProvider: ({ children }: any) => children,
}));
