import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import PersonalRecordsScreen from '../screens/ProfileTab/PersonalRecordsScreen';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const nav = createMockNavigation();
const route = createMockRoute('PersonalRecords');

const prsPayload = [
  {
    id: 1, exercise_template_id: 7, exercise_name: 'Bench Press', equipment: null,
    pr_type: 'max_weight', pr_label: 'Max Weight', value: 245, weight_context: null,
    achieved_at: '2026-08-10T00:00:00', muscle_group: 'Chest',
  },
  {
    id: 2, exercise_template_id: 9, exercise_name: 'Running', equipment: null,
    pr_type: 'best_time', pr_label: '5K Best Time', value: 24.5, weight_context: 5.0,
    achieved_at: '2026-08-01T00:00:00', muscle_group: 'Core',
  },
];

describe('PersonalRecordsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch(prsPayload);
  });

  it('renders without crashing', () => {
    render(<PersonalRecordsScreen navigation={nav as any} route={route as any} />);
  });

  it('shows a gold muscle-group header when Max Weight is sorted by muscle', async () => {
    const { getByText } = render(<PersonalRecordsScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    fireEvent.press(getByText('By Muscle'));
    await waitFor(() => expect(getByText('Chest')).toBeTruthy());
  });

  it('shows a gold per-exercise header on the Time tab', async () => {
    const { getByText } = render(<PersonalRecordsScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    fireEvent.press(getByText('Time'));
    await waitFor(() => expect(getByText('Running')).toBeTruthy());
  });
});
