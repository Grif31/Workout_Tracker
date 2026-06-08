import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

const PROJECT_ID = '356b88e9-4302-43fc-b50a-6d83030b8fa6';
const REMINDER_NOTIF_KEY    = 'workout_reminder_notif_id';
const REST_TIMER_NOTIF_KEY  = 'rest_timer_notif_id';
const LIVE_WORKOUT_NOTIF_KEY = 'live_workout_notif_id';

// In-memory cache — avoids AsyncStorage reads while the app is running.
// On restart the cache is empty; functions fall back to AsyncStorage.
let restTimerNotifId: string | null = null;
let liveWorkoutNotifId: string | null = null;

// ── Permissions ──────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── Push Token (remote notifications) ────────────────────────

export async function registerPushToken(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })).data;
    await apiFetch('/api/me/device-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
  } catch {}
}

export async function deregisterPushToken(): Promise<void> {
  try {
    await apiFetch('/api/me/device-token', { method: 'DELETE' });
  } catch {}
}

// ── Rest Timer Alert ─────────────────────────────────────────

export async function scheduleRestTimerAlert(seconds: number): Promise<void> {
  await cancelRestTimerAlert();
  restTimerNotifId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Rest over — time to lift! 💪',
      body: 'Your rest period has ended.',
      sound: true,
      interruptionLevel: 'timeSensitive',
    } as any,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
    },
  });
  await AsyncStorage.setItem(REST_TIMER_NOTIF_KEY, restTimerNotifId);
}

export async function cancelRestTimerAlert(): Promise<void> {
  const id = restTimerNotifId ?? await AsyncStorage.getItem(REST_TIMER_NOTIF_KEY);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    restTimerNotifId = null;
    await AsyncStorage.removeItem(REST_TIMER_NOTIF_KEY);
  }
}

// ── Live Workout Notification ────────────────────────────────

const LIVE_WORKOUT_CATEGORY = 'live_workout';

export async function setUpLiveWorkoutCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(LIVE_WORKOUT_CATEGORY, [
    {
      identifier: 'resume_workout',
      buttonTitle: 'Resume',
      options: { opensAppToForeground: true },
    },
  ]);
}

export async function postLiveWorkoutNotification(opts: {
  workoutName: string;
  elapsed: string;
  setsDone: number;
  setsTotal: number;
  currentExercise?: string;
}): Promise<void> {
  await cancelLiveWorkoutNotification();
  liveWorkoutNotifId = await Notifications.scheduleNotificationAsync({
    content: {
      title: `${opts.workoutName}  ·  ${opts.elapsed}  —  ${opts.setsDone}/${opts.setsTotal} sets`,
      body: opts.currentExercise ?? '',
      categoryIdentifier: LIVE_WORKOUT_CATEGORY,
      data: { type: 'live_workout' },
      autoDismiss: false,
      sticky: true,
    } as any,
    trigger: null,
  });
  await AsyncStorage.setItem(LIVE_WORKOUT_NOTIF_KEY, liveWorkoutNotifId);
}

export async function cancelLiveWorkoutNotification(): Promise<void> {
  const id = liveWorkoutNotifId ?? await AsyncStorage.getItem(LIVE_WORKOUT_NOTIF_KEY);
  if (id) {
    await Notifications.dismissNotificationAsync(id).catch(() => {});
    liveWorkoutNotifId = null;
    await AsyncStorage.removeItem(LIVE_WORKOUT_NOTIF_KEY);
  }
}

// ── Workout Reminders (daily scheduled) ──────────────────────

export async function scheduleWorkoutReminder(hour: number, minute: number): Promise<void> {
  await cancelWorkoutReminder();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time to work out! 💪",
      body: "Don't forget your workout today.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  await AsyncStorage.setItem(REMINDER_NOTIF_KEY, id);
}

export async function cancelWorkoutReminder(): Promise<void> {
  const id = await AsyncStorage.getItem(REMINDER_NOTIF_KEY);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(REMINDER_NOTIF_KEY);
  }
}
