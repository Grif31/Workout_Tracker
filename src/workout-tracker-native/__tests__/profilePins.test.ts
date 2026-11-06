import { defaultPins, parseStoredPins, recentPrChange, resolvePin } from '../utils/profilePins';
import type { PR } from '../screens/ProfileTab/PersonalRecordsScreen';

const pr = (over: Partial<PR> & { exercise_template_id: number; pr_type: PR['pr_type']; value: number }): PR => ({
  id: Math.random(), exercise_name: `Ex ${over.exercise_template_id}`, pr_label: '', weight_context: null,
  achieved_at: '2026-08-01T00:00:00', muscle_group: 'Chest', ...over,
});

describe('defaultPins', () => {
  it('picks the three heaviest lifts, one record each', () => {
    const prs = [
      pr({ exercise_template_id: 1, pr_type: 'max_weight', value: 225 }),
      pr({ exercise_template_id: 1, pr_type: 'max_reps', value: 12, weight_context: 135 }),
      pr({ exercise_template_id: 2, pr_type: 'max_weight', value: 405 }),
      pr({ exercise_template_id: 3, pr_type: 'max_weight', value: 315 }),
      pr({ exercise_template_id: 4, pr_type: 'max_weight', value: 95 }),
    ];
    expect(defaultPins(prs).map(p => p.exerciseId)).toEqual([2, 3, 1]);
  });

  it('gives a runner their times, longest distance first', () => {
    const prs = [
      pr({ exercise_template_id: 9, pr_type: 'best_time', value: 25, weight_context: 5 }),
      pr({ exercise_template_id: 9, pr_type: 'best_time', value: 7.5, weight_context: 1.609 }),
      pr({ exercise_template_id: 9, pr_type: 'best_time', value: 52, weight_context: 10 }),
      pr({ exercise_template_id: 9, pr_type: 'best_time', value: 3.2, weight_context: 0.8 }),
    ];
    expect(defaultPins(prs)).toEqual([
      { exerciseId: 9, prType: 'best_time', context: 10 },
      { exerciseId: 9, prType: 'best_time', context: 5 },
      { exerciseId: 9, prType: 'best_time', context: 1.609 },
    ]);
  });

  it('puts lifts before cardio, and leaves a slot empty rather than show a warm-up rep record', () => {
    const prs = [
      pr({ exercise_template_id: 9, pr_type: 'best_time', value: 25, weight_context: 5 }),
      pr({ exercise_template_id: 1, pr_type: 'max_weight', value: 225 }),
      pr({ exercise_template_id: 1, pr_type: 'max_reps', value: 20, weight_context: 45 }),
    ];
    expect(defaultPins(prs).map(p => [p.exerciseId, p.prType])).toEqual([[1, 'max_weight'], [9, 'best_time']]);
  });

  it('is empty with no PRs', () => {
    expect(defaultPins([])).toEqual([]);
  });
});

describe('parseStoredPins', () => {
  it('reads nothing as no choice', () => {
    expect(parseStoredPins(null)).toBeNull();
    expect(parseStoredPins('not json')).toBeNull();
  });

  it('reads three empty legacy slots as no choice, since old builds saved them unasked', () => {
    expect(parseStoredPins('[null,null,null]')).toBeNull();
  });

  it('keeps an empty list as choosing none', () => {
    expect(parseStoredPins('[]')).toEqual([]);
  });

  it('migrates bare ids and drops empty slots and estimated 1RM', () => {
    const raw = JSON.stringify([7, null, { exerciseId: 3, prType: 'estimated_1rm', context: null }]);
    expect(parseStoredPins(raw)).toEqual([{ exerciseId: 7, prType: 'max_weight', context: null }]);
  });
});

describe('resolvePin', () => {
  it('finds a max reps record at its weight, falling back to another weight', () => {
    const prs = [
      pr({ exercise_template_id: 1, pr_type: 'max_reps', value: 5, weight_context: 225 }),
      pr({ exercise_template_id: 1, pr_type: 'max_reps', value: 10, weight_context: 185 }),
    ];
    expect(resolvePin(prs, { exerciseId: 1, prType: 'max_reps', context: 185 })?.value).toBe(10);
    expect(resolvePin(prs, { exerciseId: 1, prType: 'max_reps', context: 200 })?.value).toBe(5);
    expect(resolvePin(prs, { exerciseId: 2, prType: 'max_reps', context: null })).toBeUndefined();
  });
});

describe('recentPrChange', () => {
  const now = new Date(2026, 7, 10);

  it('is the improvement for a recent PR', () => {
    expect(recentPrChange(pr({ exercise_template_id: 1, pr_type: 'max_weight', value: 235, previous_value: 225, achieved_at: '2026-08-05T00:00:00' }), now)).toBe(10);
  });

  it('counts a faster time as positive', () => {
    expect(recentPrChange(pr({ exercise_template_id: 1, pr_type: 'best_time', value: 24, previous_value: 25, achieved_at: '2026-08-05T00:00:00' }), now)).toBe(1);
  });

  it('calls a first PR new', () => {
    expect(recentPrChange(pr({ exercise_template_id: 1, pr_type: 'max_weight', value: 225, previous_value: null, achieved_at: '2026-08-09T00:00:00' }), now)).toBe('new');
  });

  it('says nothing for an old PR', () => {
    expect(recentPrChange(pr({ exercise_template_id: 1, pr_type: 'max_weight', value: 235, previous_value: 225, achieved_at: '2026-07-01T00:00:00' }), now)).toBeNull();
  });
});
