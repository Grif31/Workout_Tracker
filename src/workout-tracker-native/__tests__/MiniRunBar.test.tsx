import React from 'react';
import { Alert, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';
import MiniRunBar from '../components/MiniRunBar';
import { emptyRun } from '../utils/gpsRun';

const mockNavigate = jest.fn();
jest.mock('../navigation/navigationRef', () => ({
  navigationRef: { isReady: () => true, navigate: (...a: any[]) => mockNavigate(...a) },
}));

const mockClearRun = jest.fn();
let mockGps: any;
jest.mock('../context/GpsRunContext', () => ({ useGpsRun: () => mockGps }));

const T0 = new Date('2026-09-17T07:00:00').getTime();
const gps = (over: any = {}) => ({
  trackingState: 'running',
  activity: 'Run',
  run: { ...emptyRun(), distanceKm: 0.5 },
  timing: { base: 300, segmentStart: null },
  clearRun: mockClearRun,
  screenOpen: false,
  recovered: false,
  ...over,
});

describe('MiniRunBar', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useFakeTimers({ now: T0, doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockGps = gps();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  const renderBar = async () => {
    const r = render(<MiniRunBar />);
    await act(async () => { await new Promise(res => setImmediate(res)); });
    return r;
  };

  it('shows nothing when there is no run', async () => {
    mockGps = gps({ trackingState: 'idle' });
    const r = await renderBar();
    expect(r.toJSON()).toBeNull();
  });

  it('shows nothing while the map screen is open', async () => {
    mockGps = gps({ screenOpen: true });
    expect((await renderBar()).toJSON()).toBeNull();
  });

  it('shows the activity, distance and time of a run in progress', async () => {
    const r = await renderBar();
    expect(r.getByText('Run')).toBeTruthy();
    // 0.5 km is 0.31 mi, in the default unit
    expect(r.getByText('0.31 mi · 5:00')).toBeTruthy();
  });

  it('shows distance in the preferred unit', async () => {
    await AsyncStorage.setItem('gps_distance_unit_1', 'km');
    const r = await renderBar();
    expect(r.getByText('0.50 km · 5:00')).toBeTruthy();
  });

  it('says so when the run is paused, and its time holds', async () => {
    mockGps = gps({ trackingState: 'paused' });
    const r = await renderBar();
    expect(r.getByText('Run paused')).toBeTruthy();
    await act(async () => { jest.setSystemTime(Date.now() + 60_000); jest.advanceTimersByTime(5000); });
    expect(r.getByText('0.31 mi · 5:00')).toBeTruthy();
  });

  it('counts the time up while running', async () => {
    mockGps = gps({ timing: { base: 0, segmentStart: T0 } });
    const r = await renderBar();
    expect(r.getByText('0.31 mi · 0:00')).toBeTruthy();
    await act(async () => { jest.setSystemTime(T0 + 2000); jest.advanceTimersByTime(1000); });
    expect(r.getByText('0.31 mi · 0:03')).toBeTruthy();
  });

  it('calls a run that came back after the app was killed unsaved, to review and not resume', async () => {
    mockGps = gps({ trackingState: 'paused', recovered: true });
    const r = await renderBar();
    expect(r.getByText('Unsaved Run')).toBeTruthy();
    expect(r.getByText('Review')).toBeTruthy();
    expect(r.queryByText('Resume')).toBeNull();
    fireEvent.press(r.getByText('Review'));
    expect(mockNavigate).toHaveBeenCalledWith('DashboardTab', { screen: 'GPSCardio', initial: false });
  });

  it('slides up when it appears, like the workout bar, and again when it comes back', async () => {
    // Native-driven, so the spring itself is what can be observed
    const spring = jest.spyOn(Animated, 'spring');
    const r = await renderBar();
    expect(spring).toHaveBeenCalledTimes(1);
    expect(spring.mock.calls[0][1]).toMatchObject({ toValue: 1, useNativeDriver: true });

    // Ticking and re-rendering while it is up doesn't replay it
    await act(async () => { jest.setSystemTime(Date.now() + 3000); jest.advanceTimersByTime(3000); });
    r.rerender(<MiniRunBar />);
    expect(spring).toHaveBeenCalledTimes(1);

    // The map screen opens (bar gone), then the run is minimized again
    mockGps = gps({ screenOpen: true });
    r.rerender(<MiniRunBar />);
    expect(r.toJSON()).toBeNull();
    expect(spring).toHaveBeenCalledTimes(1);
    mockGps = gps({ screenOpen: false });
    r.rerender(<MiniRunBar />);
    expect(spring).toHaveBeenCalledTimes(2);
    spring.mockRestore();
  });

  it('names the activity, so a ride reads as a ride', async () => {
    mockGps = gps({ activity: 'Cycle' });
    expect((await renderBar()).getByText('Cycle')).toBeTruthy();
  });

  it('goes back to the map on Resume, without stranding the stack', async () => {
    const r = await renderBar();
    fireEvent.press(r.getByText('Resume'));
    expect(mockNavigate).toHaveBeenCalledWith('DashboardTab', { screen: 'GPSCardio', initial: false });
  });

  it('asks before discarding, and only discards on confirmation', async () => {
    const r = await renderBar();
    fireEvent.press(r.getByLabelText('Discard activity'));
    expect(alertSpy).toHaveBeenCalledWith('Discard this activity?', expect.stringContaining("can't be recovered"), expect.any(Array));
    expect(mockClearRun).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2];
    buttons.find((b: any) => b.text === 'Keep It').onPress?.();
    expect(mockClearRun).not.toHaveBeenCalled();
    buttons.find((b: any) => b.text === 'Discard').onPress();
    expect(mockClearRun).toHaveBeenCalledTimes(1);
  });
});
