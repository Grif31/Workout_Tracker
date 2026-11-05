import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { scheduleRestTimerAlert } from '../utils/notifications';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('rest-1')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

const getPermissions = Notifications.getPermissionsAsync as jest.Mock;
const requestPermissions = Notifications.requestPermissionsAsync as jest.Mock;

describe('scheduleRestTimerAlert', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('asks for permission the first time, then schedules the alert', async () => {
    getPermissions.mockResolvedValue({ status: 'undetermined' });
    requestPermissions.mockResolvedValue({ status: 'granted' });

    await scheduleRestTimerAlert(90);

    expect(requestPermissions).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ seconds: 90 }) }),
    );
  });

  it('takes the time the permission prompt was up off the alert', async () => {
    getPermissions.mockResolvedValue({ status: 'undetermined' });
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    requestPermissions.mockImplementation(async () => {
      clock.mockReturnValue(now + 30_000);
      return { status: 'granted' };
    });

    await scheduleRestTimerAlert(90);
    clock.mockRestore();

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ seconds: 60 }) }),
    );
  });

  it("doesn't ask again or schedule once permission was denied", async () => {
    getPermissions.mockResolvedValue({ status: 'denied' });

    await scheduleRestTimerAlert(90);

    expect(requestPermissions).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
