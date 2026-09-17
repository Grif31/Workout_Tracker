import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, waitFor } from '@testing-library/react-native';
import {
  WorkoutSessionProvider, useWorkoutSession, sessionElapsedSeconds, SESSION_KEY, type MinimizedSession,
} from '../context/WorkoutSessionContext';
import { WORKOUT_BACKUP_KEY, TIMER_CHECKPOINT_KEY } from '../components/workout/types';

// jest.setup.ts mocks this context for every screen test; this file tests the real one.
jest.unmock('../context/WorkoutSessionContext');
jest.mock('../utils/notifications', () => ({ cancelLiveWorkoutNotification: jest.fn() }));
const { cancelLiveWorkoutNotification } = require('../utils/notifications');

let ctx: ReturnType<typeof useWorkoutSession>;
function Probe() {
  ctx = useWorkoutSession();
  return <Text>{ctx.session ? `session:${ctx.session.workoutName}` : 'no session'}</Text>;
}
const mount = () => render(<WorkoutSessionProvider><Probe /></WorkoutSessionProvider>);

const NOW = new Date('2026-09-17T10:00:00').getTime();
const backup = {
  workoutName: 'Leg Day',
  notes: 'knees ok',
  exercises: [{ uid: 'a', name: 'Squat', sets: [{ reps: '5', weight: '225', set_type: 'N', done: true }] }],
  selectedDate: '2026-09-17T08:00:00.000Z',
};

describe('WorkoutSessionContext', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('starts with no session when nothing is stored', async () => {
    const { findByText } = mount();
    expect(await findByText('no session')).toBeTruthy();
  });

  it('restores a minimized session with its dates as Date objects', async () => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({
      workoutName: 'Push Day', notes: '', exercises: [],
      selectedDate: '2026-09-17T08:00:00.000Z', startedAt: '2026-09-17T09:00:00.000Z',
      baseElapsed: 120, timerPaused: true,
    }));
    const { findByText } = mount();
    expect(await findByText('session:Push Day')).toBeTruthy();
    expect(ctx.session!.selectedDate).toBeInstanceOf(Date);
    expect(ctx.session!.startedAt.toISOString()).toBe('2026-09-17T09:00:00.000Z');
    expect(ctx.session!.timerPaused).toBe(true);
  });

  it('prefers the minimized session over a leftover crash backup', async () => {
    await AsyncStorage.multiSet([
      [SESSION_KEY, JSON.stringify({ workoutName: 'Minimized', notes: '', exercises: [], selectedDate: 0, startedAt: 0, baseElapsed: 0 })],
      [WORKOUT_BACKUP_KEY, JSON.stringify(backup)],
    ]);
    const { findByText } = mount();
    expect(await findByText('session:Minimized')).toBeTruthy();
  });

  it('recovers a workout that was open when the app was killed', async () => {
    await AsyncStorage.multiSet([
      [WORKOUT_BACKUP_KEY, JSON.stringify(backup)],
      [TIMER_CHECKPOINT_KEY, JSON.stringify({ base: 900, savedAt: NOW, paused: false })],
    ]);
    const { findByText } = mount();
    expect(await findByText('session:Leg Day')).toBeTruthy();

    const s = ctx.session!;
    expect(s.notes).toBe('knees ok');
    expect(s.exercises).toEqual(backup.exercises);
    expect(s.selectedDate.toISOString()).toBe(backup.selectedDate);
    expect(s.baseElapsed).toBe(900);
    expect(s.startedAt.getTime()).toBe(NOW);
    expect(s.timerPaused).toBe(false);
    // Time kept running while the app was dead: 15 minutes at the crash + 10 since.
    expect(sessionElapsedSeconds(s, NOW + 600_000)).toBe(1500);

    await waitFor(async () => expect(await AsyncStorage.getItem(WORKOUT_BACKUP_KEY)).toBeNull());
    expect(await AsyncStorage.getItem(TIMER_CHECKPOINT_KEY)).toBeNull();
    // Persisted as a minimized session so a second crash doesn't lose it.
    const persisted = JSON.parse((await AsyncStorage.getItem(SESSION_KEY))!);
    expect(persisted.workoutName).toBe('Leg Day');
    expect(persisted.baseElapsed).toBe(900);
  });

  it('keeps a paused timer frozen after recovery', async () => {
    await AsyncStorage.multiSet([
      [WORKOUT_BACKUP_KEY, JSON.stringify(backup)],
      [TIMER_CHECKPOINT_KEY, JSON.stringify({ base: 300, savedAt: NOW, paused: true })],
    ]);
    mount();
    await waitFor(() => expect(ctx.session).not.toBeNull());
    expect(ctx.session!.timerPaused).toBe(true);
    expect(sessionElapsedSeconds(ctx.session!, Date.now() + 3_600_000)).toBe(300);
  });

  it('recovers the workout even without a timer checkpoint', async () => {
    await AsyncStorage.setItem(WORKOUT_BACKUP_KEY, JSON.stringify(backup));
    const { findByText } = mount();
    expect(await findByText('session:Leg Day')).toBeTruthy();
    expect(ctx.session!.baseElapsed).toBe(0);
  });

  it('recovers the workout when the timer checkpoint is corrupt', async () => {
    await AsyncStorage.multiSet([
      [WORKOUT_BACKUP_KEY, JSON.stringify(backup)],
      [TIMER_CHECKPOINT_KEY, '{not json'],
    ]);
    const { findByText } = mount();
    expect(await findByText('session:Leg Day')).toBeTruthy();
  });

  it('discards an empty backup instead of resurrecting a blank workout', async () => {
    await AsyncStorage.multiSet([
      [WORKOUT_BACKUP_KEY, JSON.stringify({ workoutName: '', notes: '', exercises: [], selectedDate: backup.selectedDate })],
      [TIMER_CHECKPOINT_KEY, JSON.stringify({ base: 5, savedAt: NOW, paused: false })],
    ]);
    const { findByText } = mount();
    await waitFor(async () => expect(await AsyncStorage.getItem(WORKOUT_BACKUP_KEY)).toBeNull());
    expect(await findByText('no session')).toBeTruthy();
    expect(await AsyncStorage.getItem(TIMER_CHECKPOINT_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('keeps a named workout with no exercises yet', async () => {
    await AsyncStorage.setItem(WORKOUT_BACKUP_KEY, JSON.stringify({ ...backup, exercises: [] }));
    const { findByText } = mount();
    expect(await findByText('session:Leg Day')).toBeTruthy();
  });

  it('does not crash or clear anything on a corrupt backup', async () => {
    await AsyncStorage.setItem(WORKOUT_BACKUP_KEY, '{broken');
    const { findByText } = mount();
    expect(await findByText('no session')).toBeTruthy();
    expect(await AsyncStorage.getItem(WORKOUT_BACKUP_KEY)).toBe('{broken');
  });

  it('saveSession persists and clearSession removes the session and its notification', async () => {
    const { findByText } = mount();
    await findByText('no session');
    const session: MinimizedSession = {
      workoutName: 'Pull Day', notes: '', exercises: [],
      selectedDate: new Date(NOW), startedAt: new Date(NOW), baseElapsed: 60,
    };

    act(() => ctx.saveSession(session));
    expect(await findByText('session:Pull Day')).toBeTruthy();
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(SESSION_KEY))!).workoutName).toBe('Pull Day'));

    act(() => ctx.clearSession());
    expect(await findByText('no session')).toBeTruthy();
    expect(cancelLiveWorkoutNotification).toHaveBeenCalled();
    await waitFor(async () => expect(await AsyncStorage.getItem(SESSION_KEY)).toBeNull());
  });
});

describe('sessionElapsedSeconds', () => {
  it('adds the time since startedAt to a running timer', () => {
    expect(sessionElapsedSeconds({ baseElapsed: 600, startedAt: new Date(NOW) }, NOW + 90_500)).toBe(690);
  });

  it('does not advance a paused timer', () => {
    expect(sessionElapsedSeconds({ baseElapsed: 600, startedAt: new Date(NOW), timerPaused: true }, NOW + 90_000)).toBe(600);
  });
});
