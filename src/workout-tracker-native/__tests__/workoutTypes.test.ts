import {
  isBodyweight, usesBodyweightForVolume, bodyweightLoadFactor, isDuration,
  fmtHold, fmtElapsed, fmtCountdown, makeInitialSet, makeUid,
} from '../components/workout/types';

describe('isBodyweight', () => {
  it('is true only for Bodyweight equipment that is not cardio', () => {
    expect(isBodyweight({ equipment: 'Bodyweight' })).toBe(true);
    expect(isBodyweight({ equipment: 'Bodyweight', exercise_type: 'strength' })).toBe(true);
    expect(isBodyweight({ equipment: 'Bodyweight', exercise_type: 'cardio' })).toBe(false);
    // Weighted pull-ups/dips take an added-weight input.
    expect(isBodyweight({ equipment: 'Weighted' })).toBe(false);
    expect(isBodyweight({ equipment: 'Barbell' })).toBe(false);
    expect(isBodyweight({})).toBe(false);
  });
});

describe('usesBodyweightForVolume', () => {
  // Must match BODYWEIGHT_VOLUME_EQUIPMENT in src/utils/volume.py, or the live
  // volume shown during a workout disagrees with what the server stores.
  it.each([
    ['Bodyweight', true], ['Weighted', true],
    ['Barbell', false], ['Dumbbell', false], ['Machine', false], [undefined, false],
  ])('%s -> %s', (equipment, expected) => {
    expect(usesBodyweightForVolume({ equipment: equipment as string | undefined })).toBe(expected);
  });
});

describe('bodyweightLoadFactor', () => {
  it('uses the exercise factor when set', () => {
    expect(bodyweightLoadFactor({ bodyweight_load_factor: 0.6 })).toBe(0.6);
  });

  it('keeps a factor of 0 instead of treating it as missing', () => {
    expect(bodyweightLoadFactor({ bodyweight_load_factor: 0 })).toBe(0);
  });

  it('defaults to the full bodyweight when null or missing', () => {
    expect(bodyweightLoadFactor({ bodyweight_load_factor: null })).toBe(1);
    expect(bodyweightLoadFactor({})).toBe(1);
  });
});

describe('isDuration', () => {
  it('matches only duration exercises', () => {
    expect(isDuration({ exercise_type: 'duration' })).toBe(true);
    expect(isDuration({ exercise_type: 'cardio' })).toBe(false);
    expect(isDuration({})).toBe(false);
  });
});

describe('time formatting', () => {
  it('fmtHold converts stored minutes to seconds or m:ss', () => {
    expect(fmtHold(0.5)).toBe('30s');
    expect(fmtHold(59 / 60)).toBe('59s');
    expect(fmtHold(1)).toBe('1:00');
    expect(fmtHold(1.5)).toBe('1:30');
    // Saved as minutes rounded to 4 decimals; must come back as the seconds typed.
    expect(fmtHold(Math.round((45 / 60) * 10000) / 10000)).toBe('45s');
    expect(fmtHold(Math.round((100 / 60) * 10000) / 10000)).toBe('1:40');
  });

  it('fmtElapsed shows seconds, then m:ss, then hours and minutes', () => {
    expect(fmtElapsed(0)).toBe('0s');
    expect(fmtElapsed(59)).toBe('59s');
    expect(fmtElapsed(60)).toBe('1:00');
    expect(fmtElapsed(605)).toBe('10:05');
    expect(fmtElapsed(3599)).toBe('59:59');
    expect(fmtElapsed(3600)).toBe('1h 0m');
    expect(fmtElapsed(5430)).toBe('1h 30m');
  });

  it('fmtCountdown always shows m:ss', () => {
    expect(fmtCountdown(0)).toBe('0:00');
    expect(fmtCountdown(9)).toBe('0:09');
    expect(fmtCountdown(90)).toBe('1:30');
    expect(fmtCountdown(600)).toBe('10:00');
  });
});

describe('makeInitialSet', () => {
  it('creates a blank strength set', () => {
    expect(makeInitialSet({ equipment: 'Barbell' })).toEqual({
      uid: expect.any(String), reps: '', weight: '', set_type: 'N',
    });
  });

  it('prefills weight 0 for bodyweight exercises', () => {
    expect(makeInitialSet({ equipment: 'Bodyweight' }).weight).toBe('0');
  });

  it('creates a cardio set with cardio fields defaulting to miles', () => {
    expect(makeInitialSet({ exercise_type: 'cardio' })).toEqual({
      uid: expect.any(String), reps: '', weight: '', set_type: 'N',
      cardio_duration: '', distance: '', distance_unit: 'mi', intensity: '',
    });
  });

  it('creates a duration set with only a hold time', () => {
    expect(makeInitialSet({ exercise_type: 'duration', equipment: 'Bodyweight' })).toEqual({
      uid: expect.any(String), reps: '', weight: '', set_type: 'N', cardio_duration: '',
    });
  });

  it('gives every set a unique uid', () => {
    const uids = new Set(Array.from({ length: 200 }, () => makeUid()));
    expect(uids.size).toBe(200);
  });
});
