import type { PrefillWorkoutData } from '../components/WorkoutDetails';

// The exercise shape every template/routine endpoint returns
// (WorkoutTemplate.to_dict(include_exercises=True) in models.py).
export type TemplateExercise = {
  id: number;
  name: string;
  // nullable=False on ExerciseTemplate, so the API always sends one.
  muscle_group: string;
  equipment?: string;
  exercise_type?: string;
  image_url?: string;
  bodyweight_load_factor?: number | null;
};

export type ProgrammingEntry = {
  exercise_template_id: number;
  sets: number;
  reps: string;
  rpe?: number | null;
};

export const parseRepsMin = (reps: string): string => {
  const m = (reps ?? '').match(/^(\d+)/);
  return m ? m[1] : '';
};

// AI hold prescriptions arrive as seconds strings like "40s" or "30-60s";
// prefill wants minutes (the unit WorkoutLog converts from).
export const parseHoldMinutes = (reps: string): string => {
  const m = (reps ?? '').match(/(\d+)/);
  return m ? String(parseInt(m[1], 10) / 60) : '';
};

export function parseProgramming(programmingJson?: string | null): Record<number, ProgrammingEntry> {
  if (!programmingJson) return {};
  try {
    const parsed: ProgrammingEntry[] = JSON.parse(programmingJson);
    const map: Record<number, ProgrammingEntry> = {};
    for (const p of parsed) map[p.exercise_template_id] = p;
    return map;
  } catch {
    return {};
  }
}

/**
 * The single way a template or routine day becomes a WorkoutLog prefill.
 *
 * Every field WorkoutLog reads off a prefilled exercise is set here. It lives
 * in one place because it didn't used to: four screens each built this object
 * by hand and each dropped a different subset, so the same template logged
 * from Home, Coach, a routine or the template screen gave four different
 * workouts (no exercise GIFs from some, no programmed sets from others).
 */
export function buildTemplatePrefill(
  name: string,
  exercises: TemplateExercise[],
  programming: Record<number, ProgrammingEntry> = {},
): PrefillWorkoutData {
  return {
    name,
    notes: '',
    exercises: exercises.map(ex => {
      const prog = programming[ex.id];
      return {
        name: ex.name,
        exercise_template_id: ex.id,
        exercise_type: ex.exercise_type ?? 'strength',
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        image_url: ex.image_url,
        bodyweight_load_factor: ex.bodyweight_load_factor,
        sets: prog ? programmedSets(ex, prog) : [{ reps: '', weight: '' }],
      };
    }),
  };
}

function programmedSets(ex: TemplateExercise, prog: ProgrammingEntry) {
  // programming_json is free-form (AI-generated or hand-edited), so a bad set
  // count must not reach Array() — Array(NaN) throws and takes the Log button
  // down with it.
  const count = Number.isFinite(prog.sets) && prog.sets > 0 ? Math.floor(prog.sets) : 1;
  return Array(count).fill(null).map(() => (
    ex.exercise_type === 'duration'
      ? { reps: '', weight: '', cardio_duration: parseHoldMinutes(prog.reps) }
      : {
          reps: parseRepsMin(prog.reps),
          weight: '',
          rpe: prog.rpe != null ? String(prog.rpe) : undefined,
        }
  ));
}
