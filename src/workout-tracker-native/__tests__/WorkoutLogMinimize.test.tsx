import React from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import WorkoutLog from '../components/WorkoutLog';
import { WORKOUT_BACKUP_KEY } from '../components/workout/types';

jest.mock('react-native-gesture-handler', () => {
  const { View, ScrollView } = require('react-native');
  return {
    ScrollView,
    Swipeable: ({ children }: any) => <View>{children}</View>,
    GestureHandlerRootView: ({ children }: any) => children,
    PanGestureHandler: ({ children }: any) => <View>{children}</View>,
  };
});
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../components/ExerciseList', () => () => null);
jest.mock('../components/NewExerciseForm', () => () => null);
jest.mock('../constants/muscleGroups', () => ({ muscleGroups: ['Chest'] }));
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const mockSaveSession = jest.fn();
let mockSession: any = null;
jest.mock('../context/WorkoutSessionContext', () => ({
  ...jest.requireActual('../context/WorkoutSessionContext'),
  useWorkoutSession: () => ({
    session: mockSession,
    saveSession: mockSaveSession,
    clearSession: jest.fn(),
    isWorkoutOpen: true,
    setWorkoutOpen: jest.fn(),
  }),
}));

const { sessionElapsedSeconds } = jest.requireActual('../context/WorkoutSessionContext');

const MIN = 60_000;
// The timer derives elapsed time from Date.now(), so jump the clock and run a
// single tick instead of firing (and re-rendering for) every simulated second.
const advance = (ms: number) => act(() => {
  const tick = Math.min(ms, 1000);
  jest.setSystemTime(Date.now() + ms - tick);
  jest.advanceTimersByTime(tick);
});
// Header has the minimize chevron first; the rest timer panel may render another.
const minimize = (r: ReturnType<typeof render>) => fireEvent.press(r.UNSAFE_getAllByProps({ name: 'chevron-down' })[0]);
const toggleTimer = (r: ReturnType<typeof render>) => fireEvent.press(r.getByText('Duration'));

describe('WorkoutLog minimize and resume timer', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-17T10:00:00') });
    (global.fetch as jest.Mock) = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) }));
    mockSaveSession.mockClear();
    mockSession = null;
  });
  afterEach(() => jest.useRealTimers());

  it('minimizing does not count the elapsed time twice', () => {
    const r = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    advance(10 * MIN);
    expect(r.getByText('10:00')).toBeTruthy();

    minimize(r);
    const saved = mockSaveSession.mock.calls[0][0];
    expect(saved.baseElapsed).toBe(600);
    expect(saved.timerPaused).toBe(false);
    // What the mini bar shows right away, and five minutes later.
    expect(sessionElapsedSeconds(saved, Date.now())).toBe(600);
    expect(sessionElapsedSeconds(saved, Date.now() + 5 * MIN)).toBe(900);
  });

  it('counts only running time across a pause before minimizing', () => {
    const r = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    advance(4 * MIN);
    toggleTimer(r); // pause at 4:00
    advance(6 * MIN);
    toggleTimer(r); // resume
    advance(2 * MIN);

    minimize(r);
    expect(mockSaveSession.mock.calls[0][0].baseElapsed).toBe(360);
  });

  it('keeps a paused timer paused and frozen when minimized', () => {
    const r = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    advance(5 * MIN);
    toggleTimer(r);
    advance(20 * MIN);

    minimize(r);
    const saved = mockSaveSession.mock.calls[0][0];
    expect(saved.timerPaused).toBe(true);
    expect(saved.baseElapsed).toBe(300);
    expect(sessionElapsedSeconds(saved, Date.now() + 60 * MIN)).toBe(300);
  });

  it('resumes a minimized session including the time spent minimized', () => {
    mockSession = {
      workoutName: 'Push Day', notes: '', exercises: [],
      selectedDate: new Date(), startedAt: new Date(Date.now() - 5 * MIN), baseElapsed: 600, timerPaused: false,
    };
    const r = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    advance(1000);
    expect(r.getByText('15:01')).toBeTruthy();
  });

  it('resumes a paused minimized session still paused', () => {
    mockSession = {
      workoutName: 'Push Day', notes: '', exercises: [],
      selectedDate: new Date(), startedAt: new Date(Date.now() - 30 * MIN), baseElapsed: 300, timerPaused: true,
    };
    const r = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    advance(10 * MIN);
    expect(r.queryByText(/^\d+:\d\d$/)).toBeNull(); // paused shows the play icon, not a time

    toggleTimer(r); // resume
    advance(1000);
    expect(r.getByText('5:01')).toBeTruthy();
  });
});

// A save can reach the server and still fail on the phone (a proxy's HTML 502),
// so a retry after a resume must carry the same client_id for the server to
// recognise it (Workout.client_id)
describe('WorkoutLog keeps its client_id across a minimize or a kill', () => {
  const ID = 'abc-1234567890abcdefghij';
  const exercises = [{
    uid: 'e1', name: 'Squat', exercise_template_id: 7, exercise_type: 'strength', equipment: 'Barbell',
    sets: [{ reps: '5', weight: '225', set_type: 'N', done: true }],
  }];
  const postedClientIds = () => (global.fetch as jest.Mock).mock.calls
    .filter(([url, init]) => String(url).endsWith('/api/workouts') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(init.body).client_id);

  let alertSpy: jest.SpyInstance;
  beforeEach(async () => {
    (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) =>
      Promise.resolve(String(url).endsWith('/api/workouts') && init.method === 'POST'
        ? { ok: true, status: 201, json: () => Promise.resolve({ id: 9 }) }
        : { ok: true, status: 200, json: () => Promise.resolve([]) }));
    mockSaveSession.mockClear();
    mockSession = null;
    await AsyncStorage.clear();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('puts the client_id in the minimized session', () => {
    const r = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    minimize(r);
    expect(mockSaveSession.mock.calls[0][0].clientId).toMatch(/^[a-z0-9]+-[a-z0-9]{20}$/);
  });

  it('saves a resumed workout with the client_id it was minimized with', async () => {
    mockSession = {
      workoutName: 'Leg Day', notes: '', exercises,
      selectedDate: new Date(), startedAt: new Date(), baseElapsed: 60, timerPaused: false, clientId: ID,
    };
    const r = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    fireEvent.press(r.getByText('Save'));
    await waitFor(() => expect(postedClientIds()).toEqual([ID]));
  });

  it('saves a workout recovered from the crash backup with its client_id', async () => {
    await AsyncStorage.setItem(WORKOUT_BACKUP_KEY, JSON.stringify({
      workoutName: 'Leg Day', notes: '', exercises, selectedDate: new Date().toISOString(), clientId: ID,
    }));
    const r = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    await waitFor(() => expect(r.getByText('Squat')).toBeTruthy());
    fireEvent.press(r.getByText('Save'));
    await waitFor(() => expect(postedClientIds()).toEqual([ID]));
  });
});
