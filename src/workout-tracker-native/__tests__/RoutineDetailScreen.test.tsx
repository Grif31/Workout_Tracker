import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import RoutineDetailScreen from '../screens/ExercisesTab/RoutineDetailScreen';

jest.mock('navigation/types', () => ({}), { virtual: true });
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const nav = createMockNavigation();
const route = createMockRoute('RoutineDetail', { routineId: 1, routineName: 'PPL' });

const mockRoutine = {
  id: 1,
  name: 'PPL',
  description: 'Push Pull Legs',
  days: [
    {
      id: 1,
      day_order: 0,
      label: 'Push',
      workout_template: {
        id: 1,
        name: 'Push A',
        exercises: [{ id: 1, name: 'Bench Press', muscle_group: 'Chest' }],
      },
    },
  ],
};

describe('RoutineDetailScreen', () => {
  beforeEach(() => mockFetch(mockRoutine));

  it('renders without crashing', () => {
    render(<RoutineDetailScreen navigation={nav as any} route={route as any} />);
  });

  it('shows routine name after fetch', async () => {
    const { getByText } = render(<RoutineDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('PPL')).toBeTruthy());
  });

  it('shows routine day labels', async () => {
    const { getByText } = render(<RoutineDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Push')).toBeTruthy());
  });

  it('shows exercises within a day', async () => {
    const { getByText } = render(<RoutineDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
  });

  it('shows the 3-dot menu button', async () => {
    const { getByTestId } = render(<RoutineDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByTestId('menu-btn')).toBeTruthy());
  });
});
