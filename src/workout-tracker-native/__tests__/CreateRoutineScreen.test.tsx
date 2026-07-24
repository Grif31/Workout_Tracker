import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import CreateRoutineScreen from '../screens/ExercisesTab/CreateRoutineScreen';

jest.mock('navigation/types', () => ({}), { virtual: true });
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['All', 'Chest', 'Back'] }));
jest.mock('components/ExerciseList', () => () => null);

const nav = createMockNavigation();
const route = createMockRoute('CreateRoutine');

describe('CreateRoutineScreen', () => {
  beforeEach(() => {
    mockFetchSequence([
      { data: [{ id: 1, name: 'Bench Press', muscle_group: 'Chest' }] },
      { data: [] },
    ]);
  });

  it('renders without crashing', () => {
    render(<CreateRoutineScreen navigation={nav as any} route={route as any} />);
  });

  it('shows the routine name input', async () => {
    const { getByPlaceholderText } = render(<CreateRoutineScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByPlaceholderText('e.g. PPL Split')).toBeTruthy());
  });

  it('shows Add Day button', async () => {
    const { getByText } = render(<CreateRoutineScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/add day/i)).toBeTruthy());
  });

  it('adds a day when Add Day is pressed', async () => {
    const { getByText, getAllByText } = render(<CreateRoutineScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => fireEvent.press(getByText(/add day/i)));
    expect(getAllByText(/day/i).length).toBeGreaterThan(1);
  });
});
