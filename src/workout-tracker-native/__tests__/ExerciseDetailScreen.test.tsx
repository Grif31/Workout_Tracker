import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import ExerciseDetailScreen from '../screens/ProgressTab/ExerciseDetailScreen';

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
// Mocked by path so it keeps applying however the screen imports it: a
// virtual mock of a bare specifier silently stops matching when the screen's
// import changes, and suppresses the "module not found" that would reveal it.
jest.mock('../utils/units', () => ({
  toDisplayWeight: (v: number) => v,
  toDisplayVolume: (v: number) => v,
  convertWeight: (v: number) => v,
  WeightUnit: {},
}));

const nav = createMockNavigation();
const route = createMockRoute('ExerciseDetail', {
  exerciseId: 1,
  exerciseName: 'Bench Press',
  muscleGroup: 'Chest',
});

const mockApiStats = {
  // max_set_volume/history[].volume are deliberately NOT equal to
  // reps*weight from the raw sets below (5*260=1300) -- if the screen ever
  // regresses to re-deriving volume client-side instead of using these
  // backend-computed fields (e.g. bodyweight-inclusive for Bodyweight/
  // Weighted equipment), the displayed number would silently fall back to
  // 1300 and this test would catch it.
  personal_bests: { estimated_1rm: 280, max_weight: 245, most_reps: 10, max_set_volume: 1500 },
  totals: { total_sets: 30, total_reps: 120, workout_count: 10, max_volume: 1200 },
  history: [
    { date: '2026-01-01', workout_name: 'Push Day', sets: [{ reps: 5, weight: 260 }], best_1rm: 280, best_set: { reps: 5, weight: 260 }, volume: 1500 },
  ],
};

describe('ExerciseDetailScreen', () => {
  beforeEach(() => {
    mockFetchSequence([
      { data: mockApiStats },
    ]);
  });

  it('renders without crashing', () => {
    render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
  });

  it('displays the exercise name', async () => {
    const { getByText } = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
  });

  it('shows Overview and History tabs', async () => {
    const { getByText } = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => {
      expect(getByText('Overview')).toBeTruthy();
      expect(getByText('History')).toBeTruthy();
    });
  });

  it('shows stats on the default Overview tab', async () => {
    const { getByText } = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/280/)).toBeTruthy());
  });

  it('shows Max Vol / Set from the backend-computed max_set_volume, not a client recomputation', async () => {
    const { getByText } = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText(/1,500|1500/)).toBeTruthy());
  });

  it('dates a history session on its own day, not the day before', async () => {
    // Jest runs west of UTC (jest.globalSetup.js); parsed as UTC, the
    // API's bare '2026-01-01' would render as 12/31/2025 here.
    const { getByText, queryByText } = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('History')).toBeTruthy());
    fireEvent.press(getByText('History'));
    await waitFor(() => expect(getByText(new Date(2026, 0, 1).toLocaleDateString())).toBeTruthy());
    expect(queryByText(new Date(2025, 11, 31).toLocaleDateString())).toBeNull();
  });
});

describe('ExerciseDetailScreen tab underline', () => {
  const sliderX = (r: any) => {
    const { StyleSheet } = require('react-native');
    const style = StyleSheet.flatten(r.getByTestId('tab-slider').props.style);
    return style.transform.find((t: any) => 'translateX' in t).translateX;
  };

  beforeEach(() => {
    mockFetchSequence([{ data: mockApiStats }]);
  });

  it('starts under the first tab by default', async () => {
    const r = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(r.getByText('History')).toBeTruthy());
    expect(sliderX(r)).toBe(0);
  });

  it('starts under the tab the screen opened on, not Overview', async () => {
    const openOnHistory = createMockRoute('ExerciseDetail', { exerciseId: 1, exerciseName: 'Bench Press', initialTab: 'history' });
    const r = render(<ExerciseDetailScreen navigation={nav as any} route={openOnHistory as any} />);
    await waitFor(() => expect(r.getByText('History')).toBeTruthy());
    expect(sliderX(r)).toBeGreaterThan(0);
  });
});

describe('ExerciseDetailScreen editing a custom exercise', () => {
  const customRoute = (params = {}) => createMockRoute('ExerciseDetail', {
    exerciseId: 7, exerciseName: 'My Raise', equipment: 'Dumbbell', muscleGroup: 'Shoulders', isCustom: true, ...params,
  });
  let puts: any[];

  const mockApi = (stats: any, putResponse: { ok: boolean; data: any }) => {
    puts = [];
    (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) => {
      if (init.method === 'PUT') {
        puts.push({ url, body: JSON.parse(init.body) });
        return Promise.resolve({ ok: putResponse.ok, status: putResponse.ok ? 200 : 400, json: () => Promise.resolve(putResponse.data) });
      }
      const data = String(url).includes('/api/stats/exercise?') ? stats : {};
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
    });
  };

  it('hides Edit for a library exercise', async () => {
    mockApi(mockApiStats, { ok: true, data: {} });
    const { getByText, queryByText } = render(<ExerciseDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Overview')).toBeTruthy());
    expect(queryByText('Edit Exercise')).toBeNull();
  });

  it('saves the edit and updates the screen params', async () => {
    const editNav = createMockNavigation();
    mockApi({ history: [] }, {
      ok: true,
      data: { exercise: { id: 7, name: 'Cable Raise', equipment: 'Cable', muscle_group: 'Shoulders', exercise_type: 'strength' } },
    });
    const { getByText, getByDisplayValue } = render(<ExerciseDetailScreen navigation={editNav as any} route={customRoute() as any} />);
    await waitFor(() => expect(getByText('Edit Exercise')).toBeTruthy());
    fireEvent.press(getByText('Edit Exercise'));

    fireEvent.changeText(getByDisplayValue('My Raise'), 'Cable Raise');
    fireEvent.press(getByText('Cable'));
    fireEvent.press(getByText('Save'));

    await waitFor(() => expect(editNav.setParams).toHaveBeenCalledWith(expect.objectContaining({ exerciseName: 'Cable Raise', equipment: 'Cable' })));
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toContain('/api/exercises/7');
    expect(puts[0].body).toEqual({ name: 'Cable Raise', muscle_group: 'Shoulders', equipment: 'Cable', exercise_type: 'strength' });
  });

  it('offers only the current logging type once the exercise has history', async () => {
    mockApi(mockApiStats, { ok: true, data: {} });
    const { getByText, queryByText } = render(<ExerciseDetailScreen navigation={nav as any} route={customRoute() as any} />);
    await waitFor(() => expect(getByText(/280/)).toBeTruthy());
    fireEvent.press(getByText('Edit Exercise'));
    expect(getByText('Reps & Weight')).toBeTruthy();
    expect(queryByText('Timed Hold')).toBeNull();
    expect(queryByText('Distance & Time')).toBeNull();
  });

  it('starts an unlogged exercise on the type it was opened with', async () => {
    mockApi({ history: [] }, { ok: true, data: {} });
    const { getByText } = render(<ExerciseDetailScreen navigation={nav as any} route={customRoute({ exerciseType: 'duration' }) as any} />);
    await waitFor(() => expect(getByText('Edit Exercise')).toBeTruthy());
    fireEvent.press(getByText('Edit Exercise'));
    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].body.exercise_type).toBe('duration');
  });

  it('says why when the server refuses the edit', async () => {
    const { Alert } = require('react-native');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const editNav = createMockNavigation();
    mockApi({ history: [] }, { ok: false, data: { message: 'Exercise Already Exists' } });
    const { getByText } = render(<ExerciseDetailScreen navigation={editNav as any} route={customRoute() as any} />);
    await waitFor(() => expect(getByText('Edit Exercise')).toBeTruthy());
    fireEvent.press(getByText('Edit Exercise'));
    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Save Exercise", 'Exercise Already Exists'));
    expect(editNav.setParams).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
