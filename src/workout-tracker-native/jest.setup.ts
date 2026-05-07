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
  useWorkoutSession: () => ({ session: null, saveSession: jest.fn(), clearSession: jest.fn() }),
  WorkoutSessionProvider: ({ children }: any) => children,
}));
