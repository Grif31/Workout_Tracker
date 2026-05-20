import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { HEALTH_SYNC_KEY } from './healthKit';

// Health Connect exercise type constants (androidx.health.connect.client.records.ExerciseSessionRecord)
const EXERCISE_TYPE_STRENGTH = 56; // STRENGTH_TRAINING
const EXERCISE_TYPE_OTHER    = 79; // OTHER_WORKOUT

// Lazy-load: only available in EAS builds, not Expo Go
let HealthConnect: any = null;
if (Platform.OS === 'android') {
  try { HealthConnect = require('react-native-health-connect'); } catch {}
}

export async function requestHealthConnectPermission(): Promise<boolean> {
  if (!HealthConnect) return false;
  try {
    await HealthConnect.initialize();
    const granted: any[] = await HealthConnect.requestPermission([
      { accessType: 'write', recordType: 'ExerciseSession' },
    ]);
    return granted.some(p => p.recordType === 'ExerciseSession' && p.accessType === 'write');
  } catch {
    return false;
  }
}

export async function syncWorkoutToHealthConnect(params: {
  type: 'strength' | 'cardio';
  startDate: Date;
  endDate: Date;
}): Promise<void> {
  if (!HealthConnect) return;
  if ((await AsyncStorage.getItem(HEALTH_SYNC_KEY)) !== 'true') return;
  try {
    await HealthConnect.initialize();
    await HealthConnect.insertRecords([{
      recordType: 'ExerciseSession',
      startTime: params.startDate.toISOString(),
      endTime: params.endDate.toISOString(),
      exerciseType: params.type === 'strength' ? EXERCISE_TYPE_STRENGTH : EXERCISE_TYPE_OTHER,
    }]);
  } catch {} // best-effort
}
