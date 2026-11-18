import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import SettingsScreen from '../screens/ProfileTab/SettingsScreen';

// Alert stand-in that answers the unit switch's confirmation with "Convert"
const confirmingAlert = (_t: string, _m?: string, buttons?: any[]) =>
  buttons?.find(b => String(b.text).startsWith('Convert'))?.onPress?.();

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../utils/notifications', () => ({
  requestNotificationPermission: jest.fn(),
  hasNotificationPermission: jest.fn(() => Promise.resolve(true)),
  scheduleWorkoutReminder: jest.fn(),
  cancelWorkoutReminder: jest.fn(),
}));
jest.mock('../utils/healthKit', () => ({ HEALTH_SYNC_KEY: 'health_sync_enabled', requestHealthKitPermission: jest.fn() }));
jest.mock('../utils/healthConnect', () => ({ requestHealthConnectPermission: jest.fn() }));

const nav = createMockNavigation();
const route = createMockRoute('Settings');

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch({});
  });

  it('renders without crashing', () => {
    render(<SettingsScreen navigation={nav as any} route={route as any} />);
  });

  it('shows the Weight Unit section', () => {
    const { getByText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    expect(getByText(/weight unit/i)).toBeTruthy();
  });

  it('shows the app version', () => {
    const { getByText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    expect(getByText(/1\.0\.0/)).toBeTruthy();
  });

  it('shows the Terms of Service row', () => {
    const { getByText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    expect(getByText('Terms of Service')).toBeTruthy();
  });

  it('opens the Contact Us sheet with email and bug report options', () => {
    const { getByLabelText, queryByText, getByText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    expect(queryByText('Report a Bug')).toBeNull();
    fireEvent.press(getByLabelText('Contact Us'));
    expect(getByText('Email Us')).toBeTruthy();
    expect(getByText('Report a Bug')).toBeTruthy();
  });

  describe('weight unit toggle', () => {
    const { updateUser } = require('../context/AuthContext').useAuth();

    it('asks before converting, and does nothing when cancelled', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByTestId } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
      fireEvent(getByTestId('weight-unit-switch'), 'valueChange', true);

      expect(alertSpy).toHaveBeenCalledWith('Switch to kg?', expect.stringContaining('rounded'), expect.any(Array));
      expect(updateUser).not.toHaveBeenCalled();
      expect((global.fetch as jest.Mock).mock.calls.some(([u]) => String(u).endsWith('/api/me'))).toBe(false);
      expect(getByTestId('weight-unit-switch').props.value).toBe(false);
      alertSpy.mockRestore();
    });

    it('saves the new unit to the server', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(confirmingAlert);
      const { getByTestId } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
      fireEvent(getByTestId('weight-unit-switch'), 'valueChange', true);

      await waitFor(() => expect(getByTestId('weight-unit-switch').props.disabled).toBe(false));
      expect(updateUser).toHaveBeenCalledWith({ weight_unit: 'kg' });
      expect(updateUser).not.toHaveBeenCalledWith({ weight_unit: 'lbs' });
      const [, init] = (global.fetch as jest.Mock).mock.calls.find(([u]) => String(u).endsWith('/api/me'));
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ weight_unit: 'kg' });
      expect(getByTestId('weight-unit-switch').props.value).toBe(true);
      alertSpy.mockRestore();
    });

    it('rolls back when the server rejects the change', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(confirmingAlert);
      mockFetch({ message: 'boom' }, false, 500);
      const { getByTestId } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
      fireEvent(getByTestId('weight-unit-switch'), 'valueChange', true);

      await waitFor(() => expect(updateUser).toHaveBeenLastCalledWith({ weight_unit: 'lbs' }));
      expect(getByTestId('weight-unit-switch').props.value).toBe(false);
      expect(alertSpy).toHaveBeenCalledWith("Couldn't Change Units", expect.any(String));
      alertSpy.mockRestore();
    });

    it('rolls back without an extra alert on a network failure', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(confirmingAlert);
      const { getByTestId } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
      (global.fetch as jest.Mock).mockImplementation((url: string) =>
        String(url).endsWith('/api/me') ? Promise.reject(new TypeError('Network request failed')) : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
      );
      fireEvent(getByTestId('weight-unit-switch'), 'valueChange', true);

      await waitFor(() => expect(updateUser).toHaveBeenLastCalledWith({ weight_unit: 'lbs' }));
      expect(getByTestId('weight-unit-switch').props.value).toBe(false);
      expect(alertSpy).not.toHaveBeenCalledWith("Couldn't Change Units", expect.any(String));
      alertSpy.mockRestore();
    });
  });

  it('offers System / Light / Dark and passes the pick to the theme', () => {
    const themeModule = require('../context/ThemeContext');
    const setThemePreference = jest.fn();
    const theme = { ...themeModule.useTheme(), themePreference: 'dark', setThemePreference };
    const spy = jest.spyOn(themeModule, 'useTheme').mockReturnValue(theme);
    const { getByText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByText('System'));
    expect(setThemePreference).toHaveBeenCalledWith('system');
    fireEvent.press(getByText('Light'));
    expect(setThemePreference).toHaveBeenCalledWith('light');
    spy.mockRestore();
  });

  it.each([
    ['Workout', 'WorkoutSettings'],
    ['GPS Activities', 'GpsSettings'],
    ['Notifications', 'NotificationSettings'],
    ['FAQ', 'HelpFaq'],
  ])('opens %s from its row', (label, screen) => {
    const { getByLabelText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByLabelText(label));
    expect(nav.navigate).toHaveBeenCalledWith(screen);
  });
});
