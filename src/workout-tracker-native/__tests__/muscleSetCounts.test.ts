import {
  muscleSetCounts, shadeLevel, muscleShading, fmtSetCount, sameMuscleCounts, MuscleSetCount,
} from '../utils/muscleSetCounts';

const set = (done = false, set_type = 'N') => ({ set_type, done });

describe('muscleSetCounts', () => {
  it('gives a primary mover 1 per set and a secondary 0.5', () => {
    const counts = muscleSetCounts([
      { muscle_group: 'Chest, Triceps, Shoulders', primary_muscles: ['Chest'], sets: [set(true), set(true), set()] },
    ]);
    expect(counts).toEqual([
      { muscle: 'Chest', done: 2, planned: 3, primary: true },
      { muscle: 'Triceps', done: 1, planned: 1.5, primary: false },
      { muscle: 'Shoulders', done: 1, planned: 1.5, primary: false },
    ]);
  });

  it('reads every primary from primary_muscles, not just the first in the string', () => {
    const [ham, glutes, lower] = muscleSetCounts([
      { muscle_group: 'Hamstrings, Glutes, Lower Back', primary_muscles: ['Hamstrings', 'Glutes'], sets: [set(true), set(true)] },
    ]);
    expect(ham).toMatchObject({ muscle: 'Hamstrings', done: 2, primary: true });
    expect(glutes).toMatchObject({ muscle: 'Glutes', done: 2, primary: true });
    expect(lower).toMatchObject({ muscle: 'Lower Back', done: 1, primary: false });
  });

  it('treats the first muscle as primary when primary_muscles is missing', () => {
    const counts = muscleSetCounts([{ muscle_group: 'Back, Biceps', sets: [set(true)] }]);
    expect(counts.map(c => [c.muscle, c.done])).toEqual([['Back', 1], ['Biceps', 0.5]]);
  });

  it('skips warm-ups and cardio', () => {
    const counts = muscleSetCounts([
      { muscle_group: 'Quads', primary_muscles: ['Quads'], sets: [set(true, 'W'), set(true, 'W'), set(true)] },
      { exercise_type: 'cardio', muscle_group: 'Quads, Calves', primary_muscles: ['Quads'], sets: [set(true)] },
    ]);
    expect(counts).toEqual([{ muscle: 'Quads', done: 1, planned: 1, primary: true }]);
  });

  it('counts drop and failure sets, and a timed hold as one per set', () => {
    const counts = muscleSetCounts([
      { muscle_group: 'Chest', sets: [set(true, 'D'), set(true, 'F')] },
      { exercise_type: 'duration', muscle_group: 'Core', sets: [set(true), set(true), set(true)] },
    ]);
    expect(counts.map(c => [c.muscle, c.done])).toEqual([['Core', 3], ['Chest', 2]]);
  });

  it('adds a muscle up across exercises and keeps it primary if any exercise makes it one', () => {
    const counts = muscleSetCounts([
      { muscle_group: 'Chest, Triceps', primary_muscles: ['Chest'], sets: [set(true), set(true)] },
      { muscle_group: 'Triceps', primary_muscles: ['Triceps'], sets: [set(true), set(true), set(true)] },
    ]);
    expect(counts.find(c => c.muscle === 'Triceps')).toEqual({ muscle: 'Triceps', done: 4, planned: 4, primary: true });
  });

  it('drops a muscle whose only sets are warm-ups', () => {
    expect(muscleSetCounts([{ muscle_group: 'Chest', sets: [set(true, 'W')] }])).toEqual([]);
  });

  it('counts every set as done for a logged workout', () => {
    const [chest] = muscleSetCounts([{ muscle_group: 'Chest', sets: [{ set_type: 'N' }, { set_type: 'N' }] }], { logged: true });
    expect(chest).toMatchObject({ done: 2, planned: 2 });
  });

  it('lists primaries first, then by sets done', () => {
    const counts = muscleSetCounts([
      { muscle_group: 'Biceps', sets: [set(true)] },
      { muscle_group: 'Back, Forearms', primary_muscles: ['Back'], sets: [set(true), set(true), set(true), set(true), set(true), set(true)] },
      { muscle_group: 'Chest', sets: [set(true), set(true)] },
    ]);
    expect(counts.map(c => c.muscle)).toEqual(['Back', 'Chest', 'Biceps', 'Forearms']);
  });
});

describe('shadeLevel', () => {
  const at = (done: number): MuscleSetCount => ({ muscle: 'Chest', done, planned: 10, primary: true });

  it('bands sets done: planned only, 1-3, 4-6, 7+', () => {
    expect([0, 0.5, 3, 3.5, 4, 6.5, 7, 12].map(n => shadeLevel(at(n)))).toEqual([1, 2, 2, 2, 3, 3, 4, 4]);
  });
});

describe('muscleShading', () => {
  it('colors each muscle by level and lists the darkest last, so a shared body part keeps it', () => {
    const counts: MuscleSetCount[] = [
      { muscle: 'Core', done: 8, planned: 8, primary: true },
      { muscle: 'Abs', done: 0, planned: 2, primary: true },
    ];
    expect(muscleShading(counts, '#30D158')).toEqual({
      muscles: ['Abs', 'Core'],
      muscleColors: { Abs: '#30D15873', Core: '#30D158FF' },
    });
  });
});

describe('fmtSetCount', () => {
  it('drops the decimal on whole sets', () => {
    expect(fmtSetCount(3)).toBe('3');
    expect(fmtSetCount(3.5)).toBe('3.5');
  });
});

describe('sameMuscleCounts', () => {
  const row: MuscleSetCount = { muscle: 'Chest', done: 1, planned: 3, primary: true };
  it('compares by content', () => {
    expect(sameMuscleCounts([row], [{ ...row }])).toBe(true);
    expect(sameMuscleCounts([row], [{ ...row, done: 2 }])).toBe(false);
    expect(sameMuscleCounts([row], [])).toBe(false);
  });
});
