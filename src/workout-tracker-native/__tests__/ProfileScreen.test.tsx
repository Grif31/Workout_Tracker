import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import ProfileScreen from '../screens/ProfileTab/ProfileScreen';

jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: { fontSize: 30 }, body: {}, button: {} } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const nav = createMockNavigation();
const route = createMockRoute('ProfileHome');

const workoutsResponse = { data: { workouts: [{ id: 1, name: 'Push Day', date: '2026-05-01T10:00:00', duration: 60, volume: 2000, num_exercises: 3, muscles: [] }], total: 1, has_more: false } };
const statsResponse = { data: { total_workouts: 10, longest_streak: 3, total_volume: 5000 } };
const strengthScoreResponse = { data: {} };

const onePrResponse = {
  data: [{
    id: 1, exercise_template_id: 7, exercise_name: 'Bench Press',
    pr_type: 'max_weight', value: 245, weight_context: null,
    pr_label: 'Max Weight', achieved_at: '2026-08-01T00:00:00',
  }],
};

describe('ProfileScreen', () => {
  beforeEach(async () => {
    // nav is a module-level singleton shared across every test in this file —
    // without this, nav.navigate's call history from an earlier test leaks
    // into later toHaveBeenCalledWith assertions.
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockFetchSequence([
      workoutsResponse,
      statsResponse,
      { data: [] },                   // personal-records
      strengthScoreResponse,
    ]);
  });

  it('renders without crashing', () => {
    render(<ProfileScreen navigation={nav as any} route={route as any} />);
  });

  it('displays the user display name', async () => {
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Test User')).toBeTruthy());
  });

  it('shows the Profile section title', async () => {
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Profile')).toBeTruthy());
  });

  it('shows workout history after fetch', async () => {
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Push Day')).toBeTruthy());
  });

  it('shows total workouts stat', async () => {
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('10')).toBeTruthy());
  });

  it('hides the Personal Records box when there are no PRs', async () => {
    const { queryByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(queryByText('10')).toBeTruthy());
    expect(queryByText('Personal Records')).toBeNull();
  });

  it('navigates to the PR Dashboard when the Personal Records box is tapped', async () => {
    mockFetchSequence([workoutsResponse, statsResponse, onePrResponse, strengthScoreResponse]);
    const { getByText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Personal Records')).toBeTruthy());
    fireEvent.press(getByText('Personal Records'));
    expect(nav.navigate).toHaveBeenCalledWith('PRDashboard');
  });

  it('opens the exercise picker instead of the PR Dashboard when a swap button is tapped', async () => {
    mockFetchSequence([workoutsResponse, statsResponse, onePrResponse, strengthScoreResponse]);
    const { getByText, getAllByLabelText } = render(<ProfileScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Personal Records')).toBeTruthy());
    fireEvent.press(getAllByLabelText('Change pinned PR')[0]);
    await waitFor(() => expect(getByText('Choose Exercise')).toBeTruthy());
    expect(nav.navigate).not.toHaveBeenCalledWith('PRDashboard');
  });
});
