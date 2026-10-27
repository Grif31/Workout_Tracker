import React from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import polylineLib from '@mapbox/polyline';
import { createMockNavigation, createMockRoute } from './testUtils';
import GPSCardioScreen from '../screens/DashboardTab/GPSCardioScreen';
import { GpsRunProvider } from '../context/GpsRunContext';
import { toLocalDateStr } from '../utils/date';
import { HOLD_MS } from '../components/HoldButton';

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
const mockSyncFinishedWorkout = jest.fn();
jest.mock('../utils/healthSync', () => ({ syncFinishedWorkout: (w: any) => mockSyncFinishedWorkout(w) }));
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
  const r = render(<GpsRunProvider><GPSCardioScreen navigation={nav as any} route={route as any} /></GpsRunProvider>);
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

// Stop asks first: it ends the run for good, so the test confirms
async function pressStop(r: ReturnType<typeof render>) {
  await act(async () => { fireEvent.press(r.getByText('Stop')); });
  const ask = (Alert.alert as jest.Mock).mock.calls.filter(c => c[0] === 'End this activity?').at(-1);
  await act(async () => { ask![2].find((b: any) => b.text === 'End Activity').onPress(); });
}

async function runAndStop(r: ReturnType<typeof render>, points: any[], durationMs = 10 * 60_000) {
  await act(async () => { fireEvent.press(r.getByText('Start')); });
  await waitFor(() => expect(mockGpsListener).not.toBeNull());
  await feed(...points);
  await advance(durationMs);
  await pressStop(r);
  await waitFor(() => expect(r.getByText('Save Activity?')).toBeTruthy());
}

describe('GPSCardioScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers({ now: T0, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    jest.clearAllMocks();
    mockGpsListener = null;
    await AsyncStorage.clear();
    // These tracks stand still between sparse fixes; the clock tests want every
    // second counted, so auto-pause is off unless a test turns it on
    await AsyncStorage.setItem(`gps_auto_pause_${USER_ID}`, 'false');
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
    it("opens the summary with the save's PRs, so they're celebrated", async () => {
      const prs = [{ exercise_name: 'Running', pr_type: 'best_time', value: 4.2, label: '1K' }];
      mockServer({ status: 201, body: { id: 77, new_prs: prs, is_first_workout: true } });
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1), point(2), point(3)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });
      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('WorkoutSummary', {
        workoutId: 77, workoutName: 'Run', prs, totalVolume: 0, totalReps: 0, totalSets: 0,
        muscles: [], isFirstWorkout: true, isBestVolume: false, isBestReps: false,
      }));
    });

    it('posts the route, distance in the display unit, duration and pace', async () => {
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1), point(2), point(3)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('WorkoutSummary', expect.objectContaining({ workoutId: 77 })));
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

    it('tells Health what the activity was, how far, when it happened, and which workout it is', async () => {
      const r = await renderReady();
      await act(async () => { fireEvent.press(r.getByText('Hike')); });
      await runAndStop(r, [point(0), point(1), point(2), point(3)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });
      await waitFor(() => expect(mockSyncFinishedWorkout).toHaveBeenCalled());

      const w = mockSyncFinishedWorkout.mock.calls[0][0];
      expect(w).toMatchObject({ type: 'cardio', activity: 'hiking', workoutId: 77, userId: USER_ID });
      const latLngs: [number, number][] = [0, 1, 2, 3].map(i => [40 + i * 0.001, -74]);
      const km = latLngs.slice(1).reduce((sum, p, i) => sum + haversineKm(latLngs[i], p), 0);
      expect(w.distanceKm).toBeCloseTo(km, 6);
      // The run's own first and last fix, not the save
      expect(w.startDate.getTime()).toBe(point(0).timestamp);
      expect(w.endDate.getTime()).toBe(point(3).timestamp);
    });

    it('tells Health nothing until the save has worked', async () => {
      mockServer({ status: 500 });
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Save Failed', expect.any(String), expect.any(Array)));
      expect(mockSyncFinishedWorkout).not.toHaveBeenCalled();
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
      await pressStop(r);
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
      await pressStop(r);
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

    it("shows a refusal's reason and keeps the run, without offering a queue that would be refused too", async () => {
      mockServer({ status: 400, body: { message: 'Distance must be positive' } });
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1)]);
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Save Activity", 'Distance must be positive'));
      expect(alertSpy.mock.calls.some(c => c[0] === 'Save Failed')).toBe(false);
      expect(mockEnqueueWorkout).not.toHaveBeenCalled();
      expect(nav.replace).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).not.toBeNull();
    });
  });

  describe('stopping', () => {
    it('warns that it ends the activity, and keeps going if asked to', async () => {
      const r = await renderReady();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      await feed(point(0), point(1));

      await act(async () => { fireEvent.press(r.getByText('Stop')); });
      const [title, message, buttons] = alertSpy.mock.calls.find(c => c[0] === 'End this activity?')!;
      expect(title).toBe('End this activity?');
      expect(message).toMatch(/ends the activity/);
      expect(message).toMatch(/Pause/);
      expect(buttons.map((b: any) => b.text)).toEqual(['Keep Going', 'End Activity']);

      // Nothing has stopped yet, and Keep Going leaves it that way
      expect(r.queryByText('Save Activity?')).toBeNull();
      buttons.find((b: any) => b.text === 'Keep Going').onPress?.();
      expect(r.getByText('Pause')).toBeTruthy();
      expect(r.queryByText('Save Activity?')).toBeNull();
      expect(mockGpsListener).not.toBeNull();
    });

    it('goes on to the save sheet once the user confirms', async () => {
      const r = await renderReady();
      await runAndStop(r, [point(0), point(1)]);
      expect(r.getByText('Save Activity?')).toBeTruthy();
    });

    it('warns from a paused run too, but pausing itself asks nothing', async () => {
      const r = await renderReady();
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      await act(async () => { fireEvent.press(r.getByText('Pause')); });
      expect(alertSpy).not.toHaveBeenCalledWith('End this activity?', expect.anything(), expect.anything());

      await act(async () => { fireEvent.press(r.getByText('Stop')); });
      expect(alertSpy).toHaveBeenCalledWith('End this activity?', expect.any(String), expect.any(Array));
    });
  });

  describe('riding', () => {
    // 8 m/s (28.8 km/h, 17.9 mph) by the chip's own reading, a fix every 2 s ~16.7 m apart
    const ridePt = (i: number, speed = 8) => ({
      coords: { latitude: 40 + i * 0.00015, longitude: -74, altitude: 10, accuracy: 5, speed },
      timestamp: T0 + i * 2000,
    });
    async function startRide(r: ReturnType<typeof render>) {
      await act(async () => { fireEvent.press(r.getByText('Cycle')); });
      await act(async () => { fireEvent.press(r.getByText('Start')); });
      await waitFor(() => expect(mockGpsListener).not.toBeNull());
      await feed(...[0, 1, 2, 3, 4, 5].map(i => ridePt(i)));
      await advance(10_000);
    }

    it('leads with the current speed, big, and holds to stop', async () => {
      const r = await renderReady();
      await startRide(r);
      expect(r.getByLabelText('17.9 mph')).toBeTruthy();
      expect(r.getByText('Hold to Stop')).toBeTruthy();
      expect(r.queryByText('Stop')).toBeNull();
      expect(r.getByText('max mph')).toBeTruthy();
    });

    it('takes a tap on Stop for a slip, and a hold as meaning it', async () => {
      const r = await renderReady();
      await startRide(r);
      const stopBtn = r.getByLabelText('Hold to Stop');
      await act(async () => { fireEvent(stopBtn, 'pressIn'); fireEvent(stopBtn, 'pressOut'); });
      expect(r.getByText('Keep holding')).toBeTruthy();
      expect(r.queryByText('Save Activity?')).toBeNull();

      await act(async () => { fireEvent(stopBtn, 'pressIn'); jest.advanceTimersByTime(HOLD_MS + 50); });
      await waitFor(() => expect(r.getByText('Save Activity?')).toBeTruthy());
      // The hold was the confirmation
      expect(alertSpy).not.toHaveBeenCalledWith('End this activity?', expect.anything(), expect.anything());
    });

    it('auto-pauses when the fixes stop, with the moving clock held', async () => {
      await AsyncStorage.removeItem(`gps_auto_pause_${USER_ID}`);
      const r = await renderReady();
      await startRide(r);
      expect(r.queryByText('Auto-paused')).toBeNull();
      // 10 s with no fix: over the 8 s grace at 3 km/h
      await advance(10_000);
      expect(r.getByText('Auto-paused')).toBeTruthy();
      expect(r.getByText('Moving')).toBeTruthy();
      const held = r.getByText(/^0:\d\d$/).props.children;
      await advance(60_000);
      expect(r.getByText(held)).toBeTruthy();
      expect(r.getByText(/^Elapsed /)).toBeTruthy();
    });

    describe('saving with auto-pause on', () => {
      // Fixes stamped with the fake clock, 2 s apart, so stops are measured against the timer
      const fixNow = (i: number, speed: number) => ({
        coords: { latitude: 40 + i * 0.00015, longitude: -74, altitude: 10, accuracy: 5, speed },
        timestamp: Date.now(),
      });
      const rideFor = async (from: number, n: number, speed: number) => {
        for (let k = 0; k < n; k++) {
          await feed(fixNow(from + k, speed));
          await act(async () => { jest.setSystemTime(Date.now() + 2000); });
        }
      };
      const holdStop = async (r: ReturnType<typeof render>) => {
        const stopBtn = r.getByLabelText('Hold to Stop');
        await act(async () => { fireEvent(stopBtn, 'pressIn'); jest.advanceTimersByTime(HOLD_MS + 50); });
        await waitFor(() => expect(r.getByText('Save Activity?')).toBeTruthy());
      };
      const savedBody = async (r: ReturnType<typeof render>) => {
        await act(async () => { fireEvent.press(r.getByText('Save')); });
        await waitFor(() => expect(posts()).toHaveLength(1));
        return JSON.parse(posts()[0][1].body);
      };

      beforeEach(async () => { await AsyncStorage.removeItem(`gps_auto_pause_${USER_ID}`); });

      it('saves the moving time on the set and the time out on the workout, with the top speed', async () => {
        const r = await renderReady();
        await act(async () => { fireEvent.press(r.getByText('Cycle')); });
        await act(async () => { fireEvent.press(r.getByText('Start')); });
        await waitFor(() => expect(mockGpsListener).not.toBeNull());
        await rideFor(0, 6, 8);
        // Five minutes at a light, then the next fix 302 s after the last one ends the stop
        await act(async () => { jest.setSystemTime(Date.now() + 300_000); });
        await rideFor(6, 6, 10);
        await holdStop(r);

        const body = await savedBody(r);
        const [set] = body.exercises[0].sets;
        // 324 s out, 302 of them stopped
        expect(body.duration).toBe(5);
        expect(set.cardio_duration).toBeCloseTo(22 / 60, 5);
        expect(set.max_speed).toBe(36);
        expect(set.intensity).toBeCloseTo(set.cardio_duration / set.distance, 6);
      });

      it('banks a stop that a pause cuts into, once, and counts none of the paused time', async () => {
        const r = await renderReady();
        await act(async () => { fireEvent.press(r.getByText('Cycle')); });
        await act(async () => { fireEvent.press(r.getByText('Start')); });
        await waitFor(() => expect(mockGpsListener).not.toBeNull());
        await rideFor(0, 6, 8);
        await advance(99_000);
        expect(r.getByText('Auto-paused')).toBeTruthy();
        // Paused 102 s after the last fix, at 112 s on the clock
        await act(async () => { fireEvent.press(r.getByText('Pause')); });
        await act(async () => { jest.setSystemTime(Date.now() + 600_000); });
        await act(async () => { fireEvent.press(r.getByText('Resume')); });
        await waitFor(() => expect(mockGpsListener).not.toBeNull());
        await rideFor(6, 6, 10);
        await holdStop(r);

        const body = await savedBody(r);
        const [set] = body.exercises[0].sets;
        // 112 s before the pause and 12 s after it
        expect(body.duration).toBe(2);
        expect(set.cardio_duration).toBeCloseTo(22 / 60, 5);
        expect(set.max_speed).toBe(36);
      });

      describe('after a kill', () => {
        let handlers: ((s: string) => void)[];
        let appStateSpy: jest.SpyInstance;
        let previous: ((...args: any[]) => any) | undefined;
        beforeEach(() => {
          handlers = [];
          appStateSpy = jest.spyOn(AppState, 'addEventListener');
          // react-native's jest setup already mocks this; mockRestore would wipe that for later tests
          previous = appStateSpy.getMockImplementation();
          appStateSpy.mockImplementation(((_t: string, h: (s: string) => void) => {
            handlers.push(h);
            return { remove: () => {} };
          }) as any);
        });
        afterEach(() => {
          if (previous) appStateSpy.mockImplementation(previous);
          else appStateSpy.mockRestore();
        });

        // The checkpoint goes to disk as the app leaves the foreground; the
        // app is then killed and relaunched onto the recovered run
        const killAndRelaunch = async (r: ReturnType<typeof render>) => {
          await act(async () => { handlers.forEach(h => h('background')); });
          const written = (await AsyncStorage.getItem(CHECKPOINT_KEY))!;
          r.unmount();
          await act(async () => { await AsyncStorage.setItem(CHECKPOINT_KEY, written); });
          mockGpsListener = null;
          const relaunched = render(<GpsRunProvider><GPSCardioScreen navigation={nav as any} route={route as any} /></GpsRunProvider>);
          await waitFor(() => expect(relaunched.getByText('Save Activity?')).toBeTruthy());
          return { relaunched, checkpoint: JSON.parse(written) };
        };

        it('keeps the stops and the top speed through the checkpoint', async () => {
          const r = await renderReady();
          await act(async () => { fireEvent.press(r.getByText('Cycle')); });
          await act(async () => { fireEvent.press(r.getByText('Start')); });
          await waitFor(() => expect(mockGpsListener).not.toBeNull());
          await rideFor(0, 6, 8);
          await act(async () => { jest.setSystemTime(Date.now() + 300_000); });
          await rideFor(6, 6, 10);

          const { relaunched, checkpoint } = await killAndRelaunch(r);
          expect(checkpoint).toMatchObject({ elapsedSec: 324, stoppedSec: 302 });
          expect(checkpoint.maxSpeedKmh).toBeCloseTo(36, 5);

          const body = await savedBody(relaunched);
          const [set] = body.exercises[0].sets;
          expect(body.exercises[0].name).toBe('Cycling');
          expect(body.duration).toBe(5);
          expect(set.cardio_duration).toBeCloseTo(22 / 60, 5);
          expect(set.max_speed).toBe(36);
        });

        it('keeps a stop still in progress when the checkpoint is written out of moving time', async () => {
          const r = await renderReady();
          await act(async () => { fireEvent.press(r.getByText('Cycle')); });
          await act(async () => { fireEvent.press(r.getByText('Start')); });
          await waitFor(() => expect(mockGpsListener).not.toBeNull());
          await rideFor(0, 6, 8);
          // Standing still 302 s since the last fix as the phone locks
          await act(async () => { jest.setSystemTime(Date.now() + 300_000); });

          const { relaunched } = await killAndRelaunch(r);
          const body = await savedBody(relaunched);
          // 312 s out, the last 302 of them stopped
          expect(body.exercises[0].sets[0].cardio_duration).toBeCloseTo(10 / 60, 5);
        });
      });
    });

    it('keeps the screen on while riding when Settings asks', async () => {
      const { activateKeepAwakeAsync, deactivateKeepAwake } = require('expo-keep-awake');
      await AsyncStorage.setItem(`gps_keep_screen_on_${USER_ID}`, 'true');
      const r = await renderReady();
      await startRide(r);
      expect(activateKeepAwakeAsync).toHaveBeenCalledWith('gps-map-screen');
      await act(async () => { fireEvent.press(r.getByText('Pause')); });
      expect(deactivateKeepAwake).toHaveBeenCalledWith('gps-map-screen');
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

    it('brings an interrupted run back to the save sheet, with no alert first', async () => {
      await AsyncStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
      const r = render(<GpsRunProvider><GPSCardioScreen navigation={nav as any} route={route as any} /></GpsRunProvider>);

      // Lands on the save sheet, not a paused screen that reads as already saved
      await waitFor(() => expect(r.getByText('Save Activity?')).toBeTruthy());
      expect(alertSpy).not.toHaveBeenCalledWith('Unsaved activity', expect.anything(), expect.anything());
      expect(r.getAllByText('15:00').length).toBeGreaterThan(0);
      expect(r.getByText(`${(3.2 * MI_PER_KM).toFixed(2)} mi`)).toBeTruthy();

      await act(async () => { fireEvent.press(r.getByText('Save')); });
      await waitFor(() => expect(posts()).toHaveLength(1));
      const body = JSON.parse(posts()[0][1].body);
      expect(body.exercises[0].name).toBe('Cycling');
      expect(body.exercises[0].sets[0].cardio_duration).toBeCloseTo(15, 5);
      expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).toBeNull();
    });

    it('asks again before discarding a recovered run', async () => {
      await AsyncStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
      const r = render(<GpsRunProvider><GPSCardioScreen navigation={nav as any} route={route as any} /></GpsRunProvider>);
      await waitFor(() => expect(r.getByText('Save Activity?')).toBeTruthy());

      await act(async () => { fireEvent.press(r.getByText('Discard')); });
      const confirm = alertSpy.mock.calls.find(c => c[0] === 'Discard this activity?')![2];
      await act(async () => { confirm.find((b: any) => b.text === 'Keep It').onPress?.(); });
      expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).not.toBeNull();

      await act(async () => { confirm.find((b: any) => b.text === 'Discard').onPress(); });
      await waitFor(async () => expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).toBeNull());
      await waitFor(() => expect(r.getByText('Start')).toBeTruthy());
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
      expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).not.toBeNull();
      const confirm = alertSpy.mock.calls.find(c => c[0] === 'Discard this activity?')![2];
      await act(async () => { confirm.find((b: any) => b.text === 'Discard').onPress(); });
      await waitFor(async () => expect(await AsyncStorage.getItem(CHECKPOINT_KEY)).toBeNull());
      expect(r.getByText('Start')).toBeTruthy();
    });
  });
});
