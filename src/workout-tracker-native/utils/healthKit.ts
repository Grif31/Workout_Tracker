import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { summarizeHeartRate, type HeartRateSummary } from './heartRate';

export const HEALTH_SYNC_KEY = 'health_sync_enabled';

// Lazy-load: the native module only exists in EAS builds, not Expo Go.
//
// This replaced react-native-health, which is a legacy bridge module
// (no codegenConfig, `s.dependency 'React'`). RN 0.83 is bridgeless-only,
// so that module never registered and every call threw -- which is why
// HEALTH_SYNC_ENABLED was flipped off. @kingstinct/react-native-healthkit
// is a Nitro module built for the New Architecture.
let HealthKit: typeof import('@kingstinct/react-native-healthkit') | null = null;
if (Platform.OS === 'ios') {
  try { HealthKit = require('@kingstinct/react-native-healthkit'); } catch {}
}

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate' as const;
const WORKOUT_TYPE = 'HKWorkoutTypeIdentifier' as const;

// From the library's WorkoutActivityType enum. Hardcoded rather than imported
// so the enum import doesn't pull the native module in on Android/Expo Go.
const ACTIVITY_RUNNING = 37;
const ACTIVITY_STRENGTH = 50;

async function syncEnabled(userId?: number | string): Promise<boolean> {
  const key = userId ? `${HEALTH_SYNC_KEY}_${userId}` : HEALTH_SYNC_KEY;
  return (await AsyncStorage.getItem(key)) === 'true';
}

export async function requestHealthKitPermission(): Promise<boolean> {
  if (!HealthKit?.isHealthDataAvailable?.()) return false;
  try {
    return await HealthKit.requestAuthorization({
      toShare: [WORKOUT_TYPE],
      toRead: [HEART_RATE],
    });
  } catch {
    return false;
  }
}

/**
 * Average and peak bpm recorded during the workout window.
 *
 * Any wearable writing to Apple Health works here -- an Apple Watch, a chest
 * strap, a Whoop. We read what's in HealthKit rather than talking to a watch
 * directly, so there's no watchOS target and no WCSession involved.
 *
 * Returns null when sync is off, permission was denied, nothing was recorded,
 * or the read failed. The caller stores null, never a zero.
 */
export async function readWorkoutHeartRate(params: {
  startDate: Date;
  endDate: Date;
  userId?: number | string;
}): Promise<HeartRateSummary | null> {
  if (!HealthKit?.isHealthDataAvailable?.()) return null;
  if (!(await syncEnabled(params.userId))) return null;

  try {
    const samples = await HealthKit.queryQuantitySamples(HEART_RATE, {
      filter: { date: { startDate: params.startDate, endDate: params.endDate } },
      unit: 'count/min',
      limit: 0, // non-positive = every sample in the window
    });
    return summarizeHeartRate(samples);
  } catch {
    return null;
  }
}

export async function syncWorkoutToHealthKit(params: {
  type: 'strength' | 'cardio';
  startDate: Date;
  endDate: Date;
  userId?: number | string;
}): Promise<void> {
  if (!HealthKit?.isHealthDataAvailable?.()) return;
  if (!(await syncEnabled(params.userId))) return;

  try {
    await HealthKit.saveWorkoutSample(
      params.type === 'cardio' ? ACTIVITY_RUNNING : ACTIVITY_STRENGTH,
      [],
      params.startDate,
      params.endDate,
    );
  } catch {
    // Health writes are best-effort: a denied permission or a revoked
    // entitlement must never block the workout save that triggered it.
  }
}
