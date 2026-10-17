import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { HEALTH_SYNC_KEY, type CardioActivity } from './healthKit';

// Health Connect exercise session types (ExerciseType in react-native-health-connect's
// constants, ExerciseSessionRecord on the Android side). These were 56 and 79
// until 2026-10-16, which are RUNNING and WALKING: every strength workout went
// in as a run and every cardio one as a walk.
const EXERCISE_TYPE_STRENGTH = 70; // STRENGTH_TRAINING
const EXERCISE_TYPE_OTHER    = 0;  // OTHER_WORKOUT
const CARDIO_EXERCISE_TYPES: Record<CardioActivity, number> = {
  running: 56, // RUNNING
  cycling: 8,  // BIKING
  walking: 79, // WALKING
  hiking: 37,  // HIKING
};

// Lazy-load: only available in EAS builds, not Expo Go
let HealthConnect: any = null;
if (Platform.OS === 'android') {
  try { HealthConnect = require('react-native-health-connect'); } catch {}
}

export async function requestHealthConnectPermission(): Promise<boolean> {
  if (!HealthConnect) return false;
  try {
    await HealthConnect.initialize();
    // Distance is its own record type in Health Connect, so a tracked
    // activity's distance needs its own permission. Optional: without it the
    // session still goes in.
    const granted: any[] = await HealthConnect.requestPermission([
      { accessType: 'write', recordType: 'ExerciseSession' },
      { accessType: 'write', recordType: 'Distance' },
    ]);
    return granted.some(p => p.recordType === 'ExerciseSession' && p.accessType === 'write');
  } catch {
    return false;
  }
}

export async function syncWorkoutToHealthConnect(params: {
  type: 'strength' | 'cardio';
  /** A tracked activity's kind; cardio without one goes in as "other" */
  activity?: CardioActivity;
  distanceKm?: number;
  startDate: Date;
  endDate: Date;
  userId?: number | string;
}): Promise<void> {
  if (!HealthConnect) return;
  const key = params.userId ? `${HEALTH_SYNC_KEY}_${params.userId}` : HEALTH_SYNC_KEY;
  if ((await AsyncStorage.getItem(key)) !== 'true') return;
  const startTime = params.startDate.toISOString();
  const endTime = params.endDate.toISOString();
  try {
    await HealthConnect.initialize();
    await HealthConnect.insertRecords([{
      recordType: 'ExerciseSession',
      startTime,
      endTime,
      exerciseType: params.type === 'strength'
        ? EXERCISE_TYPE_STRENGTH
        : params.activity ? CARDIO_EXERCISE_TYPES[params.activity] : EXERCISE_TYPE_OTHER,
    }]);
  } catch {
    return; // best-effort
  }
  if (!(params.distanceKm && params.distanceKm > 0)) return;
  try {
    // Separate from the session: someone who granted Health access before
    // distance was asked for hasn't allowed it, and the session must still land
    await HealthConnect.insertRecords([{
      recordType: 'Distance',
      startTime,
      endTime,
      distance: { value: params.distanceKm * 1000, unit: 'meters' },
    }]);
  } catch {}
}
