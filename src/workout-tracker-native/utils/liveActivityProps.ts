import type { WorkoutLiveActivityProps } from '../widgets/WorkoutLiveActivity';
import { fmtHold, fmtPrevSet, isBodyweight, isDuration } from '../components/workout/types';

// Pure, like widgetProps.ts: the Live Activity layout draws what this decides,
// so the wording and the timer math are tested in Jest. Type-only import of the
// layout, since that file builds a native object when it is loaded.

type SetLike = { done?: boolean; reps?: string; weight?: string; cardio_duration?: string };
type ExerciseLike = { name: string; exercise_type?: string; equipment?: string; sets: SetLike[] };

/** Rest timer as the activity needs it: a finish time while running, the time left while paused. */
export type LiveRest = { endsAt: number } | { pausedLeft: number } | null;

/** The exercise the lifter is on: the first with a set left, else the last one. */
export function currentExerciseName(exercises: ExerciseLike[]): string | undefined {
  return currentExercise(exercises)?.name;
}

function currentExercise<E extends ExerciseLike>(exercises: E[]): E | undefined {
  return exercises.find(e => e.sets.some(s => !s.done)) ?? exercises[exercises.length - 1];
}

/**
 * "Next set  ·  3 of 4" and the target for it ("8 × 185 lb", "45s"): the current
 * exercise's first set not done. Null once everything is done, and for cardio,
 * whose bouts have no target to show.
 */
export function nextSetLines(
  exercises: ExerciseLike[],
  weightUnit: string,
): { setLine: string; next?: string } | null {
  const ex = currentExercise(exercises);
  if (!ex || ex.exercise_type === 'cardio') return null;
  const index = ex.sets.findIndex(s => !s.done);
  if (index < 0) return null;
  const set = ex.sets[index];
  const setLine = `Next set  ·  ${index + 1} of ${ex.sets.length}`;

  if (isDuration(ex)) {
    const minutes = parseFloat(set.cardio_duration ?? '');
    return minutes > 0 ? { setLine, next: fmtHold(minutes) } : { setLine };
  }
  if (!set.reps) return { setLine };
  if (isBodyweight(ex)) return { setLine, next: fmtPrevSet({ reps: set.reps, weight: '', set_type: 'N' }, true) };
  // A set with no weight typed yet shows its reps alone rather than "8 × "
  if (!set.weight || !(parseFloat(set.weight) > 0)) return { setLine, next: `${set.reps} reps` };
  return { setLine, next: `${fmtPrevSet({ reps: set.reps, weight: set.weight, set_type: 'N' }, false)} ${weightUnit}` };
}

export function liveActivityProps(input: {
  workoutName: string;
  exercises: ExerciseLike[];
  elapsedSeconds: number;
  timerPaused: boolean;
  rest: LiveRest;
  accent: string;
  weightUnit: string;
  now: number;
}): Omit<WorkoutLiveActivityProps, 'logo'> {
  const { exercises, now } = input;
  const all = exercises.flatMap(e => e.sets);
  const done = all.filter(s => s.done).length;
  const target = nextSetLines(exercises, input.weightUnit);
  return {
    name: input.workoutName.trim() || 'Workout',
    exercise: currentExerciseName(exercises) ?? 'Workout',
    sets: `${done}/${all.length} sets`,
    progress: all.length > 0 ? done / all.length : 0,
    ...(target ?? {}),
    // The native timer counts from this moment, so it ticks with the app
    // suspended; a paused one is frozen at `now`, which reads as the elapsed time.
    startedAt: now - input.elapsedSeconds * 1000,
    ...(input.timerPaused ? { pausedAt: now } : {}),
    ...(input.rest && 'endsAt' in input.rest ? { restEndsAt: input.rest.endsAt } : {}),
    ...(input.rest && 'pausedLeft' in input.rest ? { restPausedLeft: Math.max(0, Math.round(input.rest.pausedLeft)) } : {}),
    accent: input.accent,
  };
}
