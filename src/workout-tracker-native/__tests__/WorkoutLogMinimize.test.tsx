import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
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
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['Chest'] }), { virtual: true });
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
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });
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
