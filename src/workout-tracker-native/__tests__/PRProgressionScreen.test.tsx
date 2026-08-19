import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import PRProgressionScreen from '../screens/ProfileTab/PRProgressionScreen';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const nav = createMockNavigation();
const route = createMockRoute('PRProgression', { exerciseTemplateId: 7, exerciseName: 'Bench Press' });

const historyPayload = [
  {
    id: 1, exercise_template_id: 7, workout_id: 40,
    pr_type: 'max_weight', value: 225, weight_context: null,
    previous_value: null, improved_by: null,
    achieved_at: '2026-07-01T00:00:00',
    pr_label: 'Max Weight', workout_name: 'Push A',
  },
  {
    id: 2, exercise_template_id: 7, workout_id: 42,
    pr_type: 'max_weight', value: 245, weight_context: null,
    previous_value: 225, improved_by: 20,
    achieved_at: '2026-08-10T00:00:00',
    pr_label: 'Max Weight', workout_name: 'Push B',
  },
  {
    id: 3, exercise_template_id: 7, workout_id: 42,
    pr_type: 'estimated_1rm', value: 262.5, weight_context: null,
    previous_value: null, improved_by: null,
    achieved_at: '2026-08-10T00:00:00',
    pr_label: 'Estimated 1RM', workout_name: 'Push B',
  },
];

describe('PRProgressionScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockFetch(historyPayload);
  });

  it('renders without crashing', () => {
    render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
  });

  it('shows the exercise name in the header', async () => {
    const { getByText } = render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
  });

  it('shows metric chips for available types only', async () => {
    const { getByText, queryByText } = render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Max Weight')).toBeTruthy());
    expect(getByText('Est. 1RM')).toBeTruthy();
    expect(queryByText('Best Time')).toBeNull();
  });

  it('shows table rows newest first with values and deltas', async () => {
    const { getByText, getAllByText } = render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
    // "245 lbs" appears twice: the hero's "current best" and the table's top row
    await waitFor(() => expect(getAllByText('245 lbs').length).toBe(2));
    expect(getByText('225 lbs')).toBeTruthy();
    expect(getByText('+20 lbs')).toBeTruthy();
    expect(getByText('Push B')).toBeTruthy();
  });

  it('formats the table\'s Date column as dd/mm/yyyy', async () => {
    const { getByText } = render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('10/08/2026')).toBeTruthy());
    expect(getByText('01/07/2026')).toBeTruthy();
  });

  it('switches to the Est. 1RM series when its chip is tapped', async () => {
    const { getByText, getAllByText, queryAllByText } = render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Est. 1RM')).toBeTruthy());
    fireEvent.press(getByText('Est. 1RM'));
    await waitFor(() => expect(getAllByText('262.5 lbs').length).toBe(2));
    expect(queryAllByText('245 lbs').length).toBe(0);
  });

  it('navigates to WorkoutDetails when a table row is tapped', async () => {
    const { getAllByText } = render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getAllByText('245 lbs').length).toBe(2));
    // Index 0 is the hero card (not tappable) — the table row is the last match
    const matches = getAllByText('245 lbs');
    fireEvent.press(matches[matches.length - 1]);
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutDetails', { workoutId: 42 });
  });

  it('pins the exercise to the PR Dashboard', async () => {
    const { getByLabelText } = render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByLabelText('Pin to PR Dashboard')).toBeTruthy());
    fireEvent.press(getByLabelText('Pin to PR Dashboard'));
    await waitFor(async () => {
      const saved = await AsyncStorage.getItem('pr_dashboard_pins_1');
      expect(JSON.parse(saved!)).toEqual([{ id: 7, name: 'Bench Press' }]);
    });
    expect(getByLabelText('Unpin from PR Dashboard')).toBeTruthy();
  });

  it('unpins a pinned exercise', async () => {
    await AsyncStorage.setItem('pr_dashboard_pins_1', JSON.stringify([{ id: 7, name: 'Bench Press' }]));
    const { getByLabelText } = render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByLabelText('Unpin from PR Dashboard')).toBeTruthy());
    fireEvent.press(getByLabelText('Unpin from PR Dashboard'));
    await waitFor(async () => {
      const saved = await AsyncStorage.getItem('pr_dashboard_pins_1');
      expect(JSON.parse(saved!)).toEqual([]);
    });
  });

  it('shows total improvement since the first recorded PR in the hero card', async () => {
    const { getByText } = render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/\+20 lbs since/)).toBeTruthy());
  });

  it('shows an empty state when there is no history', async () => {
    mockFetch([]);
    const { getByText } = render(<PRProgressionScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/No PR history/)).toBeTruthy());
  });
});
