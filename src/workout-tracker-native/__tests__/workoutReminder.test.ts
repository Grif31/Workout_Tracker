import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { restoreWorkoutReminder } from '../utils/notifications';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notif-1')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));

describe('restoreWorkoutReminder', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("schedules the signed-in user's reminder at their saved time", async () => {
    await AsyncStorage.multiSet([
      ['workout_reminders_enabled_4', 'true'],
      ['workout_reminder_hour_4', '18'],
      ['workout_reminder_minute_4', '30'],
    ]);

    await restoreWorkoutReminder(4);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ hour: 18, minute: 30 }) }),
    );
  });

  it("cancels a previous account's reminder when this user has none", async () => {
    await AsyncStorage.setItem('workout_reminder_notif_id', 'old-notif');

    await restoreWorkoutReminder(5);

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-notif');
  });
});
