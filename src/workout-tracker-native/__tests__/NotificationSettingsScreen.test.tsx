import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute } from './testUtils';
import NotificationSettingsScreen, { formatReminderTime } from '../screens/ProfileTab/NotificationSettingsScreen';
import { hasNotificationPermission, requestNotificationPermission, scheduleWorkoutReminder } from '../utils/notifications';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../utils/notifications', () => ({
  requestNotificationPermission: jest.fn(),
  hasNotificationPermission: jest.fn(() => Promise.resolve(true)),
  scheduleWorkoutReminder: jest.fn(),
  cancelWorkoutReminder: jest.fn(),
  reminderHourMinute: jest.requireActual('../utils/notifications').reminderHourMinute,
}));

const nav = createMockNavigation();
const route = createMockRoute('NotificationSettings');

describe('NotificationSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    return AsyncStorage.clear();
  });

  it('shows reminders off and stores that when the phone blocks notifications', async () => {
    await AsyncStorage.setItem('workout_reminders_enabled_1', 'true');
    (hasNotificationPermission as jest.Mock).mockResolvedValueOnce(false);
    const { getByLabelText } = render(<NotificationSettingsScreen navigation={nav as any} route={route as any} />);

    await waitFor(async () => expect(await AsyncStorage.getItem('workout_reminders_enabled_1')).toBe('false'));
    expect(getByLabelText('Workout reminders').props.value).toBe(false);
  });

  it('shows reminders on, with the stored time, when they are on and allowed', async () => {
    await AsyncStorage.multiSet([
      ['workout_reminders_enabled_1', 'true'], ['workout_reminder_hour_1', '18'], ['workout_reminder_minute_1', '5'],
    ]);
    const { getByLabelText, getByText } = render(<NotificationSettingsScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByLabelText('Workout reminders').props.value).toBe(true));
    expect(getByText('6:05 PM')).toBeTruthy();
  });

  it('formats the reminder time, defaulting to 9:00 AM', () => {
    expect(formatReminderTime(null, null)).toBe('9:00 AM');
    expect(formatReminderTime('0', '30')).toBe('12:30 AM');
    expect(formatReminderTime('12', '0')).toBe('12:00 PM');
    expect(formatReminderTime('23', '45')).toBe('11:45 PM');
  });

  it('schedules a midnight reminder at midnight, not 9 AM', async () => {
    await AsyncStorage.multiSet([['workout_reminder_hour_1', '0'], ['workout_reminder_minute_1', '30']]);
    (requestNotificationPermission as jest.Mock).mockResolvedValueOnce(true);
    const { getByLabelText, findByText } = render(<NotificationSettingsScreen navigation={nav as any} route={route as any} />);
    // Let the stored time load before the switch reads it
    await act(async () => {});
    fireEvent(getByLabelText('Workout reminders'), 'valueChange', true);

    expect(await findByText('12:30 AM')).toBeTruthy();
    expect(scheduleWorkoutReminder).toHaveBeenCalledWith(0, 30);
  });
});
