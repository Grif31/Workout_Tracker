import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import SettingsScreen from '../screens/ProfileTab/SettingsScreen';

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../utils/notifications', () => ({
  requestNotificationPermission: jest.fn(),
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

  it('shows the Contact Support row', () => {
    const { getByText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    expect(getByText('Contact Support')).toBeTruthy();
  });
});
