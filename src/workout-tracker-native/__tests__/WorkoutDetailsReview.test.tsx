import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import WorkoutDetails from '../components/WorkoutDetails';

const mockSheet = jest.fn();
jest.mock('@expo/react-native-action-sheet', () => ({
  useActionSheet: () => ({ showActionSheetWithOptions: (opts: any, cb: any) => mockSheet(opts, cb) }),
}));
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('../utils/shareCapture', () => ({ captureAndShare: jest.fn() }));

function serve(workout: any) {
  (global.fetch as jest.Mock) = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(workout) }));
}

const LIFT = {
  id: 1, name: 'Bench', exercise_type: 'strength', exercise_template_id: 7, equipment: 'Barbell',
  sets: [
    { id: 1, reps: 10, weight: 95, set_type: 'W', pr_types: [] },
    { id: 2, reps: 8, weight: 185, set_type: 'N', pr_types: ['max_reps'] },
    { id: 3, reps: 6, weight: 205, set_type: 'N', pr_types: ['max_reps', 'max_weight'] },
  ],
};
const RUN = {
  id: 2, name: 'Run', exercise_type: 'cardio', exercise_template_id: 9,
  sets: [
    { id: 4, cardio_duration: 25, distance: 5, distance_unit: 'km', intensity: 5, set_type: 'N' },
    { id: 5, cardio_duration: 10, distance: 1, distance_unit: 'km', intensity: 10, set_type: 'N' },
  ],
};

describe('WorkoutDetails', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists what each PR was, counting every record', async () => {
    serve({ id: 1, name: 'Push', date: '2026-09-20T00:00:00', volume: 3000, workout_type: 'strength', exercises: [LIFT] });
    const { findByText, getByText } = render(<WorkoutDetails workoutId={1} />);
    fireEvent.press(await findByText('3 Personal Records'));
    expect(getByText('Bench · Rep Records')).toBeTruthy();
    expect(getByText('8 reps at 185 lbs, 6 reps at 205 lbs')).toBeTruthy();
    expect(getByText('Bench · Max Weight')).toBeTruthy();
  });

  it('keeps warm-ups and drop sets when performing a workout again', async () => {
    serve({ id: 1, name: 'Push', date: '2026-09-20T00:00:00', volume: 3000, workout_type: 'strength', exercises: [LIFT] });
    const onPerformAgain = jest.fn();
    const { findByLabelText } = render(<WorkoutDetails workoutId={1} onPerformAgain={onPerformAgain} />);
    fireEvent.press(await findByLabelText('Workout options'));
    const [opts, cb] = mockSheet.mock.calls[0];
    cb(opts.options.indexOf('Perform Again'));

    const sets = onPerformAgain.mock.calls[0][0].exercises[0].sets;
    expect(sets.map((st: any) => st.set_type)).toEqual(['W', 'N', 'N']);
    // The numbers themselves start blank
    expect(sets.every((st: any) => st.reps === '' && st.weight === '')).toBe(true);
  });

  it('shares an all-cardio workout as cardio, with every bout in the totals', async () => {
    serve({
      id: 2, name: 'Intervals', date: '2026-09-20T00:00:00', workout_type: 'cardio',
      cardio_duration: 35, distance: 6, distance_unit: 'km', exercises: [RUN],
    });
    const { findByText } = render(<WorkoutDetails workoutId={2} />);
    // Off-screen share card: 6 km over both bouts, not the first bout's 5
    expect(await findByText(/^6\.0/)).toBeTruthy();
  });

  it('shares a lifting session with a cardio warm-up as a workout', async () => {
    serve({
      id: 3, name: 'Push', date: '2026-09-20T00:00:00', volume: 3000, workout_type: 'strength',
      exercises: [{ ...RUN, sets: [RUN.sets[1]] }, LIFT],
    });
    const { findByText } = render(<WorkoutDetails workoutId={3} />);
    expect(await findByText(/Total Volume/)).toBeTruthy();
  });

  it('writes cardio bouts as m:ss in the user unit', async () => {
    serve({
      id: 2, name: 'Run', date: '2026-09-20T00:00:00', workout_type: 'cardio',
      cardio_duration: 25, distance: 5, distance_unit: 'km', exercises: [{ ...RUN, sets: [RUN.sets[0]] }],
    });
    const { findByText } = render(<WorkoutDetails workoutId={2} />);
    // 5 km at 5:00/km, in the default mi
    expect(await findByText('25:00 · 3.11 mi · 8:03 /mi')).toBeTruthy();
  });
});
