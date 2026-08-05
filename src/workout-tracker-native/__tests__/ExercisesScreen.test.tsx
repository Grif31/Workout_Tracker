import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import ExercisesScreen from '../screens/ExercisesTab/ExercisesScreen';

jest.mock('navigation/types', () => ({}), { virtual: true });
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['All', 'Chest', 'Back', 'Quads'] }));
jest.mock('constants/equipmentTypes', () => ({ equipmentTypes: ['All', 'Barbell', 'Dumbbell'] }));
jest.mock('components/ExerciseList', () => () => null);

const nav = createMockNavigation();
const route = createMockRoute('ExercisesHome');

const exercises = [
  { id: 1, name: 'Bench Press', muscle_group: 'Chest' },
  { id: 2, name: 'Squat', muscle_group: 'Quads' },
];

describe('ExercisesScreen', () => {
  beforeEach(() => {
    // URL-aware (not call-order-based): fetchExercises and fetchRecentExercises
    // fire independently and aren't guaranteed to reach fetch() in a fixed
    // order (fetchExercises checks the exercise cache first), so a
    // sequential-by-call-order mock isn't reliable here.
    (global.fetch as jest.Mock) = jest.fn((url: string) => {
      if (url.includes('/api/stats/recent-exercises')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ recent: [] }) });
      }
      if (url.includes('/api/exercises')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(exercises) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
  });

  it('renders without crashing', () => {
    render(<ExercisesScreen navigation={nav as any} route={route as any} />);
  });

  it('shows the Exercises screen title', () => {
    const { getByText } = render(<ExercisesScreen navigation={nav as any} route={route as any} />);
    expect(getByText('Exercises')).toBeTruthy();
  });

  it('shows exercise list after fetch', async () => {
    const { getByText } = render(<ExercisesScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
  });
});
