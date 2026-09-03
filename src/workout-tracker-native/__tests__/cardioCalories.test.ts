import { estimateCalories } from '../utils/cardioCalories';

// kcal = MET * weightKg * hours
describe('estimateCalories — flat MET (no speed)', () => {
  it('uses the per-activity MET table', () => {
    // running MET 9.8, 70kg, 30 min -> 9.8 * 70 * 0.5 = 343
    expect(estimateCalories('running', 30, 70)).toBe(343);
    // cycling MET 8.0, 80kg, 60 min -> 640
    expect(estimateCalories('Cycling', 60, 80)).toBe(640);
  });

  it('is case-insensitive on the activity name', () => {
    expect(estimateCalories('RUNNING', 30, 70)).toBe(estimateCalories('running', 30, 70));
  });

  it('falls back to MET 6 for an unknown activity', () => {
    // 6 * 70 * 1 = 420
    expect(estimateCalories('underwater basket weaving', 60, 70)).toBe(420);
  });

  it('accepts activity aliases (run/cycle/bike/row/...)', () => {
    expect(estimateCalories('run', 30, 70)).toBe(estimateCalories('running', 30, 70));
    expect(estimateCalories('bike', 60, 80)).toBe(estimateCalories('cycling', 60, 80));
  });

  it('scales linearly with duration and weight', () => {
    const base = estimateCalories('rowing', 30, 70);
    expect(estimateCalories('rowing', 60, 70)).toBe(base * 2);
  });

  it('rounds to a whole number', () => {
    expect(Number.isInteger(estimateCalories('hiking', 43, 68.4))).toBe(true);
  });
});

describe('estimateCalories — speed-based MET (GPS workouts)', () => {
  it('running MET tracks km/h roughly 1:1 above the 6.0 floor', () => {
    // 12 km/h -> MET 12; 70kg; 60 min -> 840
    expect(estimateCalories('running', 60, 70, 12)).toBe(840);
  });

  it('applies the running MET floor for a slow jog', () => {
    // 4 km/h -> Math.max(6, 4) = 6; 70kg; 60 min -> 420
    expect(estimateCalories('running', 60, 70, 4)).toBe(420);
  });

  it('uses the cycling speed formula (speed*0.45 + 2)', () => {
    // 20 km/h -> 0.45*20 + 2 = 11 MET; 80kg; 60 min -> 880
    expect(estimateCalories('cycling', 60, 80, 20)).toBe(880);
  });

  it('uses the walking speed formula (speed*0.5 + 1.5)', () => {
    // 6 km/h -> 0.5*6 + 1.5 = 4.5 MET; 70kg; 60 min -> 315
    expect(estimateCalories('walking', 60, 70, 6)).toBe(315);
  });

  it('ignores a non-positive speed and uses the flat MET', () => {
    expect(estimateCalories('running', 30, 70, 0)).toBe(estimateCalories('running', 30, 70));
    expect(estimateCalories('running', 30, 70, -5)).toBe(estimateCalories('running', 30, 70));
  });

  it('falls back to flat-table MET for an activity with no speed formula', () => {
    // elliptical has no speed branch -> FLAT_MET.elliptical = 5; 70kg; 60 min -> 350
    expect(estimateCalories('elliptical', 60, 70, 10)).toBe(350);
  });
});
