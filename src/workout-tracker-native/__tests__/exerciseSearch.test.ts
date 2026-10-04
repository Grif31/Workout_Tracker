import { matchesExerciseSearch } from '../utils/exerciseSearch';

const incline = { name: 'Incline Bench Press', equipment: 'Dumbbell' };
const ohp = { name: 'Overhead Press', equipment: 'Barbell' };
const rdl = { name: 'Romanian Deadlift', equipment: 'Barbell' };

describe('exercise search', () => {
  it('matches words in any order across name and equipment', () => {
    expect(matchesExerciseSearch('press incline', incline)).toBe(true);
    expect(matchesExerciseSearch('dumbbell incline', incline)).toBe(true);
  });

  it('understands gym shorthand', () => {
    expect(matchesExerciseSearch('incline db', incline)).toBe(true);
    expect(matchesExerciseSearch('ohp', ohp)).toBe(true);
    expect(matchesExerciseSearch('bb rdl', rdl)).toBe(true);
  });

  it('still requires every word', () => {
    expect(matchesExerciseSearch('incline bb', incline)).toBe(false);
    expect(matchesExerciseSearch('squat', incline)).toBe(false);
  });

  it('keeps partial words and ignores case and punctuation', () => {
    expect(matchesExerciseSearch('INCL', incline)).toBe(true);
    expect(matchesExerciseSearch('bench-press', incline)).toBe(true);
  });

  it('matches everything for an empty query', () => {
    expect(matchesExerciseSearch('   ', incline)).toBe(true);
  });
});
