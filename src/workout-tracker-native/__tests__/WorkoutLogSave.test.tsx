import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import WorkoutLog from '../components/WorkoutLog';

jest.mock('react-native-gesture-handler', () => {
  const { View, ScrollView } = require('react-native');
  return {
    ScrollView,
    Swipeable: ({ children }: any) => <View>{children}</View>,
    GestureHandlerRootView: ({ children }: any) => children,
    PanGestureHandler: ({ children }: any) => <View>{children}</View>,
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return ({ children }: any) => <View>{children}</View>;
});
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../components/ExerciseList', () => () => null);
jest.mock('../components/NewExerciseForm', () => () => null);
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['Chest', 'Back', 'Quads'] }), { virtual: true });
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const mockNetInfoFetch = jest.fn();
let mockNetInfoListener: ((state: any) => void) | null = null;
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: () => mockNetInfoFetch(),
    addEventListener: (cb: any) => { mockNetInfoListener = cb; return () => { mockNetInfoListener = null; }; },
  },
}));
const mockEnqueueWorkout = jest.fn((_payload: any) => Promise.resolve());
jest.mock('../utils/offlineQueue', () => ({ enqueueWorkout: (p: any) => mockEnqueueWorkout(p) }));
const mockClearSession = jest.fn();
jest.mock('../context/WorkoutSessionContext', () => ({
  useWorkoutSession: () => ({
    session: null,
    saveSession: jest.fn(),
    clearSession: mockClearSession,
    isWorkoutOpen: true,
    setWorkoutOpen: jest.fn(),
  }),
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../utils/healthKit', () => ({ syncWorkoutToHealthKit: jest.fn() }));
jest.mock('../utils/healthConnect', () => ({ syncWorkoutToHealthConnect: jest.fn() }));

const { showToast } = require('../utils/toast');

// Late-evening local time: toISOString() would roll this over to the next UTC
// day in US timezones, which is exactly the bug the local date string avoids.
const LATE_EVENING = '2026-03-05T23:30:00';

const prefill = {
  name: 'Push Day',
  notes: 'felt good',
  date: LATE_EVENING,
  exercises: [
    {
      name: 'Bench Press', exercise_template_id: 7, exercise_type: 'strength', equipment: 'Barbell',
      sets: [{ reps: 5, weight: 225, set_type: 'N', rpe: 8 }, { reps: 8, weight: 185, set_type: 'D' }],
    },
    {
      name: 'Push-up', exercise_template_id: 8, exercise_type: 'strength', equipment: 'Bodyweight',
      sets: [{ reps: 20, weight: 45, set_type: 'N' }],
    },
    {
      name: 'Plank', exercise_template_id: 9, exercise_type: 'duration',
      sets: [{ cardio_duration: 1.5, set_type: 'N' }],
    },
    {
      name: 'Rowing', exercise_template_id: 10, exercise_type: 'cardio',
      sets: [{ cardio_duration: 20, distance: 5, distance_unit: 'km', intensity: 7 }],
    },
  ],
};

const SAVE_URL = /\/api\/workouts(\/\d+)?$/;
const isSaveCall = (url: any, init: any) => SAVE_URL.test(String(url)) && ['POST', 'PATCH'].includes(init?.method);

function mockServer(saveResponse: { status: number; body?: any } | Error) {
  (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) => {
    if (isSaveCall(url, init)) {
      if (saveResponse instanceof Error) return Promise.reject(saveResponse);
      const { status, body = {} } = saveResponse;
      return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
  });
}

const saveCalls = () => (global.fetch as jest.Mock).mock.calls.filter(([url, init]) => isSaveCall(url, init));

// Prefilled sets start unchecked, so Save goes through the Unchecked Sets alert.
function answerAlertsWith(buttonText: string) {
  return jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: any[]) => {
    buttons?.find(b => b.text === buttonText)?.onPress?.();
  });
}

describe('WorkoutLog save', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNetInfoListener = null;
    mockNetInfoFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    alertSpy = answerAlertsWith('Check Off & Save');
  });
  afterEach(() => alertSpy.mockRestore());

  it('POSTs a new workout with the stored units and a local date', async () => {
    mockServer({ status: 201, body: { id: 42, new_prs: [{ pr_type: 'max_weight' }], total_volume: 3000, total_sets: 5 } });
    const onSubmit = jest.fn();
    const { getByText } = render(<WorkoutLog prefill={prefill as any} onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const [[url, init]] = saveCalls();
    expect(url).toMatch(/\/api\/workouts$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ workoutName: 'Push Day', notes: 'felt good', date: '2026-03-05' });
    expect(typeof body.duration).toBe('number');

    const [bench, pushup, plank, rowing] = body.exercises;
    expect(bench.order).toBe(0);
    expect(bench.sets).toEqual([
      expect.objectContaining({ reps: 5, weight: 225, set_type: 'N', rpe: 8, order: 0 }),
      expect.objectContaining({ reps: 8, weight: 185, set_type: 'D', rpe: null, order: 1 }),
    ]);
    expect(pushup.sets[0]).toMatchObject({ reps: 20, weight: 0 });
    // Holds are edited in seconds (90) but stored in minutes.
    expect(plank.sets[0]).toMatchObject({ reps: null, weight: null, cardio_duration: 1.5 });
    expect(rowing.sets[0]).toMatchObject({
      reps: null, weight: null, cardio_duration: 20, distance: 5, distance_unit: 'km', intensity: 7,
    });

    expect(mockEnqueueWorkout).not.toHaveBeenCalled();
    expect(mockClearSession).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(42, expect.objectContaining({
      workoutName: 'Push Day', prs: [{ pr_type: 'max_weight' }], totalVolume: 3000, totalSets: 5,
    }));
  });

  it('rounds decimal reps before saving', async () => {
    mockServer({ status: 201, body: { id: 1 } });
    const onSubmit = jest.fn();
    const decimalPrefill = {
      ...prefill,
      exercises: [{ ...prefill.exercises[0], sets: [{ reps: 5.6, weight: 100, set_type: 'N' }] }],
    };
    const { getByText } = render(<WorkoutLog prefill={decimalPrefill as any} onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(JSON.parse(saveCalls()[0][1].body).exercises[0].sets[0].reps).toBe(6);
  });

  it('saves only checked-off sets when "Save Completed Sets" is chosen', async () => {
    alertSpy.mockRestore();
    alertSpy = answerAlertsWith('Save Completed Sets');
    mockServer({ status: 201, body: { id: 1 } });
    const onSubmit = jest.fn();
    const { getByText } = render(<WorkoutLog prefill={prefill as any} onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // Nothing was checked off, so only the cardio exercise (always kept) remains.
    const names = JSON.parse(saveCalls()[0][1].body).exercises.map((e: any) => e.name);
    expect(names).toEqual(['Rowing']);
  });

  it('keeps the session when the server rejects the save', async () => {
    const seen: string[] = [];
    alertSpy.mockImplementation((title: string, msg?: string, buttons?: any[]) => {
      seen.push(`${title}: ${msg}`);
      buttons?.find(b => b.text === 'Check Off & Save')?.onPress?.();
    });
    mockServer({ status: 400, body: { message: 'Invalid set' } });
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = render(<WorkoutLog prefill={prefill as any} onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(seen).toContain("Couldn't Save Workout: Invalid set"));

    expect(mockClearSession).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    await waitFor(() => expect(getByText('Save')).toBeTruthy());
  });

  it('keeps the session without a second alert when the save hits a network error', async () => {
    mockServer(new TypeError('Network request failed'));
    const onSubmit = jest.fn();
    const { getByText } = render(<WorkoutLog prefill={prefill as any} onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    await waitFor(() => expect(getByText('Save')).toBeTruthy());

    expect(alertSpy.mock.calls.map(c => c[0])).toEqual(['Unchecked Sets']);
    expect(mockClearSession).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('queues a new workout offline instead of posting it', async () => {
    mockNetInfoFetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    mockServer({ status: 201, body: { id: 1 } });
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const { getByText } = render(<WorkoutLog prefill={prefill as any} onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());

    expect(saveCalls()).toHaveLength(0);
    expect(mockEnqueueWorkout).toHaveBeenCalledTimes(1);
    const queued = mockEnqueueWorkout.mock.calls[0][0];
    expect(queued).toMatchObject({ workoutName: 'Push Day', date: '2026-03-05' });
    expect(queued.exercises[2].sets[0].cardio_duration).toBe(1.5);
    expect(mockClearSession).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("won't show in your history"),
      expect.objectContaining({ title: 'Workout saved offline', durationMs: expect.any(Number) }),
    );
    expect((showToast as jest.Mock).mock.calls[0][1].durationMs).toBeGreaterThan(3000);
  });

  it('treats a connected-but-unreachable network as offline', async () => {
    mockNetInfoFetch.mockResolvedValue({ isConnected: true, isInternetReachable: false });
    mockServer({ status: 201, body: { id: 1 } });
    const onCancel = jest.fn();
    const { getByText } = render(<WorkoutLog prefill={prefill as any} onSubmit={jest.fn()} onCancel={onCancel} />);

    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(mockEnqueueWorkout).toHaveBeenCalledTimes(1);
    expect(saveCalls()).toHaveLength(0);
  });

  it('PATCHes an edited workout even while offline, without a duration', async () => {
    mockNetInfoFetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    mockServer({ status: 200, body: {} });
    const onSubmit = jest.fn();
    const { getByText } = render(
      <WorkoutLog prefill={prefill as any} editMode workoutId={55} onSubmit={onSubmit} onCancel={jest.fn()} />,
    );

    fireEvent.press(getByText('Update'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const [[url, init]] = saveCalls();
    expect(url).toMatch(/\/api\/workouts\/55$/);
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(body.date).toBe('2026-03-05');
    expect('duration' in body).toBe(false);
    expect(mockNetInfoFetch).not.toHaveBeenCalled();
    expect(mockEnqueueWorkout).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(55, undefined);
  });

  it('saves once when Save is triggered again mid-save', async () => {
    let finishSave: () => void = () => {};
    (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) => {
      if (isSaveCall(url, init)) {
        return new Promise(resolve => {
          finishSave = () => resolve({ ok: true, status: 201, json: () => Promise.resolve({ id: 9 }) });
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
    });
    const onSubmit = jest.fn();
    const { getByText, queryByText } = render(<WorkoutLog prefill={prefill as any} onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(queryByText('Save')).toBeNull();
    // A second confirm from the same alert (double-tap) lands while the first save is in flight.
    alertSpy.mock.calls[0][2].find((b: any) => b.text === 'Check Off & Save').onPress();
    finishSave();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(saveCalls()).toHaveLength(1);
  });

  describe('offline banner while editing', () => {
    const OFFLINE_TEXT = /You're offline\. Your changes are kept here/;

    it('appears when connectivity drops and hides when it returns', async () => {
      mockServer({ status: 200, body: {} });
      const { queryByText } = render(
        <WorkoutLog prefill={prefill as any} editMode workoutId={55} onSubmit={jest.fn()} onCancel={jest.fn()} />,
      );
      expect(queryByText(OFFLINE_TEXT)).toBeNull();

      act(() => mockNetInfoListener!({ isConnected: false, isInternetReachable: false }));
      expect(queryByText(OFFLINE_TEXT)).toBeTruthy();

      act(() => mockNetInfoListener!({ isConnected: true, isInternetReachable: true }));
      expect(queryByText(OFFLINE_TEXT)).toBeNull();
    });

    it('shows when connected to a network with no internet', () => {
      mockServer({ status: 200, body: {} });
      const { queryByText } = render(
        <WorkoutLog prefill={prefill as any} editMode workoutId={55} onSubmit={jest.fn()} onCancel={jest.fn()} />,
      );
      act(() => mockNetInfoListener!({ isConnected: true, isInternetReachable: false }));
      expect(queryByText(OFFLINE_TEXT)).toBeTruthy();
    });

    it('does not appear before reachability is known', () => {
      mockServer({ status: 200, body: {} });
      const { queryByText } = render(
        <WorkoutLog prefill={prefill as any} editMode workoutId={55} onSubmit={jest.fn()} onCancel={jest.fn()} />,
      );
      act(() => mockNetInfoListener!({ isConnected: true, isInternetReachable: null }));
      expect(queryByText(OFFLINE_TEXT)).toBeNull();
    });

    it('is not used for new workouts, which save offline instead', () => {
      mockServer({ status: 201, body: {} });
      render(<WorkoutLog prefill={prefill as any} onSubmit={jest.fn()} onCancel={jest.fn()} />);
      expect(mockNetInfoListener).toBeNull();
    });
  });
});
