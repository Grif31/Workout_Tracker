import {
  normalizeSupersets, pairExercises, removeFromSuperset, supersetPositions,
  completesRound, nextInRound, currentExerciseIndex, logOrder, type SupersetMember,
} from '../utils/supersets';

type Kind = 'strength' | 'cardio' | 'duration';
const ex = (exercise_type: Kind, superset_group: number | null, sets: SupersetMember['sets'] = []) =>
  ({ exercise_type, superset_group, sets });

// Keep in step with NORMALIZE_CASES in src/tests/test_supersets.py
const NORMALIZE_CASES: [string, [Kind, number | null][], (number | null)[]][] = [
  ['a pair is kept', [['strength', 1], ['strength', 1]], [1, 1]],
  ['keys are renumbered by first appearance', [['strength', 7], ['strength', 7], ['strength', 3], ['strength', 3]], [1, 1, 2, 2]],
  ['a tri-set is kept', [['strength', 2], ['strength', 2], ['duration', 2]], [1, 1, 1]],
  ['a group of one dissolves', [['strength', 1], ['strength', null]], [null, null]],
  ['cardio leaves its group', [['strength', 1], ['cardio', 1]], [null, null]],
  ['cardio in the middle splits the run', [['strength', 1], ['cardio', 1], ['strength', 1], ['strength', 1]], [null, null, null, null]],
  ['a stray away from its group is dropped', [['strength', 1], ['strength', 1], ['strength', null], ['strength', 1]], [1, 1, null, null]],
  ['neighbouring groups stay apart', [['strength', 1], ['strength', 1], ['strength', 2], ['strength', 2], ['strength', null]], [1, 1, 2, 2, null]],
  ['nothing grouped stays ungrouped', [['strength', null], ['cardio', null]], [null, null]],
];

describe('normalizeSupersets', () => {
  it.each(NORMALIZE_CASES)('%s', (_name, input, expected) => {
    const out = normalizeSupersets(input.map(([t, g]) => ex(t, g)));
    expect(out.map(e => e.superset_group ?? null)).toEqual(expected);
  });

  it('returns the same array when nothing changes, so memoized blocks skip', () => {
    const list = [ex('strength', 1), ex('strength', 1), ex('strength', null)];
    expect(normalizeSupersets(list)).toBe(list);
  });

  it('keeps the identity of entries it does not touch', () => {
    const list = [ex('strength', 1), ex('strength', 1), ex('strength', 5)];
    const out = normalizeSupersets(list);
    expect(out[0]).toBe(list[0]);
    expect(out[2]).not.toBe(list[2]);
  });
});

const named = (name: string, superset_group: number | null = null, exercise_type: Kind = 'strength') =>
  ({ name, exercise_type, superset_group, sets: [] as SupersetMember['sets'] });
const view = (list: ReturnType<typeof named>[]) => list.map(e => `${e.name}${e.superset_group ?? ''}`);

describe('pairExercises', () => {
  it('moves the partner next to the anchor', () => {
    const out = pairExercises([named('Bench'), named('Squat'), named('Fly')], 0, 2);
    expect(view(out)).toEqual(['Bench1', 'Fly1', 'Squat']);
  });

  it('works when the partner comes first', () => {
    const out = pairExercises([named('Squat'), named('Fly'), named('Bench')], 2, 0);
    expect(view(out)).toEqual(['Fly', 'Bench1', 'Squat1']);
  });

  it('adds a third member after the existing pair', () => {
    const out = pairExercises([named('A', 1), named('B', 1), named('C'), named('D')], 0, 3);
    expect(view(out)).toEqual(['A1', 'B1', 'D1', 'C']);
  });

  it('takes the partner out of its old superset, which dissolves', () => {
    const out = pairExercises([named('A', 1), named('B', 1), named('C')], 2, 1);
    expect(view(out)).toEqual(['A', 'C1', 'B1']);
  });

  it('refuses cardio', () => {
    const list = [named('Bench'), named('Run', null, 'cardio')];
    expect(pairExercises(list, 0, 1)).toBe(list);
  });
});

describe('removeFromSuperset', () => {
  it('dissolves a pair', () => {
    expect(view(removeFromSuperset([named('A', 1), named('B', 1)], 0))).toEqual(['B', 'A']);
  });

  it('keeps the rest of a tri-set together', () => {
    const out = removeFromSuperset([named('A', 1), named('B', 1), named('C', 1), named('D')], 1);
    expect(view(out)).toEqual(['A1', 'C1', 'B', 'D']);
  });
});

describe('supersetPositions', () => {
  it('letters supersets in order and numbers their members', () => {
    const out = supersetPositions([named('X'), named('A', 4), named('B', 4), named('C', 2), named('D', 2)]);
    expect(out.map(p => p?.label ?? null)).toEqual([null, 'A1', 'A2', 'B1', 'B2']);
    expect(out[2]).toMatchObject({ letter: 'A', position: 2, size: 2 });
  });
});

const set = (done = false, set_type = 'N') => ({ done, set_type });

describe('rounds', () => {
  // Bench has two warm-ups, then three working sets; Row has two working sets
  const workout = (benchDone: boolean[], rowDone: boolean[]) => [
    ex('strength', 1, [set(true, 'W'), set(true, 'W'), ...benchDone.map(d => set(d))]),
    ex('strength', 1, rowDone.map(d => set(d))),
    ex('strength', null, [set()]),
  ];

  it('the first member of a round does not finish it, and points at the partner', () => {
    const list = workout([false, false, false], [false, false]);
    expect(completesRound(list, 0, 2)).toBe(false);
    expect(nextInRound(list, 0, 2)).toEqual({ exIdx: 1, setIdx: 0 });
  });

  it('warm-ups sit outside rounds', () => {
    const list = workout([false, false, false], [false, false]);
    expect(completesRound(list, 0, 0)).toBe(true);
    expect(nextInRound(list, 0, 0)).toBeNull();
  });

  it('the last member finishes the round', () => {
    const list = workout([true, false, false], [false, false]);
    expect(completesRound(list, 1, 0)).toBe(true);
    expect(nextInRound(list, 1, 0)).toBeNull();
  });

  it('goes back round the superset when sets were done out of order', () => {
    const list = workout([false, false, false], [false, false]);
    expect(completesRound(list, 1, 0)).toBe(false);
    expect(nextInRound(list, 1, 0)).toEqual({ exIdx: 0, setIdx: 2 });
  });

  it('a member with fewer sets drops out of later rounds', () => {
    const list = workout([true, true, false], [true, true]);
    expect(completesRound(list, 0, 4)).toBe(true);
  });

  it('outside a superset every set finishes its round', () => {
    const list = workout([false, false, false], [false, false]);
    expect(completesRound(list, 2, 0)).toBe(true);
    expect(nextInRound(list, 2, 0)).toBeNull();
  });
});

describe('currentExerciseIndex', () => {
  it('moves to the partner once the first member does its set', () => {
    const list = [
      ex('strength', 1, [set(true), set()]),
      ex('strength', 1, [set(), set()]),
    ];
    expect(currentExerciseIndex(list)).toBe(1);
  });

  it('comes back to the first member for the next round', () => {
    const list = [
      ex('strength', 1, [set(true), set()]),
      ex('strength', 1, [set(true), set()]),
    ];
    expect(currentExerciseIndex(list)).toBe(0);
  });

  it('does warm-ups first', () => {
    const list = [
      ex('strength', 1, [set(true), set()]),
      ex('strength', 1, [set(false, 'W'), set()]),
    ];
    expect(currentExerciseIndex(list)).toBe(1);
  });

  it('outside a superset it is the first exercise with a set left', () => {
    expect(currentExerciseIndex([ex('strength', null, [set(true)]), ex('strength', null, [set()])])).toBe(1);
  });
});

describe('logOrder', () => {
  const pairs = (list: SupersetMember[]) => logOrder(list).map(p => `${p.exIdx}:${p.setIdx}`);

  it('runs down the list outside a superset', () => {
    expect(pairs([ex('strength', null, [set(), set()]), ex('strength', null, [set()])])).toEqual(['0:0', '0:1', '1:0']);
  });

  it('alternates across a superset round by round, warm-ups first', () => {
    const list = [
      ex('strength', null, [set()]),
      ex('strength', 1, [set(false, 'W'), set(), set()]),
      ex('strength', 1, [set(), set(), set()]),
      ex('strength', null, [set()]),
    ];
    expect(pairs(list)).toEqual(['0:0', '1:0', '1:1', '2:0', '1:2', '2:1', '2:2', '3:0']);
  });
});
