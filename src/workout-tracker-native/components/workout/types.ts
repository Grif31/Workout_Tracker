import { StyleSheet } from 'react-native';

export const REST_TIMER_KEY = 'default_rest_timer';
export const AUTO_REST_KEY = 'workout_auto_rest';
export const VIBRATE_KEY = 'workout_vibrate';
export const RPE_KEY = 'workout_show_rpe';
// Crash-insurance keys written while a workout is OPEN (WorkoutLog) and read
// on cold start (WorkoutSessionContext) to resurrect a killed workout.
export const WORKOUT_BACKUP_KEY = '@workout_open_backup';
export const TIMER_CHECKPOINT_KEY = '@workout_timer_checkpoint';

export const RPE_LABELS = [
  { value: 5,  desc: 'Moderate — many reps left' },
  { value: 6,  desc: 'Could do 4–5 more reps' },
  { value: 7,  desc: 'Could do 3–4 more reps' },
  { value: 8,  desc: 'Could do 2–3 more reps' },
  { value: 9,  desc: 'Could do 1 more rep' },
  { value: 10, desc: 'Max effort — no reps left' },
];

export const SET_TYPES = ['N', 'W', 'D', 'F'] as const;
export type SetType = typeof SET_TYPES[number];

export type WorkoutSet = {
  id?: number;
  reps: string;
  weight: string;
  set_type: SetType;
  done?: boolean;
  rpe?: string;
  cardio_duration?: string;
  distance?: string;
  distance_unit?: string;
  intensity?: string;
};

export type PreviousSet = { reps: string; weight: string; set_type: string; cardio_duration?: string };

export type ExerciseEntry = {
  uid: string;
  id?: number;
  name: string;
  exercise_template_id?: number;
  exercise_type?: 'strength' | 'cardio' | 'duration';
  muscle_group?: string;
  equipment?: string;
  image_url?: string;
  sets: WorkoutSet[];
  previousSets?: PreviousSet[];
  currentPR?: {
    max_weight?: number | null;
    estimated_1rm?: number | null;
    per_weight_reps?: { weight: number; max_reps: number }[];
    max_duration?: number | null; // longest hold, in minutes
  };
  notes?: string;
};

export const makeUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// Bodyweight exercises are reps-only — weight is always stored as 0.
// Added-weight work belongs on the separate 'Weighted' equipment variants.
export const isBodyweight = (ex: { exercise_type?: string; equipment?: string }) =>
  ex.exercise_type !== 'cardio' && ex.equipment === 'Bodyweight';

// Timed holds (planks, wall sits, dead hangs) — sets are a duration in
// seconds, no reps or weight. Stored in the set's cardio_duration column
// as minutes, same unit cardio uses; the UI converts to/from seconds.
export const isDuration = (ex: { exercise_type?: string }) =>
  ex.exercise_type === 'duration';

// "45s" / "1:30" — hold-time display from a minutes value
export function fmtHold(minutes: number): string {
  const secs = Math.round(minutes * 60);
  return secs < 60 ? `${secs}s` : fmtCountdown(secs);
}

// Blank set matching the exercise's logging mode
export const makeInitialSet = (ex: { exercise_type?: string; equipment?: string }): WorkoutSet =>
  ex.exercise_type === 'cardio'
    ? { reps: '', weight: '', set_type: 'N', cardio_duration: '', distance: '', distance_unit: 'km', intensity: '' }
    : isDuration(ex)
    ? { reps: '', weight: '', set_type: 'N', cardio_duration: '' }
    : { reps: '', weight: isBodyweight(ex) ? '0' : '', set_type: 'N' };

export function fmtElapsed(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}:${s.toString().padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60)}m`;
}

export function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Shared column layout — used by ExerciseBlock (header row) and SetRow (data rows)
export const colStyles = StyleSheet.create({
  setType: { width: 40 },
  prev: { flex: 1 },
  input: { flex: 1, marginHorizontal: 4 },
  rpe: { width: 44, marginHorizontal: 4 },
  check: { width: 48 },
});
