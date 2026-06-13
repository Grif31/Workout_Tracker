import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { mockFetch } from './testUtils';
import WorkoutDetailsComponent from '../components/WorkoutDetails';

jest.mock('@expo/react-native-action-sheet', () => ({
  useActionSheet: () => ({ showActionSheetWithOptions: jest.fn() }),
}));
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));
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
