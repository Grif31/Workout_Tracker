import { Platform } from 'react-native';
import { apiFetch } from './api';
import { readWorkoutHeartRate } from './healthKit';

/**
 * Read the workout's heart rate out of Apple Health and attach it to the
 * already-saved workout.
 *
 * Runs *after* the workout POST rather than feeding into it: the HealthKit
 * query is a native round-trip, and a workout must never sit unsaved waiting
 * on a wearable. A failure here leaves a workout with no heart rate, which is
 * exactly what a user without a watch gets anyway.
 *
 * iOS only for now. Health Connect exposes heart rate too, so the Android
 * half can follow the same shape via healthConnect.ts.
 */
export async function attachHeartRateToWorkout(params: {
  workoutId: number | string;
  startDate: Date;
  endDate: Date;
  userId?: number | string;
}): Promise<void> {
  if (Platform.OS !== 'ios') return;

  try {
    const hr = await readWorkoutHeartRate({
      startDate: params.startDate,
      endDate: params.endDate,
      userId: params.userId,
    });
    if (!hr) return;

    await apiFetch(`/api/workouts/${params.workoutId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avg_heart_rate: hr.avg, max_heart_rate: hr.max }),
    });
  } catch {
    // Best-effort enrichment; the workout itself is already safely saved.
  }
}
