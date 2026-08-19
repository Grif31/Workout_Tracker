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

  it('navigates to Progression when a Max Weight (default sort) row is tapped', async () => {
    const { getByText } = render(<PersonalRecordsScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    fireEvent.press(getByText('Bench Press'));
    expect(nav.navigate).toHaveBeenCalledWith('PRProgression', { exerciseTemplateId: 7, exerciseName: 'Bench Press' });
  });

  it('navigates to Progression when a Max Weight (by muscle) row is tapped', async () => {
    const { getByText } = render(<PersonalRecordsScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    fireEvent.press(getByText('By Muscle'));
    await waitFor(() => expect(getByText('Chest')).toBeTruthy());
    fireEvent.press(getByText('Bench Press'));
    expect(nav.navigate).toHaveBeenCalledWith('PRProgression', { exerciseTemplateId: 7, exerciseName: 'Bench Press' });
  });

  it('navigates to Progression when a Time-tab row is tapped', async () => {
    const { getByText } = render(<PersonalRecordsScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    fireEvent.press(getByText('Time'));
    await waitFor(() => expect(getByText('Running')).toBeTruthy());
    fireEvent.press(getByText('5K')); // the data row itself; "Running" is just the section header
    expect(nav.navigate).toHaveBeenCalledWith('PRProgression', { exerciseTemplateId: 9, exerciseName: 'Running' });
  });

  it('navigates to Progression when an expanded Max Reps entry is tapped', async () => {
    mockFetch([...prsPayload, {
      id: 3, exercise_template_id: 12, exercise_name: 'Squat', equipment: null,
      pr_type: 'max_reps', pr_label: 'Max Reps', value: 10, weight_context: 225,
      achieved_at: '2026-07-15T00:00:00', muscle_group: 'Legs',
    }]);
    const { getByText } = render(<PersonalRecordsScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
    fireEvent.press(getByText('Max Reps'));
    await waitFor(() => expect(getByText('Squat')).toBeTruthy());
    fireEvent.press(getByText('Squat')); // expands the accordion — does not navigate
    await waitFor(() => expect(getByText('225 lbs')).toBeTruthy());
    fireEvent.press(getByText('225 lbs'));
    expect(nav.navigate).toHaveBeenCalledWith('PRProgression', { exerciseTemplateId: 12, exerciseName: 'Squat' });
  });
});
