import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import ProfileScreen from '../screens/ProfileTab/ProfileScreen';

jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: { fontSize: 30 }, body: {}, button: {} } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const nav = createMockNavigation();
const route = createMockRoute('ProfileHome');

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockFetchSequence([
      { data: [{ id: 1, name: 'Push Day', date: '2026-05-01T10:00:00' }] },
      { data: { total_workouts: 10, longest_streak: 3, total_volume: 5000 } },
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
});
