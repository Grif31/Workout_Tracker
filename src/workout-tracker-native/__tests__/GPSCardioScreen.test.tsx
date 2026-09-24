import React from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import polylineLib from '@mapbox/polyline';
import { createMockNavigation, createMockRoute } from './testUtils';
import GPSCardioScreen from '../screens/DashboardTab/GPSCardioScreen';
import { toLocalDateStr } from '../utils/date';

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
const mockEnqueueWorkout = jest.fn((_payload: any) => Promise.resolve());
jest.mock('../utils/offlineQueue', () => ({ enqueueWorkout: (p: any) => mockEnqueueWorkout(p) }));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));

const Location = require('expo-location');
const { showToast } = require('../utils/toast');

const USER_ID = 1; // from the AuthContext mock in jest.setup.ts
const CHECKPOINT_KEY = `gps_run_checkpoint_${USER_ID}`;
const MI_PER_KM = 0.621371;
const T0 = new Date('2026-09-17T07:00:00').getTime();

// Points ~111 m apart heading north.
const point = (i: number, extra: Record<string, any> = {}) => ({
  coords: { latitude: 40 + i * 0.001, longitude: -74, altitude: 10, accuracy: 5, ...extra },
  timestamp: T0 + i * 30_000,
});

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b[0] - a[0]) / 2) ** 2
    + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(toRad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const RUNNING_TEMPLATE = { id: 42, name: 'Running', exercise_type: 'cardio', equipment: null };

function mockServer(save: { status: number; body?: any } | Error = { status: 201, body: { id: 77 } }) {
  (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    if (path === '/api/exercises' && !init.method) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([
        { id: 41, name: 'Running', exercise_type: 'cardio', equipment: 'Treadmill' },
        RUNNING_TEMPLATE,
      ]) });
    }
    if (path === '/api/workouts' && init.method === 'POST') {
      if (save instanceof Error) return Promise.reject(save);
      return Promise.resolve({ ok: save.status < 300, status: save.status, json: () => Promise.resolve(save.body ?? {}) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
}

const posts = () => (global.fetch as jest.Mock).mock.calls.filter(([u, i]) => String(u).endsWith('/api/workouts') && i?.method === 'POST');

const nav = createMockNavigation();
const route = createMockRoute('GPSCardio');

async function renderReady() {
  const r = render(<GPSCardioScreen navigation={nav as any} route={route as any} />);
  await act(async () => { await new Promise(res => setImmediate(res)); });
  await waitFor(() => expect(r.getByText('Start')).toBeTruthy());
  return r;
}

const feed = async (...locs: any[]) => {
  for (const loc of locs) {
    await act(async () => { mockGpsListener!(loc); });
  }
};

const advance = async (ms: number) => {
  await act(async () => {
    jest.setSystemTime(Date.now() + ms);
    jest.advanceTimersByTime(1000);
  });
};

async function runAndStop(r: ReturnType<typeof render>, points: any[], durationMs = 10 * 60_000) {
  await act(async () => { fireEvent.press(r.getByText('Start')); });
  await waitFor(() => expect(mockGpsListener).not.toBeNull());
  await feed(...points);
  await advance(durationMs);
  await act(async () => { fireEvent.press(r.getByText('Stop')); });
  await waitFor(() => expect(r.getByText('Save Activity?')).toBeTruthy());
}

describe('GPSCardioScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers({ now: T0, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    jest.clearAllMocks();
    mockGpsListener = null;
    await AsyncStorage.clear();
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockNetInfoFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    mockServer();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  describe('saving a tracked run', () => {
    it('posts the route, distance in the display unit, duration and pace', async () => {
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1), point(2), point(3)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('CardioDetails', { workoutId: 77 }));
      const body = JSON.parse(posts()[0][1].body);
      const [ex] = body.exercises;
      const [set] = ex.sets;

      const latLngs: [number, number][] = [0, 1, 2, 3].map(i => [40 + i * 0.001, -74]);
      const km = latLngs.slice(1).reduce((sum, p, i) => sum + haversineKm(latLngs[i], p), 0);

      expect(body).toMatchObject({ workoutName: 'Run', date: toLocalDateStr(new Date()), duration: 10 });
      // Matched to the outdoor library template (no equipment), for PR tracking.
      expect(ex).toMatchObject({ name: 'Running', exercise_template_id: 42, exercise_type: 'cardio' });
      expect(polylineLib.decode(ex.route_polyline)).toEqual(latLngs);
      expect(set.distance_unit).toBe('mi');
      expect(set.distance).toBeCloseTo(km * MI_PER_KM, 6);
      expect(set.cardio_duration).toBeCloseTo(10, 1);
      // Pace must use the same unit as the saved distance.
      expect(set.intensity).toBeCloseTo(set.cardio_duration / set.distance, 6);
      expect(set).toMatchObject({ reps: null, weight: null, set_type: 'N' });
      expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).toBeNull();
    });

    it('sends the best efforts scanned out of the track', async () => {
      // Six fixes 111 m and 30 s apart: 555 m at 4:30/km, so the run covers
      // the 400m milestone. The backend can only extrapolate from the whole
      // bout; this is the measured window.
      const r = await renderReady();
      await runAndStop(r, [0, 1, 2, 3, 4, 5].map(i => point(i)));
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(posts()).toHaveLength(1));
      const efforts = JSON.parse(posts()[0][1].body).exercises[0].best_efforts;
      const four = efforts.find((e: any) => e.milestone_type === 'distance' && e.distance_km === 0.4);
      expect(four.duration_min).toBeCloseTo(1.8, 1);
      // Nothing longer than the run was covered
      expect(efforts.some((e: any) => e.distance_km === 1.0 && e.milestone_type === 'distance')).toBe(false);
    });

    it('omits best efforts entirely when the run covered no milestone', async () => {
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1), point(2)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(posts()).toHaveLength(1));
      expect(JSON.parse(posts()[0][1].body).exercises[0]).not.toHaveProperty('best_efforts');
    });

    it('leaves paused time out of a scanned effort', async () => {
      // 400 m of running either side of a 20-minute break. Counting the break
      // would make the 400m split read as twenty-odd minutes.
      const r = await renderReady();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      await feed(point(0), point(1), point(2));
      await act(async () => { fireEvent.press(r.getByText('Pause')); });
      await act(async () => { fireEvent.press(r.getByText('Resume')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      // Resumes 40 points away and 20 minutes later; neither gap may count
      await feed(point(40), point(41), point(42), point(43));
      await act(async () => { fireEvent.press(r.getByText('Stop')); });
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(posts()).toHaveLength(1));
      const efforts = JSON.parse(posts()[0][1].body).exercises[0].best_efforts ?? [];
      const four = efforts.find((e: any) => e.milestone_type === 'distance' && e.distance_km === 0.4);
      // Six 30-second legs of actual running, not the 20-minute break
      expect(four.duration_min).toBeLessThan(3);
    });

    it('saves in km when that is the preferred unit', async () => {
      await AsyncStorage.setItem(`gps_distance_unit_${USER_ID}`, 'km');
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(posts()).toHaveLength(1));
      const set = JSON.parse(posts()[0][1].body).exercises[0].sets[0];
      expect(set.distance_unit).toBe('km');
      expect(set.distance).toBeCloseTo(haversineKm([40, -74], [40.001, -74]), 6);
    });

    it('uses the edited activity name and the picked activity type', async () => {
      const r = await renderReady();
      fireEvent.press(r.getByText('Walk'));
      await runAndStop(r, [point(0), point(1)]);
      fireEvent.changeText(r.getByPlaceholderText('Activity name'), 'Evening stroll');
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(posts()).toHaveLength(1));
      const body = JSON.parse(posts()[0][1].body);
      expect(body.workoutName).toBe('Evening stroll');
      expect(body.exercises[0].name).toBe('Walking');
      // No Walking template in the library response, so no PR link.
      expect(body.exercises[0].exercise_template_id).toBeNull();
    });

    it('ignores inaccurate GPS fixes', async () => {
      const r = await renderReady();
      await runAndStop(r, [point(0), point(5, { accuracy: 80 }), point(1)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(posts()).toHaveLength(1));
      const ex = JSON.parse(posts()[0][1].body).exercises[0];
      expect(polylineLib.decode(ex.route_polyline)).toEqual([[40, -74], [40.001, -74]]);
      expect(ex.sets[0].distance).toBeCloseTo(haversineKm([40, -74], [40.001, -74]) * MI_PER_KM, 6);
    });

    it('does not count distance covered while paused', async () => {
      const r = await renderReady();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      await feed(point(0), point(1));
      await act(async () => { fireEvent.press(r.getByText('Pause')); });
      await act(async () => { fireEvent.press(r.getByText('Resume')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      // First fix after resuming is 9 points (~1 km) away: that gap must not count.
      await feed(point(10), point(11));
      await act(async () => { fireEvent.press(r.getByText('Stop')); });
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(posts()).toHaveLength(1));
      const km = JSON.parse(posts()[0][1].body).exercises[0].sets[0].distance / MI_PER_KM;
      const expected = haversineKm([40, -74], [40.001, -74]) + haversineKm([40.01, -74], [40.011, -74]);
      expect(km).toBeCloseTo(expected, 6);
    });

    it('does not start without location permission', async () => {
      const r = await renderReady();
      Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
      await act(async () => { fireEvent.press(r.getByText('Start')); });

      expect(alertSpy).toHaveBeenCalledWith('Permission needed', expect.any(String));
      expect(r.getByText('Start')).toBeTruthy();
      expect(mockGpsListener).toBeNull();
    });
  });

  describe('when the save cannot reach the server', () => {
    it('queues the run offline without posting', async () => {
      mockNetInfoFetch.mockResolvedValue({ isConnected: false, isInternetReachable: false });
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
      expect(posts()).toHaveLength(0);
      expect(mockEnqueueWorkout).toHaveBeenCalledTimes(1);
      expect(mockEnqueueWorkout.mock.calls[0][0]).toMatchObject({ workoutName: 'Run', exercises: [{ name: 'Running' }] });
      expect(showToast).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ title: 'Activity saved offline' }));
      expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).toBeNull();
    });

    it.each([
      ['a server error', { status: 500 }],
      ['a dropped connection', new TypeError('Network request failed')],
    ])('offers to save offline after %s, keeping the checkpoint until chosen', async (_label, save) => {
      mockServer(save as any);
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Save Failed', expect.any(String), expect.any(Array)));
      expect(mockEnqueueWorkout).not.toHaveBeenCalled();
      expect(nav.replace).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).not.toBeNull();

      const buttons = alertSpy.mock.calls.find(c => c[0] === 'Save Failed')![2];
      await act(async () => { buttons.find((b: any) => b.text === 'Save Offline').onPress(); });
      await waitFor(() => expect(mockEnqueueWorkout).toHaveBeenCalledTimes(1));
      expect(nav.goBack).toHaveBeenCalled();
    });
  });

  describe('crash recovery', () => {
    const checkpoint = {
      activity: 'Cycle',
      coords: [
        { latitude: 40, longitude: -74, altitude: 10, timestamp: T0 },
        { latitude: 40.002, longitude: -74, altitude: 12, timestamp: T0 + 60_000 },
      ],
      distanceKm: 3.2,
      elevationGainM: 12,
      elapsedSec: 900,
      savedAt: T0,
    };

    it('offers to restore an interrupted run and resumes it paused', async () => {
      await AsyncStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
      alertSpy.mockImplementation((title: string, _m, buttons?: any[]) => {
        if (title === 'Restore activity?') buttons?.find(b => b.text === 'Restore')?.onPress?.();
      });
      const r = render(<GPSCardioScreen navigation={nav as any} route={route as any} />);

      await waitFor(() => expect(r.getByText('Resume')).toBeTruthy());
      expect(alertSpy.mock.calls[0][1]).toContain('Cycle');
      expect(r.getByText('15:00')).toBeTruthy();
      expect(r.getByText((3.2 * MI_PER_KM).toFixed(2))).toBeTruthy();

      await act(async () => { fireEvent.press(r.getByText('Stop')); });
      await act(async () => { fireEvent.press(r.getByText('Save')); });
      await waitFor(() => expect(posts()).toHaveLength(1));
      const body = JSON.parse(posts()[0][1].body);
      expect(body.exercises[0].name).toBe('Cycling');
      expect(body.exercises[0].sets[0].cardio_duration).toBeCloseTo(15, 5);
    });

    it('discards the checkpoint when the user declines', async () => {
      await AsyncStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
      alertSpy.mockImplementation((title: string, _m, buttons?: any[]) => {
        if (title === 'Restore activity?') buttons?.find(b => b.text === 'Discard')?.onPress?.();
      });
      const r = render(<GPSCardioScreen navigation={nav as any} route={route as any} />);

      await waitFor(async () => expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).toBeNull());
      expect(r.getByText('Start')).toBeTruthy();
    });

    it('silently drops a checkpoint too short to be a route', async () => {
      await AsyncStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ ...checkpoint, coords: [checkpoint.coords[0]] }));
      await renderReady();

      await waitFor(async () => expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).toBeNull());
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('checkpoints the run when stopped, and clears it on discard', async () => {
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1), point(2)]);

      const saved = JSON.parse((await AsyncStorage.getItem(CHECKPOINT_KEY))!);
      expect(saved.coords).toHaveLength(3);
      expect(saved.activity).toBe('Run');

      await act(async () => { fireEvent.press(r.getByText('Discard')); });
      await waitFor(async () => expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).toBeNull());
      expect(r.getByText('Start')).toBeTruthy();
    });
  });
});
