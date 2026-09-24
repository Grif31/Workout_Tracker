import {
  buildTemplatePrefill,
  parseProgramming,
  parseRepsMin,
  parseHoldMinutes,
  type TemplateExercise,
} from '../utils/templatePrefill';

const bench: TemplateExercise = {
  id: 11,
  name: 'Bench Press',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  exercise_type: 'strength',
  image_url: '/media/bench.gif',
  bodyweight_load_factor: null,
};

const pushup: TemplateExercise = {
  id: 12,
  name: 'Push-Up',
  muscle_group: 'Chest',
  equipment: 'Bodyweight',
  exercise_type: 'strength',
  image_url: '/media/pushup.gif',
  bodyweight_load_factor: 0.6,
};

const plank: TemplateExercise = {
  id: 13,
  name: 'Plank',
  muscle_group: 'Core',
  equipment: 'Bodyweight',
  exercise_type: 'duration',
  image_url: '/media/plank.gif',
  bodyweight_load_factor: 0.35,
};

describe('buildTemplatePrefill', () => {
  // The GIF and the load factor are the two fields four hand-rolled copies of
  // this builder each used to drop, so pin the whole exercise shape.
  it('carries every exercise field WorkoutLog reads', () => {
    const { exercises } = buildTemplatePrefill('Push Day', [pushup]);
    expect(exercises[0]).toMatchObject({
      name: 'Push-Up',
      exercise_template_id: 12,
      exercise_type: 'strength',
      muscle_group: 'Chest',
      equipment: 'Bodyweight',
      image_url: '/media/pushup.gif',
      bodyweight_load_factor: 0.6,
    });
  });

  it('defaults an exercise with no type to strength', () => {
    const { exercises } = buildTemplatePrefill('X', [{ ...bench, exercise_type: undefined }]);
    expect(exercises[0].exercise_type).toBe('strength');
  });

  it('gives an unprogrammed exercise a single blank set', () => {
    const { exercises } = buildTemplatePrefill('Push Day', [bench]);
    expect(exercises[0].sets).toEqual([{ reps: '', weight: '' }]);
  });

  it('expands programming into sets, reps and RPE', () => {
    const { exercises } = buildTemplatePrefill('Push Day', [bench], {
      11: { exercise_template_id: 11, sets: 3, reps: '8-10', rpe: 8 },
    });
    expect(exercises[0].sets).toEqual([
      { reps: '8', weight: '', rpe: '8' },
      { reps: '8', weight: '', rpe: '8' },
      { reps: '8', weight: '', rpe: '8' },
    ]);
  });

  it('programs a duration exercise as a hold, not reps', () => {
    const { exercises } = buildTemplatePrefill('Core', [plank], {
      13: { exercise_template_id: 13, sets: 2, reps: '45s' },
    });
    expect(exercises[0].sets).toEqual([
      { reps: '', weight: '', cardio_duration: String(45 / 60) },
      { reps: '', weight: '', cardio_duration: String(45 / 60) },
    ]);
  });

  it('falls back to one set when a set count is unusable', () => {
    const { exercises } = buildTemplatePrefill('Push Day', [bench], {
      11: { exercise_template_id: 11, sets: NaN, reps: '10' },
    });
    expect(exercises[0].sets).toHaveLength(1);
  });

  it('names the workout and starts it with empty notes', () => {
    expect(buildTemplatePrefill('Leg Day', [])).toEqual({ name: 'Leg Day', notes: '', exercises: [] });
  });
});

describe('parseProgramming', () => {
  it('keys entries by exercise id', () => {
    const json = JSON.stringify([{ exercise_template_id: 11, sets: 3, reps: '5' }]);
    expect(parseProgramming(json)[11].sets).toBe(3);
  });

  it('returns nothing for missing or malformed json', () => {
    expect(parseProgramming(null)).toEqual({});
    expect(parseProgramming('not json')).toEqual({});
  });
});

describe('rep parsing', () => {
  it('takes the low end of a rep range', () => {
    expect(parseRepsMin('8-12')).toBe('8');
    expect(parseRepsMin('10')).toBe('10');
    expect(parseRepsMin('AMRAP')).toBe('');
  });

  it('converts a hold prescription from seconds to minutes', () => {
    expect(parseHoldMinutes('60s')).toBe('1');
    expect(parseHoldMinutes('30-60s')).toBe('0.5');
    expect(parseHoldMinutes('')).toBe('');
  });
});

describe('numeric reps from an AI plan', () => {
  it('prefills a template whose programming stored reps as a number', () => {
    // The AI is asked for "reps": "6-8" but often answers "reps": 8, and that
    // is stored as-is. Logging such a template used to throw on .match.
    const programming = parseProgramming(JSON.stringify([
      { exercise_template_id: 3, sets: 2, reps: 8 as any, rpe: 7 },
    ]));
    const prefill = buildTemplatePrefill('AI Push', [
      { id: 3, name: 'Bench Press', muscle_group: 'Chest' },
    ], programming);
    expect(prefill.exercises[0].sets).toHaveLength(2);
    expect(prefill.exercises[0].sets[0]).toMatchObject({ reps: '8' });
  });
});
