import { nextTarget, nextHoldTarget } from '../utils/overloadTarget';
import { targetFor } from '../components/workout/NextTargetModal';

const set = (reps: number, weight: number, extra: object = {}) => ({ reps: String(reps), weight: String(weight), set_type: 'N', rpe: '', ...extra });

describe('nextTarget', () => {
  it('adds a plate step when every set matched', () => {
    const t = nextTarget([set(8, 185), set(8, 185), set(8, 185)], 5)!;
    expect(t).toMatchObject({ last: '8 x 185', target: '8 x 190', reason: 'add_weight' });
  });

  it('uses the kg step for kg users', () => {
    expect(nextTarget([set(5, 100), set(5, 100)], 2.5)!.target).toBe('5 x 102.5');
  });

  it('shows last time with its RPE', () => {
    expect(nextTarget([set(8, 185, { rpe: '7' }), set(8, 185, { rpe: '7' })], 5)!.last).toBe('8 x 185 @ 7');
  });

  it('adds a rep to the weakest set when the sets fell off', () => {
    const t = nextTarget([set(8, 185), set(7, 185), set(6, 185)], 5)!;
    expect(t).toMatchObject({ last: '8 x 185', target: '7 x 185', reason: 'add_rep' });
  });

  it('holds when any set was near the limit', () => {
    const t = nextTarget([set(8, 185, { rpe: '7' }), set(8, 185, { rpe: '9' })], 5)!;
    expect(t).toMatchObject({ target: '8 x 185', reason: 'hold' });
    expect(nextTarget([set(8, 185, { rpe: '9.5' }), set(8, 185)], 5)!.reason).toBe('hold');
  });

  it('treats RPE 8 and under as room to add weight', () => {
    expect(nextTarget([set(8, 185, { rpe: '8' }), set(8, 185, { rpe: '8' })], 5)!.reason).toBe('add_weight');
  });

  it('drops the reps a little when a plate follows a set of 12 or more', () => {
    expect(nextTarget([set(12, 100), set(12, 100)], 5)!.target).toBe('10 x 105');
    expect(nextTarget([set(15, 100), set(15, 100)], 5)!.target).toBe('10 x 105');
  });

  it('bases it on the heaviest working weight, not a back-off set', () => {
    const t = nextTarget([set(5, 225), set(5, 225), set(8, 185)], 5)!;
    expect(t).toMatchObject({ last: '5 x 225', target: '5 x 230' });
  });

  it('ignores warm-ups, drop sets and failure sets', () => {
    const t = nextTarget([
      set(10, 95, { set_type: 'W' }), set(8, 185), set(8, 185),
      set(12, 135, { set_type: 'D' }), set(4, 185, { set_type: 'F' }),
    ], 5)!;
    expect(t).toMatchObject({ last: '8 x 185', target: '8 x 190' });
  });

  it('adds reps, never weight, to bodyweight work', () => {
    expect(nextTarget([set(10, 0), set(10, 0)], 5)).toMatchObject({ last: '10 reps', target: '11 reps', reason: 'add_rep' });
    expect(nextTarget([set(10, 0), set(8, 0)], 5)!.target).toBe('9 reps');
  });

  it('works with a single working set', () => {
    expect(nextTarget([set(5, 135)], 5)!.target).toBe('5 x 140');
  });

  it('has nothing to say without usable history', () => {
    expect(nextTarget(undefined, 5)).toBeNull();
    expect(nextTarget([], 5)).toBeNull();
    expect(nextTarget([set(10, 95, { set_type: 'W' })], 5)).toBeNull();
    expect(nextTarget([{ reps: '', weight: '', set_type: 'N' }], 5)).toBeNull();
  });

  it('reads backend strings like "155.0"', () => {
    expect(nextTarget([set(8, 155.0), set(8, 155.0)], 5)!.target).toBe('8 x 160');
  });

  it('has no em dashes in the copy', () => {
    for (const sets of [[set(8, 185), set(8, 185)], [set(8, 185), set(6, 185)], [set(8, 185, { rpe: '10' })], [set(10, 0)]]) {
      const t = nextTarget(sets, 5)!;
      expect(t.why + t.target + t.last).not.toMatch(/[—!]/);
    }
  });
});

// Holds store minutes in cardio_duration, with no reps
const hold = (secs: number, extra: object = {}) => ({ reps: '', weight: '', set_type: 'N', cardio_duration: String(secs / 60), ...extra });

describe('nextHoldTarget', () => {
  it('adds 5 seconds when every hold matched', () => {
    expect(nextHoldTarget([hold(45), hold(45), hold(45)])).toMatchObject({ last: '45s', target: '50s', reason: 'add_weight' });
  });

  it('stretches the shortest hold first, never past the longest', () => {
    expect(nextHoldTarget([hold(60), hold(50)])).toMatchObject({ last: '1:00', target: '55s', reason: 'add_rep' });
    expect(nextHoldTarget([hold(60), hold(58)])!.target).toBe('1:00');
  });

  it('formats a minute and over as m:ss', () => {
    expect(nextHoldTarget([hold(90)])!.target).toBe('1:35');
  });

  it('ignores warm-ups and empty holds, and is null with nothing to build on', () => {
    expect(nextHoldTarget([hold(30, { set_type: 'W' }), hold(40)])!.last).toBe('40s');
    expect(nextHoldTarget(undefined)).toBeNull();
    expect(nextHoldTarget([hold(0)])).toBeNull();
  });
});

describe('targetFor', () => {
  it('routes holds to the hold rule and gives cardio no target', () => {
    expect(targetFor({ exercise_type: 'duration', previousSets: [hold(30)] }, 'lbs')!.target).toBe('35s');
    expect(targetFor({ exercise_type: 'cardio', previousSets: [hold(30)] }, 'lbs')).toBeNull();
    expect(targetFor({ previousSets: [set(5, 100), set(5, 100)] }, 'kg')!.target).toBe('5 x 102.5');
  });
});
