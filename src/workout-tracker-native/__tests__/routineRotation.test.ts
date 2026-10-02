import { routineRotation } from '../utils/routineRotation';

const PPL = ['Legs', 'Push', 'Pull'];
let nextId = 1;
const w = (name: string, date: string, id = nextId++) => ({ id, name, date: `${date}T00:00:00` });

// Monday 2026-09-28 .. Sunday 2026-10-04
const WEEK = '2026-09-28';

describe('routineRotation', () => {
  it('starts at day 1 with no history', () => {
    const r = routineRotation(PPL, [], '2026-10-01', WEEK);
    expect(r).toEqual({ nextIndex: 0, doneThisWeek: new Set(), restarted: false });
  });

  it('continues into a new week instead of restarting it', () => {
    // Legs and Push last week, nothing since: Pull is next, not Legs
    const r = routineRotation(PPL, [w('Legs', '2026-09-21'), w('Push', '2026-09-22')], '2026-09-28', WEEK);
    expect(r.nextIndex).toBe(2);
    expect(r.doneThisWeek.size).toBe(0);
  });

  it('wraps around after the last day', () => {
    const r = routineRotation(PPL, [w('Legs', '2026-09-28'), w('Push', '2026-09-29'), w('Pull', '2026-09-30')], '2026-10-01', WEEK);
    expect(r.nextIndex).toBe(0);
    expect([...r.doneThisWeek].sort()).toEqual([0, 1, 2]);
  });

  it('ignores workouts that are not routine days and matches names loosely', () => {
    const r = routineRotation(PPL, [w(' legs ', '2026-09-28'), w('Evening run', '2026-09-29')], '2026-09-30', WEEK);
    expect(r.nextIndex).toBe(1);
  });

  it('moves through repeated labels one copy at a time', () => {
    const split = ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'];
    const r = routineRotation(split, [
      w('Push', '2026-09-28'), w('Pull', '2026-09-29'), w('Legs', '2026-09-30'), w('Push', '2026-10-01'),
    ], '2026-10-02', WEEK);
    // The second Push was day 4, so the second Pull is next, and both Push days count as done
    expect(r.nextIndex).toBe(4);
    expect([...r.doneThisWeek].sort()).toEqual([0, 1, 2, 3]);
  });

  it('orders same-day workouts by id, since picker dates all sit at midnight', () => {
    // Given newest-first, the way the API returns them
    const r = routineRotation(PPL, [w('Push', '2026-09-28', 51), w('Legs', '2026-09-28', 50)], '2026-09-29', WEEK);
    expect(r.nextIndex).toBe(2);
  });

  it('restarts at day 1 after two weeks off', () => {
    const r = routineRotation(PPL, [w('Legs', '2026-09-10'), w('Push', '2026-09-11')], '2026-09-25', '2026-09-21');
    expect(r).toMatchObject({ nextIndex: 0, restarted: true });
  });

  it('keeps rotating after a gap just short of two weeks', () => {
    const r = routineRotation(PPL, [w('Legs', '2026-09-10'), w('Push', '2026-09-11')], '2026-09-24', '2026-09-21');
    expect(r).toMatchObject({ nextIndex: 2, restarted: false });
  });

  it('treats a workout after a two-week layoff as a fresh start', () => {
    // Legs, Push, then 3 weeks off; "Push" on return is day 2 of a new run, not day 2 continued from Push
    const r = routineRotation(PPL, [w('Legs', '2026-09-01'), w('Push', '2026-09-02'), w('Push', '2026-09-28')], '2026-09-29', WEEK);
    expect(r.nextIndex).toBe(2);
    expect([...r.doneThisWeek]).toEqual([1]);
  });
});
