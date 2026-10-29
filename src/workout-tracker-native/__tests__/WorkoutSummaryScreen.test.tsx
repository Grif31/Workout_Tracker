import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation } from './testUtils';
import WorkoutSummaryScreen from '../screens/DashboardTab/WorkoutSummaryScreen';

let mockWeightUnit = 'lbs';
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 't', weight_unit: mockWeightUnit } }),
}));
jest.mock('react-native-confetti-cannon', () => () => null);
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('../utils/shareCapture', () => ({ captureAndShare: jest.fn() }));
jest.mock('../components/MuscleDiagram', () => () => null);
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  class MapView extends React.Component<any> {
    render() { return <View>{this.props.children}</View>; }
  }
  return { __esModule: true, default: MapView, Polyline: (props: any) => <View {...props} /> };
});
jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22 } } }), { virtual: true });

type Server = { workout?: any; workoutStatus?: number; rank?: any };
function mockServer({ workout = {}, workoutStatus = 200, rank = null }: Server) {
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const u = String(url);
    if (u.includes('/api/stats/greek-rank')) {
      return Promise.resolve({ ok: !!rank, status: rank ? 200 : 404, json: () => Promise.resolve(rank ?? {}) });
    }
    if (/\/api\/workouts\/\d+$/.test(u)) {
      return Promise.resolve({ ok: workoutStatus < 300, status: workoutStatus, json: () => Promise.resolve(workout) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });
}

const params = (over: Record<string, any> = {}) => ({
  workoutId: 42, workoutName: 'Push Day', prs: [], totalVolume: 1000, totalReps: 20, totalSets: 4,
  muscles: [], isFirstWorkout: false, isBestVolume: false, isBestReps: false, ...over,
});
const renderSummary = (p: Record<string, any> = {}) =>
  render(<WorkoutSummaryScreen navigation={createMockNavigation() as any} route={{ key: 'k', name: 'WorkoutSummary', params: params(p) } as any} />);

const strengthWorkout = {
  date: '2026-03-05T00:00:00', duration: 52, workout_type: 'strength',
  exercises: [
    { id: 1, name: 'Bench Press', exercise_type: 'strength', sets: [
      { id: 1, reps: 10, weight: 95, set_type: 'W' },
      { id: 2, reps: 8, weight: 185, set_type: 'N' },
    ] },
    { id: 2, name: 'Plank', exercise_type: 'duration', sets: [{ id: 3, cardio_duration: 1.5, set_type: 'N' }] },
  ],
};

describe('WorkoutSummaryScreen', () => {
  beforeEach(async () => {
    mockWeightUnit = 'lbs';
    await AsyncStorage.clear();
  });

  it("converts the API's lbs volume for a kg user, on screen and on the share card", async () => {
    mockWeightUnit = 'kg';
    mockServer({ workout: strengthWorkout });
    const { findByText, getByText } = renderSummary({ totalVolume: 1000 });

    expect(await findByText('Volume (kg)')).toBeTruthy();
    // 1000 lbs = 454 kg; the share card shows the converted figure, not 1,000
    expect(getByText('454')).toBeTruthy();
    expect(getByText('Total Volume (kg)')).toBeTruthy();
  });

  it('counts PRs one by one and lists every value, grouped by lift and type', async () => {
    mockServer({ workout: strengthWorkout });
    const { findByText, getByText } = renderSummary({ prs: [
      { exercise_name: 'Bench Press', pr_type: 'max_reps', value: 8, weight_context: 185 },
      { exercise_name: 'Bench Press', pr_type: 'max_reps', value: 6, weight_context: 205 },
      { exercise_name: 'Bench Press', pr_type: 'max_weight', value: 225 },
      { exercise_name: 'Bench Press', pr_type: 'estimated_1rm', value: 250 },
    ] });

    // Two rep records at two weights are two PRs; the estimate is never a PR
    expect(await findByText('3 Personal Records')).toBeTruthy();
    expect(getByText('Bench Press · Max Weight')).toBeTruthy();
    expect(getByText('225 lbs')).toBeTruthy();
    expect(getByText('Bench Press · Rep Records')).toBeTruthy();
    expect(getByText('8 reps at 185 lbs, 6 reps at 205 lbs')).toBeTruthy();
  });

  it('formats holds as time, marks warm-ups, and adds the duration', async () => {
    mockServer({ workout: strengthWorkout });
    const { findByText, getByText, getAllByText } = renderSummary();

    expect(await findByText('1:30')).toBeTruthy();
    // The share card's best set, and the on-screen line with the warm-up marked
    expect(getAllByText('8 × 185 lbs')).toHaveLength(1);
    expect(getByText('W 10 × 95 lbs, 8 × 185 lbs')).toBeTruthy();
    expect(getByText('"Push Day" · 52m')).toBeTruthy();
  });

  it('collapses back-to-back identical sets into one entry', async () => {
    mockServer({ workout: { ...strengthWorkout, exercises: [
      { id: 1, name: 'Squat', exercise_type: 'strength', sets: [
        { id: 1, reps: 5, weight: 135, set_type: 'W' },
        { id: 2, reps: 5, weight: 225, set_type: 'N' },
        { id: 3, reps: 5, weight: 225, set_type: 'N' },
        { id: 4, reps: 5, weight: 225, set_type: 'N' },
        { id: 5, reps: 3, weight: 225, set_type: 'N' },
      ] },
    ] } });
    const { findByText } = renderSummary();
    expect(await findByText('W 5 × 135 lbs, 3× 5 × 225 lbs, 3 × 225 lbs')).toBeTruthy();
  });

  it('never folds a set of another type into the run', async () => {
    mockServer({ workout: { ...strengthWorkout, exercises: [
      { id: 1, name: 'Bench Press', exercise_type: 'strength', sets: [
        { id: 1, reps: 5, weight: 135, set_type: 'W' },
        { id: 2, reps: 5, weight: 135, set_type: 'N' },
        { id: 3, reps: 8, weight: 185, set_type: 'N' },
        { id: 4, reps: 8, weight: 185, set_type: 'F' },
        { id: 5, reps: 8, weight: 185, set_type: 'D' },
      ] },
    ] } });
    const { findByText } = renderSummary();
    expect(await findByText('W 5 × 135 lbs, 5 × 135 lbs, 8 × 185 lbs, F 8 × 185 lbs, D 8 × 185 lbs')).toBeTruthy();
  });

  it('keeps identical sets apart when something comes between them', async () => {
    mockServer({ workout: { ...strengthWorkout, exercises: [
      { id: 1, name: 'Row', exercise_type: 'strength', sets: [
        { id: 1, reps: 10, weight: 135, set_type: 'N' },
        { id: 2, reps: 8, weight: 155, set_type: 'N' },
        { id: 3, reps: 10, weight: 135, set_type: 'N' },
      ] },
    ] } });
    const { findByText } = renderSummary();
    expect(await findByText('10 × 135 lbs, 8 × 155 lbs, 10 × 135 lbs')).toBeTruthy();
  });

  it('dates the share card with the workout, not today', async () => {
    mockServer({ workout: strengthWorkout });
    const { findByText } = renderSummary();
    expect(await findByText('March 5, 2026')).toBeTruthy();
  });

  it('shows time, distance and pace for a cardio-only workout', async () => {
    mockServer({ workout: {
      date: '2026-03-05T00:00:00', workout_type: 'cardio', cardio_duration: 30, distance: 5, distance_unit: 'km',
      exercises: [{ id: 1, name: 'Run', exercise_type: 'cardio', sets: [{ id: 1, cardio_duration: 30, distance: 5, distance_unit: 'km', set_type: 'N' }] }],
    } });
    const { findByText, getByText, queryByText } = renderSummary({ totalVolume: 0, totalReps: 0, totalSets: 1 });

    expect(await findByText('Pace (/mi)')).toBeTruthy();
    expect(getByText('Distance (mi)')).toBeTruthy();
    expect(getByText('Time')).toBeTruthy();
    expect(queryByText('Volume (lbs)')).toBeNull();
    // The bout itself, converted to the default mi
    expect(getByText('30m · 3.11 mi')).toBeTruthy();
  });

  describe('a GPS activity', () => {
    const polyline = require('@mapbox/polyline');
    const ride = {
      date: '2026-03-05T00:00:00', workout_type: 'cardio', cardio_duration: 60, distance: 20, distance_unit: 'km',
      exercises: [{
        id: 1, name: 'Cycling', exercise_type: 'cardio',
        route_polyline: polyline.encode([[40, -74], [40.01, -74], [40.02, -74.01]]),
        best_efforts: [{ milestone_type: 'distance', distance_km: 10, duration_min: 28 }],
        sets: [{ id: 1, cardio_duration: 60, distance: 20, distance_unit: 'km', elevation_gain: 120, max_speed: 48.3, set_type: 'N' }],
      }],
    };
    const gpsParams = { workoutName: 'Saturday Loop', totalVolume: 0, totalReps: 0, totalSets: 0 };

    it('reads speed, the route, climbing and best efforts for a ride', async () => {
      mockServer({ workout: ride });
      const r = renderSummary(gpsParams);

      expect(await r.findByText('Speed (mph)')).toBeTruthy();
      // 20 km in an hour, on the screen and on the share card
      expect(r.getAllByText('12.4')).toHaveLength(2);
      expect(r.getByText('Speed mph')).toBeTruthy();
      expect(r.getByText('Ride complete.')).toBeTruthy();
      expect(r.getByText('394 ft climbed')).toBeTruthy();
      expect(r.getByText('30.0 mph max speed')).toBeTruthy();
      // No stops left out: the plain label
      expect(r.getByText('Time')).toBeTruthy();
      expect(r.getByText('28:00')).toBeTruthy();
      expect(r.UNSAFE_queryAllByType(require('react-native-maps').Polyline)).toHaveLength(1);
      // The route card stands in for the one-bout exercise list
      expect(r.queryByText('1h · 12.43 mi')).toBeNull();
    });

    it('labels the moving time when auto-pause left stops out of it', async () => {
      mockServer({ workout: { ...ride, duration: 72 } });
      const r = renderSummary(gpsParams);
      expect(await r.findByText('Moving Time')).toBeTruthy();
    });

    it("celebrates the ride's PRs", async () => {
      mockServer({ workout: ride });
      const r = renderSummary({ ...gpsParams, prs: [{ exercise_name: 'Cycling', pr_type: 'longest_distance', value: 20 }] });

      expect(await r.findByText('New Personal Record')).toBeTruthy();
      expect(r.getByText('Cycling · Longest Ride')).toBeTruthy();
      // The PR row's value; the off-screen share card says it too
      expect(r.getAllByText('12.43 mi').length).toBeGreaterThan(0);
      await waitFor(() => expect(Haptics.notificationAsync).toHaveBeenCalled());
    });

    it('opens the activity in Cardio Details', async () => {
      mockServer({ workout: ride });
      const navigation = createMockNavigation();
      const r = render(<WorkoutSummaryScreen navigation={navigation as any} route={{ key: 'k', name: 'WorkoutSummary', params: params(gpsParams) } as any} />);
      await r.findByText('Speed (mph)');
      fireEvent.press(r.getByText('View Full Details'));
      expect(navigation.replace).toHaveBeenCalledWith('CardioDetails', { workoutId: 42 });
    });
  });

  it('says so and offers a retry when the sets fail to load', async () => {
    mockServer({ workoutStatus: 500 });
    const { findByText, getByText } = renderSummary();

    expect(await findByText(/Couldn't load this workout's sets/)).toBeTruthy();
    mockServer({ workout: strengthWorkout });
    fireEvent.press(getByText('Try Again'));
    expect(await findByText('1:30')).toBeTruthy();
  });

  describe('rank-up', () => {
    afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });
    const rank = (name: string) => ({ greek_rank: name, greek_score: 13, held_by_gate: false });

    it('celebrates a rank reached by this workout and updates the cache', async () => {
      await AsyncStorage.setItem('greek_rank_cached', 'Neophyte');
      mockServer({ workout: strengthWorkout, rank: rank('Athlete') });
      const { findByText } = renderSummary();

      expect(await findByText('Ranked up')).toBeTruthy();
      await waitFor(async () => expect(await AsyncStorage.getItem('greek_rank_cached')).toBe('Athlete'));
    });

    it('plays the promotion: the old rank first, then the new one', async () => {
      await AsyncStorage.setItem('greek_rank_cached', 'Neophyte');
      mockServer({ workout: strengthWorkout, rank: rank('Athlete') });
      const { findByText } = renderSummary();

      expect(await findByText('Keep training to reach Athlete')).toBeTruthy();
      expect(await findByText('You reached Athlete. This workout pushed you over.', {}, { timeout: 3000 })).toBeTruthy();
      expect(await findByText('15 points to Hero')).toBeTruthy();
      expect(Haptics.impactAsync).toHaveBeenCalled();
      expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    });

    it('moves a rank-up above the PRs, and leaves an unchanged rank below them', async () => {
      const prs = [{ exercise_name: 'Bench Press', pr_type: 'max_weight', value: 185, weight_context: null, exercise_template_id: 1 }];
      const order = (json: unknown) => {
        const text = JSON.stringify(json);
        return text.indexOf('Personal Record') < text.indexOf('training to reach') ? 'prs first' : 'rank first';
      };

      await AsyncStorage.setItem('greek_rank_cached', 'Neophyte');
      mockServer({ workout: strengthWorkout, rank: rank('Athlete') });
      const up = renderSummary({ prs });
      await up.findByText('Ranked up');
      expect(order(up.toJSON())).toBe('rank first');
      up.unmount();

      await AsyncStorage.setItem('greek_rank_cached', 'Athlete');
      mockServer({ workout: strengthWorkout, rank: rank('Athlete') });
      const same = renderSummary({ prs });
      await same.findByText('Keep training to reach Hero');
      expect(order(same.toJSON())).toBe('prs first');
    });

    it('with Reduce Motion, swaps the rank without the fill ticks', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      await AsyncStorage.setItem('greek_rank_cached', 'Neophyte');
      mockServer({ workout: strengthWorkout, rank: rank('Athlete') });
      const { findByText } = renderSummary();

      expect(await findByText('You reached Athlete. This workout pushed you over.', {}, { timeout: 3000 })).toBeTruthy();
      expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
    });

    it('still shows the cached rank when the live one fails to load', async () => {
      await AsyncStorage.setItem('greek_rank_cached', 'Hero');
      mockServer({ workout: strengthWorkout, rank: null });
      const { findByText, queryByText } = renderSummary();

      expect(await findByText('Keep training to reach Demigod')).toBeTruthy();
      expect(queryByText('Ranked up')).toBeNull();
    });

    it('stays quiet when the rank is unchanged', async () => {
      await AsyncStorage.setItem('greek_rank_cached', 'Athlete');
      mockServer({ workout: strengthWorkout, rank: rank('Athlete') });
      const { findByText, queryByText } = renderSummary();

      expect(await findByText('Keep training to reach Hero')).toBeTruthy();
      expect(queryByText('Ranked up')).toBeNull();
    });

    it('stays quiet with nothing cached to compare against', async () => {
      mockServer({ workout: strengthWorkout, rank: rank('Athlete') });
      const { findByText, queryByText } = renderSummary();

      expect(await findByText('Keep training to reach Hero')).toBeTruthy();
      expect(queryByText('Ranked up')).toBeNull();
    });
  });
});
