import { Platform } from 'react-native';
import { syncWorkoutToHealthKit, type CardioActivity } from './healthKit';
import { syncWorkoutToHealthConnect } from './healthConnect';
import { attachHeartRateToWorkout } from './heartRateSync';

/** What Apple Health / Health Connect need to know about a finished workout */
export type HealthWorkout = {
  type: 'strength' | 'cardio';
  /** A tracked GPS activity's kind; without it cardio goes in as running */
  activity?: CardioActivity;
  /** A tracked GPS activity's distance */
  distanceKm?: number;
  startDate: Date;
  endDate: Date;
};

/**
 * The one way a saved workout reaches Health: WorkoutLog, a GPS save, and a
 * workout the offline queue uploads later all come through here, so each gets
 * the same activity type, distance and heart rate. Fire and forget: a Health
 * write must never hold up or fail a save. Heart rate needs the server's id
 * (it is attached with a PATCH), so it is skipped without one.
 */
export function syncFinishedWorkout(w: HealthWorkout & { workoutId?: number | string | null; userId?: number | string }): void {
  if (Platform.OS === 'ios') {
    syncWorkoutToHealthKit(w);
    if (w.workoutId != null) {
      attachHeartRateToWorkout({ workoutId: w.workoutId, startDate: w.startDate, endDate: w.endDate, userId: w.userId });
    }
  } else if (Platform.OS === 'android') {
    syncWorkoutToHealthConnect(w);
  }
}
