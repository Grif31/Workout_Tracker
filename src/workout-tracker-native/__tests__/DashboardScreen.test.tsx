import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import DashboardScreen from '../screens/DashboardTab/DashboardScreen';

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const nav = createMockNavigation();
const route = createMockRoute('DashboardHome');

const mockUser = { id: 1, username: 'testuser', email: 'test@example.com', active_routine_id: null };
const mockStats = {
  weekly: [{ label: 'W1', volume: 5000, count: 3 }],
  last_7_days: { workouts: 3, volume: 5000, sets: 30 },
  this_week_dates: ['2026-04-28', '2026-04-29'],
};
const mockWorkouts = [
  { id: 1, name: 'Push Day', date: '2026-05-01T10:00:00', notes: '', duration: 60, volume: 2000, num_exercises: 3, muscles: [] },
];

describe('DashboardScreen', () => {
  beforeEach(() => {
    mockFetchSequence([
      { data: mockUser },     // fetchUser
      { data: mockWorkouts }, // fetchRecentWorkouts
      { data: mockStats },    // fetchDashStats
    ]);
  });

  it('renders without crashing', () => {
    render(<DashboardScreen navigation={nav as any} route={route as any} />);
  });

  it('shows a greeting with username', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/testuser/i)).toBeTruthy());
  });

  it('shows the Log Workout button', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/log workout/i)).toBeTruthy());
  });

  it('shows recent workout name after fetch', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Push Day')).toBeTruthy());
  });

  it('shows the Track Activity button', async () => {
    const { getByText } = render(<DashboardScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Track Activity')).toBeTruthy());
  });
});
