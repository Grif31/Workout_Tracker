import React from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import GPSCardioScreen from '../screens/DashboardTab/GPSCardioScreen';
import { GpsRunProvider } from '../context/GpsRunContext';
import MiniRunBar from '../components/MiniRunBar';

// A GPS run lives in GpsRunContext, not in the screen, so leaving the screen
// (minimizing the run) must not stop it. These tests unmount the screen and
// keep the provider, which is what happens when the user navigates away.

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  class MapView extends React.Component<any> {
    animateToRegion() {}
    render() { return <View>{this.props.children}</View>; }
  }
  return { __esModule: true, default: MapView, Polyline: (props: any) => <View {...props} /> };
});
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(() => new Promise(() => {})),
  watchPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3, BestForNavigation: 6 },
}));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(), deactivateKeepAwake: jest.fn() }));

let mockGpsListener: ((loc: any) => void) | null = null;
jest.mock('../utils/gpsTracking', () => ({
  onGpsLocation: (cb: any) => { mockGpsListener = cb; return () => { mockGpsListener = null; }; },
  startBackgroundTracking: jest.fn(() => Promise.resolve('background')),
  stopBackgroundTracking: jest.fn(() => Promise.resolve()),
  cleanupOrphanedTracking: jest.fn(() => Promise.resolve()),
}));
const mockNetInfoFetch = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => mockNetInfoFetch(), addEventListener: () => () => {} },
}));
jest.mock('../utils/offlineQueue', () => ({ enqueueWorkout: jest.fn(() => Promise.resolve()) }));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));

// A lifting workout the user may have minimized; the app allows one session at a time
let mockWorkoutSession: any = null;
jest.mock('../context/WorkoutSessionContext', () => ({
  useWorkoutSession: () => ({ session: mockWorkoutSession, isWorkoutOpen: false }),
}));
const mockNavigate = jest.fn();
jest.mock('../navigation/navigationRef', () => ({
  navigationRef: { isReady: () => true, navigate: (...a: any[]) => mockNavigate(...a) },
}));

// The run's Live Activity, as the provider drives it
const mockStartRunActivity = jest.fn(async (_props: any) => true);
const mockEndRunActivity = jest.fn(async () => {});
jest.mock('../utils/liveActivity', () => ({
  startOrUpdateRunActivity: (p: any) => mockStartRunActivity(p),
  endRunActivity: () => mockEndRunActivity(),
}));

// Mutable so a test can sign in as someone else
let mockUser: any = { id: 1, bodyweight: 185, weight_unit: 'lbs' };
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

const Location = require('expo-location');
const { startBackgroundTracking, stopBackgroundTracking, cleanupOrphanedTracking } = require('../utils/gpsTracking');

const T0 = new Date('2026-09-17T07:00:00').getTime();
// Points ~111 m apart heading north
const point = (i: number) => ({
  coords: { latitude: 40 + i * 0.001, longitude: -74, altitude: 10, accuracy: 5 },
  timestamp: T0 + i * 30_000,
});

const nav = createMockNavigation();
const route = createMockRoute('GPSCardio');
const Harness = ({ show }: { show: boolean }) => (
  <GpsRunProvider>{show ? <GPSCardioScreen navigation={nav as any} route={route as any} /> : null}</GpsRunProvider>
);

const settle = () => act(async () => { await new Promise(res => setImmediate(res)); });
const feed = async (...locs: any[]) => {
  for (const loc of locs) await act(async () => { mockGpsListener!(loc); });
};

async function startedRun(points: number[]) {
  const r = render(<Harness show />);
  await settle();
  await waitFor(() => expect(r.getByText('Start')).toBeTruthy());
  await act(async () => { fireEvent.press(r.getByText('Start')); });
  await waitFor(() => expect(mockGpsListener).not.toBeNull());
  await feed(...points.map(point));
  return r;
}

const leaveScreen = async (r: ReturnType<typeof render>) => { r.rerender(<Harness show={false} />); await settle(); };
const reopenScreen = async (r: ReturnType<typeof render>) => { r.rerender(<Harness show />); await settle(); };

describe('minimizing a GPS run', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers({ now: T0, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    jest.clearAllMocks();
    mockGpsListener = null;
    mockUser = { id: 1, bodyweight: 185, weight_unit: 'lbs' };
    mockWorkoutSession = null;
    await AsyncStorage.clear();
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockNetInfoFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, '');
      if (path === '/api/workouts' && init.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ id: 77 }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
    });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  it('keeps tracking when the screen is left, and keeps counting what arrives meanwhile', async () => {
    const r = await startedRun([0, 1]);
    await leaveScreen(r);

    expect(stopBackgroundTracking).not.toHaveBeenCalled();
    expect(mockGpsListener).not.toBeNull();
    // A fix while no screen is mounted still counts
    await feed(point(2));

    await reopenScreen(r);
    expect(r.getByText('Pause')).toBeTruthy();
    // Two legs of about 111 m is 0.222 km, 0.14 mi
    expect(r.getByText('0.14')).toBeTruthy();
  });

  it('keeps the clock running while the screen is away', async () => {
    const r = await startedRun([0, 1]);
    await leaveScreen(r);
    await act(async () => { jest.setSystemTime(Date.now() + 5 * 60_000); });
    await reopenScreen(r);
    expect(r.getByText('5:00')).toBeTruthy();
  });

  it('keeps a paused run paused, at the time it was paused', async () => {
    const r = await startedRun([0, 1]);
    await act(async () => { jest.setSystemTime(Date.now() + 90_000); });
    await act(async () => { fireEvent.press(r.getByText('Pause')); });
    await leaveScreen(r);
    await act(async () => { jest.setSystemTime(Date.now() + 10 * 60_000); });
    await reopenScreen(r);

    expect(r.getByText('Resume')).toBeTruthy();
    expect(r.getByText('1:30')).toBeTruthy();
  });

  it('stops orphaned tracking once per launch, not each time the screen opens', async () => {
    const r = await startedRun([0, 1]);
    await leaveScreen(r);
    await reopenScreen(r);
    await leaveScreen(r);
    await reopenScreen(r);
    // A screen doing this would stop the run it is reopened on
    expect(cleanupOrphanedTracking).toHaveBeenCalledTimes(1);
    expect(stopBackgroundTracking).not.toHaveBeenCalled();
  });

  it('resumes into a live run after being away, counting no distance across the pause', async () => {
    const r = await startedRun([0, 1]);
    await act(async () => { fireEvent.press(r.getByText('Pause')); });
    await leaveScreen(r);
    await reopenScreen(r);
    await act(async () => { fireEvent.press(r.getByText('Resume')); });
    await waitFor(() => expect(mockGpsListener).not.toBeNull());
    expect(startBackgroundTracking).toHaveBeenCalledTimes(2);
    // First fix after the resume is far away: it must not add the gap
    await feed({ ...point(50), timestamp: T0 + 600_000 });
    expect(r.getByText('0.07')).toBeTruthy();
  });

  it('forgets a saved run, so the next visit starts from Start', async () => {
    const r = await startedRun([0, 1, 2, 3]);
    await act(async () => { fireEvent.press(r.getByText('Stop')); });
    await act(async () => {
      alertSpy.mock.calls.filter(c => c[0] === 'End this activity?').at(-1)![2].find((b: any) => b.text === 'End Activity').onPress();
    });
    await waitFor(() => expect(r.getByText('Save Activity?')).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByText('Save')); });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('CardioDetails', { workoutId: 77 }));

    expect(await AsyncStorage.getItem('gps_run_checkpoint_1')).toBeNull();
    await leaveScreen(r);
    await reopenScreen(r);
    expect(r.getByText('Start')).toBeTruthy();
  });

  it('stops the run for an account that signs out, keeping it as that account\'s checkpoint', async () => {
    const r = await startedRun([0, 1, 2]);
    mockUser = { id: 2, bodyweight: 150, weight_unit: 'kg' };
    r.rerender(<Harness show />);
    await settle();

    expect(stopBackgroundTracking).toHaveBeenCalled();
    const kept = JSON.parse((await AsyncStorage.getItem('gps_run_checkpoint_1'))!);
    expect(kept.coords).toHaveLength(3);
    // The new account sees no run
    expect(await AsyncStorage.getItem('gps_run_checkpoint_2')).toBeNull();
    expect(r.getByText('Start')).toBeTruthy();
  });

  it('stops the run when nobody is signed in', async () => {
    const r = await startedRun([0, 1]);
    mockUser = null;
    r.rerender(<Harness show />);
    await settle();
    expect(stopBackgroundTracking).toHaveBeenCalled();
    expect(r.getByText('Start')).toBeTruthy();
  });

  describe('one active session at a time', () => {
    it('does not start a run while a workout is minimized', async () => {
      mockWorkoutSession = { workoutName: 'Push', exercises: [] };
      const r = render(<Harness show />);
      await settle();
      await waitFor(() => expect(r.getByText('Start')).toBeTruthy());
      // The screen asks for permission itself when it opens, to centre the map
      const promptsBefore = Location.requestForegroundPermissionsAsync.mock.calls.length;
      await act(async () => { fireEvent.press(r.getByText('Start')); });

      expect(alertSpy).toHaveBeenCalledWith('Workout in progress', expect.any(String), expect.any(Array));
      // Starting didn't even ask for permission: nothing starts
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(promptsBefore);
      expect(startBackgroundTracking).not.toHaveBeenCalled();
      expect(r.getByText('Start')).toBeTruthy();
    });

    it('offers to go to the workout, leaving this screen first', async () => {
      mockWorkoutSession = { workoutName: 'Push', exercises: [] };
      const r = render(<Harness show />);
      await settle();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      const goTo = alertSpy.mock.calls.find(c => c[0] === 'Workout in progress')![2].find((b: any) => b.text === 'Go to Workout');
      goTo.onPress();
      expect(nav.goBack).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('DashboardTab', { screen: 'WorkoutLog', params: {}, initial: false });
    });

    it('starts once the workout is gone', async () => {
      mockWorkoutSession = { workoutName: 'Push', exercises: [] };
      const r = render(<Harness show />);
      await settle();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      mockWorkoutSession = null;
      r.rerender(<Harness show />);
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(r.getByText('Pause')).toBeTruthy());
    });
  });

  describe('after the app is killed', () => {
    const cp = (over: any = {}) => JSON.stringify({
      activity: 'Cycle',
      coords: [0, 1, 2].map(i => ({ ...point(i).coords, timestamp: point(i).timestamp })),
      distanceKm: 0.22, elevationGainM: 0, elapsedSec: 90, savedAt: T0, ...over,
    });
    const BarHarness = ({ show }: { show: boolean }) => (
      <GpsRunProvider>
        <MiniRunBar />
        {show ? <GPSCardioScreen navigation={nav as any} route={route as any} /> : null}
      </GpsRunProvider>
    );

    it('brings the run back on the mini bar, to review and not resume', async () => {
      await AsyncStorage.setItem('gps_run_checkpoint_1', cp());
      const r = render(<BarHarness show={false} />);
      await settle();

      await waitFor(() => expect(r.getByText('Unsaved Cycle')).toBeTruthy());
      expect(r.getByText('Review')).toBeTruthy();
      expect(r.queryByText('Resume')).toBeNull();
      // No GPS: the killed app's tracking is gone, and nothing restarts it
      expect(startBackgroundTracking).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('opens the save sheet when the bar is followed to the screen', async () => {
      await AsyncStorage.setItem('gps_run_checkpoint_1', cp());
      const r = render(<BarHarness show={false} />);
      await settle();
      await waitFor(() => expect(r.getByText('Unsaved Cycle')).toBeTruthy());

      r.rerender(<BarHarness show />);
      await settle();
      await waitFor(() => expect(r.getByText('Save Activity?')).toBeTruthy());
      expect(r.queryByText('Unsaved Cycle')).toBeNull();
    });

    it('keeps it on the bar until it is saved or discarded', async () => {
      await AsyncStorage.setItem('gps_run_checkpoint_1', cp());
      const r = render(<BarHarness show={false} />);
      await settle();
      await waitFor(() => expect(r.getByText('Unsaved Cycle')).toBeTruthy());
      expect(await AsyncStorage.getItem('gps_run_checkpoint_1')).not.toBeNull();

      await act(async () => { fireEvent.press(r.getByLabelText('Discard activity')); });
      await act(async () => { alertSpy.mock.calls.at(-1)![2].find((b: any) => b.text === 'Discard').onPress(); });
      expect(r.queryByText('Unsaved Cycle')).toBeNull();
      expect(await AsyncStorage.getItem('gps_run_checkpoint_1')).toBeNull();
    });

    it('drops a checkpoint too short to be a route, quietly', async () => {
      await AsyncStorage.setItem('gps_run_checkpoint_1', cp({ coords: [{ ...point(0).coords, timestamp: T0 }] }));
      const r = render(<BarHarness show={false} />);
      await settle();
      await waitFor(async () => expect(await AsyncStorage.getItem('gps_run_checkpoint_1')).toBeNull());
      expect(r.queryByText(/Unsaved/)).toBeNull();
    });

    it("does not restore another account's run", async () => {
      await AsyncStorage.setItem('gps_run_checkpoint_2', cp());
      const r = render(<BarHarness show={false} />);
      await settle();
      expect(r.queryByText(/Unsaved/)).toBeNull();
      expect(await AsyncStorage.getItem('gps_run_checkpoint_2')).not.toBeNull();
    });

    it('brings it back for an account that signs in later', async () => {
      mockUser = null;
      await AsyncStorage.setItem('gps_run_checkpoint_1', cp());
      const r = render(<BarHarness show={false} />);
      await settle();
      expect(r.queryByText(/Unsaved/)).toBeNull();

      mockUser = { id: 1, bodyweight: 185, weight_unit: 'lbs' };
      r.rerender(<BarHarness show={false} />);
      await settle();
      await waitFor(() => expect(r.getByText('Unsaved Cycle')).toBeTruthy());
    });
  });

  describe('the mini bar', () => {
    const BarHarness = ({ show }: { show: boolean }) => (
      <GpsRunProvider>
        <MiniRunBar />
        {show ? <GPSCardioScreen navigation={nav as any} route={route as any} /> : null}
      </GpsRunProvider>
    );

    it('stands in for the screen: hidden while it is open, there once it is left', async () => {
      const r = render(<BarHarness show />);
      await settle();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      await feed(point(0), point(1));
      expect(r.queryByLabelText('Discard activity')).toBeNull();

      r.rerender(<BarHarness show={false} />);
      await settle();
      expect(r.getByLabelText('Discard activity')).toBeTruthy();
      expect(r.getByText('0.07 mi · 0:00')).toBeTruthy();

      r.rerender(<BarHarness show />);
      await settle();
      expect(r.queryByLabelText('Discard activity')).toBeNull();
    });

    it('hands over to the bar the moment Back is pressed, not once the map has slid away', async () => {
      const r = render(<BarHarness show />);
      await settle();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      await feed(point(0), point(1));
      expect(r.queryByLabelText('Discard activity')).toBeNull();

      // The screen is still mounted, as it is while it slides out
      await act(async () => { fireEvent.press(r.getByLabelText('Minimize')); });
      expect(nav.goBack).toHaveBeenCalled();
      expect(r.getByLabelText('Discard activity')).toBeTruthy();
    });

    it('discarding from the bar stops the run, and the next visit starts clean', async () => {
      const r = render(<BarHarness show />);
      await settle();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      await feed(point(0), point(1), point(2));
      r.rerender(<BarHarness show={false} />);
      await settle();

      await act(async () => { fireEvent.press(r.getByLabelText('Discard activity')); });
      await act(async () => { alertSpy.mock.calls.at(-1)![2].find((b: any) => b.text === 'Discard').onPress(); });

      expect(stopBackgroundTracking).toHaveBeenCalled();
      expect(mockGpsListener).toBeNull();
      expect(r.queryByLabelText('Discard activity')).toBeNull();
      expect(await AsyncStorage.getItem('gps_run_checkpoint_1')).toBeNull();
      r.rerender(<BarHarness show />);
      await settle();
      expect(r.getByText('Start')).toBeTruthy();
    });

    it('resumes the run from the bar without losing what was recorded', async () => {
      const r = render(<BarHarness show />);
      await settle();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      await feed(point(0), point(1));
      r.rerender(<BarHarness show={false} />);
      await settle();

      await act(async () => { fireEvent.press(r.getByText('Open')); });
      expect(mockNavigate).toHaveBeenCalledWith('DashboardTab', { screen: 'GPSCardio', initial: false });
      r.rerender(<BarHarness show />);
      await settle();
      expect(r.getByText('Pause')).toBeTruthy();
      expect(r.getByText('0.07')).toBeTruthy();
    });
  });

  describe('the Live Activity', () => {
    const pushes = () => mockStartRunActivity.mock.calls.map(c => c[0]);
    // advanceTimersByTime moves Date.now too: setting the system time as well would count it twice
    const tick = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

    it('goes on the lock screen when the run starts, in the unit the map uses', async () => {
      await AsyncStorage.setItem('gps_distance_unit_1', 'km');
      const r = await startedRun([0, 1]);
      await waitFor(() => expect(mockStartRunActivity).toHaveBeenCalled());
      expect(pushes()[0]).toMatchObject({ activity: 'Run', icon: 'figure.run', unit: 'km', accent: '#30D158' });
      expect(pushes()[0]).not.toHaveProperty('pausedAt');
      r.unmount();
    });

    it('stays off the lock screen when Live Workout on Lock Screen is off', async () => {
      await AsyncStorage.setItem('live_workout_notif_enabled', 'false');
      const r = await startedRun([0, 1, 2]);
      await tick(6000);
      expect(mockStartRunActivity).not.toHaveBeenCalled();
      r.unmount();
    });

    it('sends distance at most every 5 seconds, not on every fix, and the last change still arrives', async () => {
      const r = await startedRun([]);
      await waitFor(() => expect(mockStartRunActivity).toHaveBeenCalledTimes(1));
      // A fix a second for 12 seconds
      for (let i = 0; i < 12; i += 1) {
        await feed(point(i));
        await tick(1000);
      }
      const during = mockStartRunActivity.mock.calls.length;
      expect(during).toBeGreaterThanOrEqual(2);
      expect(during).toBeLessThanOrEqual(4);

      // Quiet now: the trailing push brings the lock screen up to the last fix
      await tick(5000);
      const last = pushes().at(-1);
      expect(r.getByText(`${last.distance}`)).toBeTruthy();
      r.unmount();
    });

    it('changes at once on pause and on resume, with the clock frozen and then running', async () => {
      const r = await startedRun([0, 1]);
      await waitFor(() => expect(mockStartRunActivity).toHaveBeenCalled());
      mockStartRunActivity.mockClear();

      await act(async () => { fireEvent.press(r.getByText('Pause')); });
      expect(pushes().at(-1)).toHaveProperty('pausedAt');
      expect(pushes().at(-1).activity).toBe('Run');

      mockStartRunActivity.mockClear();
      await act(async () => { fireEvent.press(r.getByText('Resume')); });
      await waitFor(() => expect(mockStartRunActivity).toHaveBeenCalled());
      expect(pushes().at(-1)).not.toHaveProperty('pausedAt');
      r.unmount();
    });

    it('ends when the run is discarded', async () => {
      const r = render(<BarHarnessForActivity show />);
      await settle();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(mockStartRunActivity).toHaveBeenCalled());
      mockEndRunActivity.mockClear();
      r.rerender(<BarHarnessForActivity show={false} />);
      await settle();
      await act(async () => { fireEvent.press(r.getByLabelText('Discard activity')); });
      await act(async () => { alertSpy.mock.calls.at(-1)![2].find((b: any) => b.text === 'Discard').onPress(); });
      expect(mockEndRunActivity).toHaveBeenCalled();
      r.unmount();
    });

    it('ends when the run is saved', async () => {
      const r = await startedRun([0, 1, 2]);
      mockEndRunActivity.mockClear();
      await act(async () => { fireEvent.press(r.getByText('Stop')); });
      await act(async () => {
        alertSpy.mock.calls.filter(c => c[0] === 'End this activity?').at(-1)![2].find((b: any) => b.text === 'End Activity').onPress();
      });
      await act(async () => { fireEvent.press(r.getByText('Save')); });
      await waitFor(() => expect(nav.replace).toHaveBeenCalled());
      expect(mockEndRunActivity).toHaveBeenCalled();
    });

    it('ends one a killed app left behind, and puts no activity up for the run that comes back', async () => {
      await AsyncStorage.setItem('gps_run_checkpoint_1', JSON.stringify({
        activity: 'Run', coords: [0, 1, 2].map(i => ({ ...point(i).coords, timestamp: point(i).timestamp })),
        distanceKm: 0.22, elevationGainM: 0, elapsedSec: 90, savedAt: T0,
      }));
      const r = render(<BarHarnessForActivity show={false} />);
      await settle();
      await waitFor(() => expect(r.getByText('Unsaved Run')).toBeTruthy());
      expect(mockEndRunActivity).toHaveBeenCalled();
      await tick(6000);
      expect(mockStartRunActivity).not.toHaveBeenCalled();
      r.unmount();
    });

    it('ends when the account signs out mid-run', async () => {
      const r = await startedRun([0, 1]);
      mockEndRunActivity.mockClear();
      mockUser = null;
      r.rerender(<Harness show />);
      await settle();
      expect(mockEndRunActivity).toHaveBeenCalled();
      r.unmount();
    });
  });

  // Section 22: iOS can end an app for what it does in the background, so with
  // the phone locked on the map the screen does nothing visible, while the run
  // itself keeps recording in the provider
  describe('with the phone locked on the map', () => {
    let appStateHandlers: ((s: string) => void)[] = [];
    let appStateSpy: jest.SpyInstance;
    beforeEach(() => {
      appStateHandlers = [];
      appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, h: (s: string) => void) => {
        appStateHandlers.push(h);
        return { remove: () => { appStateHandlers = appStateHandlers.filter(x => x !== h); } };
      }) as any);
    });
    afterEach(() => appStateSpy.mockRestore());

    const setAppState = (state: string) => act(async () => { appStateHandlers.forEach(h => h(state)); });
    const routeOnMap = (r: ReturnType<typeof render>) => r.UNSAFE_getAllByProps({ strokeWidth: 4 })[0].props.coordinates as unknown[];

    it('stops moving the map and redrawing the route, then catches up when the app is back', async () => {
      const animate = jest.spyOn(require('react-native-maps').default.prototype, 'animateToRegion');
      const r = await startedRun([0, 1]);
      expect(routeOnMap(r)).toHaveLength(2);

      await setAppState('background');
      animate.mockClear();
      await feed(point(2), point(3));
      expect(animate).not.toHaveBeenCalled();
      // The same line as before the lock: the native overlay isn't rebuilt
      expect(routeOnMap(r)).toHaveLength(2);

      await setAppState('active');
      expect(routeOnMap(r)).toHaveLength(4);
      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.calls[0][0]).toMatchObject({ latitude: point(3).coords.latitude });
      animate.mockRestore();
    });

    it('keeps recording while locked: nothing that arrived is lost', async () => {
      const r = await startedRun([0, 1]);
      await setAppState('background');
      await feed(point(2), point(3));
      await setAppState('active');
      // Three legs of about 111 m is 0.333 km, 0.21 mi
      expect(r.getByText('0.21')).toBeTruthy();
    });

    it('stops the clock re-rendering while locked, and shows the right time on return', async () => {
      const r = await startedRun([0, 1]);
      await setAppState('background');
      // advanceTimersByTime moves Date.now too
      await act(async () => { jest.advanceTimersByTime(10_000); });
      expect(r.queryByText('0:10')).toBeNull();

      await setAppState('active');
      expect(r.getByText('0:10')).toBeTruthy();
    });

    it('stops showing and following the location while locked', async () => {
      const r = await startedRun([0, 1]);
      const mapProps = () => r.UNSAFE_getByType(require('react-native-maps').default).props;
      expect(mapProps()).toMatchObject({ showsUserLocation: true, followsUserLocation: true });
      await setAppState('background');
      expect(mapProps()).toMatchObject({ showsUserLocation: false, followsUserLocation: false });
      await setAppState('active');
      expect(mapProps()).toMatchObject({ showsUserLocation: true, followsUserLocation: true });
    });
  });
});


const BarHarnessForActivity = ({ show }: { show: boolean }) => (
  <GpsRunProvider>
    <MiniRunBar />
    {show ? <GPSCardioScreen navigation={nav as any} route={route as any} /> : null}
  </GpsRunProvider>
);
