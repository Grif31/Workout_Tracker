import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import ExerciseDetailScreen from '../screens/ExercisesTab/ExerciseDetailScreen';

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('utils/units', () => ({
  toDisplayWeight: (v: number) => v,
  toDisplayVolume: (v: number) => v,
  convertWeight: (v: number) => v,
  WeightUnit: {},
}), { virtual: true });

const nav = createMockNavigation();
const route = createMockRoute('ExerciseDetail', {
  exerciseId: 1,
  exerciseName: 'Bench Press',
  muscleGroup: 'Chest',
});

const mockApiStats = {
  personal_bests: { estimated_1rm: 280, max_weight: 245, most_reps: 10 },
  totals: { total_sets: 30, total_reps: 120, workout_count: 10, max_volume: 1200 },
  history: [],
};

describe('ExerciseDetailScreen', () => {
  beforeEach(() => {
    mockFetchSequence([
      { data: mockApiStats },
    ]);
  });

  it('renders without crashing', () => {
    render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
  });

  it('displays the exercise name', async () => {
    const { getByText } = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
  });

  it('shows About, Stats, History tabs', async () => {
    const { getByText } = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => {
      expect(getByText('About')).toBeTruthy();
      expect(getByText('Stats')).toBeTruthy();
      expect(getByText('History')).toBeTruthy();
    });
  });

  it('switches to Stats tab when pressed', async () => {
    const { getByText } = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => fireEvent.press(getByText('Stats')));
    await waitFor(() => expect(getByText(/280/)).toBeTruthy());
  });
});
