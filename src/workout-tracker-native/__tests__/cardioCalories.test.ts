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

// Whole calories, so a hand-worked figure can land half a calorie either side
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);

describe('estimateCalories with a speed (GPS and logged distances)', () => {
  it('runs by the ACSM running equation', () => {
    // 12 km/h = 200 m/min: VO2 0.2*200 + 3.5 = 43.5 ml/kg/min; *70kg*60min/1000*5 kcal/L
    near(estimateCalories('running', 60, 70, 12), 913.5);
  });

  it('walks by the ACSM walking equation', () => {
    // 6 km/h = 100 m/min: VO2 0.1*100 + 3.5 = 13.5; *70*60/1000*5
    near(estimateCalories('walking', 60, 70, 6), 283.5);
  });

  it('rides by the power it takes to hold the speed', () => {
    // 20 km/h, 80 kg + 10 kg bike: rolling 0.006*90*9.81*5.56 = 29.4 W, drag
    // 0.5*1.2*0.5*5.56^3 = 51.4 W; 80.9 W for an hour at 24% efficiency
    near(estimateCalories('Cycling', 60, 80, 20), 290);
  });

  it('costs drag steeply with speed on a bike', () => {
    const at20 = estimateCalories('cycling', 60, 80, 20);
    const at30 = estimateCalories('cycling', 60, 80, 30);
    expect(at30).toBeGreaterThan(at20 * 2);
  });

  it('counts the climbing', () => {
    // Lifting 90 kg 500 m is 441 kJ of work, 440 kcal at 24% efficiency
    near(estimateCalories('cycling', 60, 80, 20, 500) - estimateCalories('cycling', 60, 80, 20), 439.6);
    // 200 m up over a 10 km run is a 2% grade: 0.9*v*0.02 more oxygen
    expect(estimateCalories('running', 50, 70, 12, 200)).toBeGreaterThan(estimateCalories('running', 50, 70, 12));
    expect(estimateCalories('hiking', 120, 70, 4, 600)).toBeGreaterThan(estimateCalories('hiking', 120, 70, 4));
  });

  it('treats a hike as a walk over rougher ground', () => {
    expect(estimateCalories('hiking', 60, 70, 5)).toBeGreaterThan(estimateCalories('walking', 60, 70, 5));
  });

  it('ignores a non-positive speed and uses the flat MET', () => {
    expect(estimateCalories('running', 30, 70, 0)).toBe(estimateCalories('running', 30, 70));
    expect(estimateCalories('running', 30, 70, -5)).toBe(estimateCalories('running', 30, 70));
  });

  it('falls back to the flat MET for an activity with no speed model', () => {
    // elliptical: FLAT_MET 5; 70kg; 60 min -> 350
    expect(estimateCalories('elliptical', 60, 70, 10)).toBe(350);
  });
});
