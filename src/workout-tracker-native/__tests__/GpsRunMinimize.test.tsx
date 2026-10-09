import React from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import GPSCardioScreen from '../screens/DashboardTab/GPSCardioScreen';
import { GpsRunProvider } from '../context/GpsRunContext';

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

  it('does not offer a run in progress back as an unsaved activity', async () => {
    const r = await startedRun([0, 1, 2]);
    await act(async () => { fireEvent.press(r.getByText('Pause')); });
    expect(await AsyncStorage.getItem('gps_run_checkpoint_1')).not.toBeNull();

    await leaveScreen(r);
    await reopenScreen(r);
    expect(alertSpy).not.toHaveBeenCalledWith('Unsaved activity', expect.anything(), expect.anything());
  });

  it('still offers a crashed run back on an idle screen', async () => {
    await AsyncStorage.setItem('gps_run_checkpoint_1', JSON.stringify({
      activity: 'Run', coords: [point(0), point(1)].map(p => ({ ...p.coords, timestamp: p.timestamp })),
      distanceKm: 0.11, elevationGainM: 0, elapsedSec: 60, savedAt: T0,
    }));
    const r = render(<Harness show />);
    await settle();
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Unsaved activity', expect.any(String), expect.any(Array)));
    r.unmount();
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
});
