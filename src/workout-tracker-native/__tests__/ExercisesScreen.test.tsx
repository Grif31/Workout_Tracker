import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
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
    mockFetchSequence([
      { data: exercises },          // fetchExercises
      { data: { recent: [] } },    // fetchRecentExercises
    ]);
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
