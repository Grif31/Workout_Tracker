import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import BodyweightScreen from '../screens/ProfileTab/BodyweightScreen';

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const nav = createMockNavigation();
const route = createMockRoute('BodyweightLog');

const mockLogs = [
  { id: 1, weight: 185.0, date: '2026-05-01T10:00:00' },
  { id: 2, weight: 183.0, date: '2026-04-24T10:00:00' },
];

describe('BodyweightScreen', () => {
  beforeEach(() => mockFetch(mockLogs));

  it('renders without crashing', () => {
    render(<BodyweightScreen navigation={nav as any} route={route as any} />);
  });

  it('shows bodyweight log entries after fetch', async () => {
    const { getAllByText } = render(<BodyweightScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getAllByText(/185/).length).toBeGreaterThan(0));
  });

  it('shows the Bodyweight header', async () => {
    const { getByText } = render(<BodyweightScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bodyweight')).toBeTruthy());
  });

  it('shows empty state when no logs', async () => {
    mockFetch([]);
    const { getByText } = render(<BodyweightScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/no entries/i)).toBeTruthy());
  });
});
