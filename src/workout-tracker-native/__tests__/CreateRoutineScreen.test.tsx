import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import CreateRoutineScreen from '../screens/TrainingTab/CreateRoutineScreen';

jest.mock('navigation/types', () => ({}), { virtual: true });
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['All', 'Chest', 'Back'] }));
// Captures the picker's props so tests can check its mode and drive onSelect
let mockPickerProps: any = null;
jest.mock('components/ExerciseList', () => (props: any) => { mockPickerProps = props; return null; });

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

describe('CreateRoutineScreen (new routine days and exercises)', () => {
  // Routed by URL rather than call order: exercises and templates load in
  // parallel on mount.
  beforeEach(() => {
    mockPickerProps = null;
    (global.fetch as jest.Mock) = jest.fn((url: string) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(
        String(url).endsWith('/api/exercises')
          ? [
              { id: 1, name: 'Bench Press', muscle_group: 'Chest' },
              { id: 2, name: 'Squat', muscle_group: 'Quadriceps' },
            ]
          : [],
      ),
    }));
  });

  const renderNew = () => render(
    <CreateRoutineScreen navigation={createMockNavigation() as any} route={createMockRoute('CreateRoutine') as any} />,
  );

  it('starts a new routine with Day 1', async () => {
    const { getByDisplayValue } = renderNew();
    await waitFor(() => expect(getByDisplayValue('Day 1')).toBeTruthy());
  });

  it('adds every exercise picked in one multi-select batch', async () => {
    const { getByText } = renderNew();
    await waitFor(() => fireEvent.press(getByText('+ Add Exercise')));
    // addExerciseToDay looks exercises up in the loaded list, so wait for it
    await waitFor(() => expect(mockPickerProps?.exercises).toHaveLength(2));
    expect(mockPickerProps.multiSelect).toBe(true);
    await act(async () => {
      mockPickerProps.onSelect({ id: 1, name: 'Bench Press' });
      mockPickerProps.onSelect({ id: 2, name: 'Squat' });
    });
    expect(getByText('Bench Press')).toBeTruthy();
    expect(getByText('Squat')).toBeTruthy();
  });

  it('skips an exercise that is already in the day', async () => {
    const { getByText, getAllByText } = renderNew();
    await waitFor(() => fireEvent.press(getByText('+ Add Exercise')));
    await waitFor(() => expect(mockPickerProps?.exercises).toHaveLength(2));
    await act(async () => { mockPickerProps.onSelect({ id: 2, name: 'Squat' }); });
    await act(async () => { mockPickerProps.onSelect({ id: 2, name: 'Squat' }); });
    expect(getAllByText('Squat')).toHaveLength(1);
  });
});
