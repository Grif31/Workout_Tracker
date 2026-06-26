import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const HEALTH_SYNC_KEY = 'health_sync_enabled';

// Lazy-load: only available in EAS builds, not Expo Go
let AppleHealthKit: any = null;
if (Platform.OS === 'ios') {
  try { AppleHealthKit = require('react-native-health').default; } catch {}
}

export async function requestHealthKitPermission(): Promise<boolean> {
  if (!AppleHealthKit) return false;
  return new Promise(resolve => {
    AppleHealthKit.initHealthKit(
      { permissions: { read: [], write: [AppleHealthKit.Constants.Permissions.Workout] } },
      (err: any) => resolve(!err),
    );
  });
}

export async function syncWorkoutToHealthKit(params: {
  type: 'strength' | 'cardio';
  startDate: Date;
  endDate: Date;
  userId?: number | string;
}): Promise<void> {
  if (!AppleHealthKit) return;
  const key = params.userId ? `${HEALTH_SYNC_KEY}_${params.userId}` : HEALTH_SYNC_KEY;
  if ((await AsyncStorage.getItem(key)) !== 'true') return;

  const activityType = params.type === 'strength'
    ? AppleHealthKit.Constants.Activities.TraditionalStrengthTraining
    : AppleHealthKit.Constants.Activities.Running;

  await new Promise<void>(resolve =>
    AppleHealthKit.saveWorkout({
      type: activityType,
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
      duration: Math.round((params.endDate.getTime() - params.startDate.getTime()) / 1000),
      energyBurned: 0,
      energyBurnedUnit: 'calorie',
    }, () => resolve()),
  );
}
