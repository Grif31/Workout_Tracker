import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { mockFetch } from './testUtils';
import WorkoutDetailsComponent from '../components/WorkoutDetails';

jest.mock('@expo/react-native-action-sheet', () => ({
  useActionSheet: () => ({ showActionSheetWithOptions: jest.fn() }),
}));
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const mockWorkout = {
  id: 1,
  name: 'Push Day',
  date: '2026-05-01T10:00:00',
  notes: 'Felt great',
  duration: 60,
  volume: 5000,
  total_reps: 100,
  num_exercises: 3,
  exercises: [
    {
      id: 1,
      name: 'Bench Press',
      sets: [
        { id: 1, reps: 5, weight: 225, set_type: 'N' },
        { id: 2, reps: 5, weight: 235, set_type: 'N' },
      ],
    },
  ],
};

describe('WorkoutDetails component', () => {
  beforeEach(() => mockFetch(mockWorkout));

  it('renders without crashing', () => {
    render(<WorkoutDetailsComponent workoutId={1} />);
  });

  it('shows the workout name after fetch', async () => {
    const { getAllByText } = render(<WorkoutDetailsComponent workoutId={1} />);
    await waitFor(() => expect(getAllByText('Push Day').length).toBeGreaterThan(0));
  });

  it('shows exercise name', async () => {
    const { getAllByText } = render(<WorkoutDetailsComponent workoutId={1} />);
    await waitFor(() => expect(getAllByText('Bench Press').length).toBeGreaterThan(0));
  });

  it('shows workout duration', async () => {
    const { getAllByText } = render(<WorkoutDetailsComponent workoutId={1} />);
    await waitFor(() => expect(getAllByText(/1h/).length).toBeGreaterThan(0));
  });
});

describe('WorkoutDetails save as template', () => {
  it('keeps each superset group with its exercise when a non-library one is left out', async () => {
    const sheet = require('@expo/react-native-action-sheet');
    let chooseOption: any = null;
    let sheetOptions: string[] = [];
    jest.spyOn(sheet, 'useActionSheet').mockReturnValue({
      showActionSheetWithOptions: (opts: any, cb: any) => { sheetOptions = opts.options; chooseOption = cb; },
    });
    const workout = {
      ...mockWorkout,
      exercises: [
        { id: 1, name: 'Custom Thing', exercise_template_id: null, superset_group: null, sets: [] },
        { id: 2, name: 'Bench Press', exercise_template_id: 10, superset_group: 1, sets: [] },
        { id: 3, name: 'Barbell Row', exercise_template_id: 11, superset_group: 1, sets: [] },
      ],
    };
    (global.fetch as jest.Mock) = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(workout) }));
    const { fireEvent } = require('@testing-library/react-native');
    const utils = render(<WorkoutDetailsComponent workoutId={1} onSaveAsTemplate={jest.fn()} />);
    await waitFor(() => expect(utils.getByLabelText('Workout options')).toBeTruthy());
    fireEvent.press(utils.getByLabelText('Workout options'));
    chooseOption(sheetOptions.indexOf('Save as Template'));
    await waitFor(() => expect(utils.getByText('Save')).toBeTruthy());
    fireEvent.press(utils.getByText('Save'));
    await waitFor(() => {
      const post = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST');
      expect(JSON.parse(post[1].body)).toMatchObject({ exercise_template_ids: [10, 11], superset_groups: [1, 1] });
    });
  });
});
