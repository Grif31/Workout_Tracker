/**
 * Endurance Score screen: the running counterpart to the Strength Score.
 * Its own rules are the gender gate (pace standards are gendered), showing a
 * finish time for every distance but a pace only from 5K up, reading the
 * user's own distance unit, and a rank-up slot separate from the lifter one.
 */
import React from 'react';
import { render, waitFor, fireEvent, act, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute, mockUser } from './testUtils';
import EnduranceScoreScreen from '../screens/TrainingTab/EnduranceScoreScreen';
import { appCache } from '../utils/appCache';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const route = createMockRoute('EnduranceScore');
const LAST_TIER_KEY = `endurance_score_last_tier_${mockUser.id}`;
const STRENGTH_TIER_KEY = `strength_score_last_tier_${mockUser.id}`;
const UNIT_KEY = `gps_distance_unit_${mockUser.id}`;

const rank = (label: string) => ({ label, tier: 3, display: label });

// 5K at 5 min/km is a 25:00 finish; 400m at 3 min/km is 1:12.
const FIVE_K = {
  distance_km: 5, label: '5K', pace_min_per_km: 5, percentile: 62,
  rank: rank('Advanced'), tier: 'core' as const,
  thresholds: [{ percentile: 80, rank: 'Elite', pace_min_per_km: 4.5 }],
};
const FOUR_HUNDRED = {
  distance_km: 0.4, label: '400m', pace_min_per_km: 3, percentile: 40,
  rank: rank('Intermediate'), tier: 'speed' as const, thresholds: [],
};

function payload(overrides: any = {}) {
  return {
    overall: 62,
    overall_rank: rank('Advanced'),
    distances: [FIVE_K, FOUR_HUNDRED],
    distances_tracked: 2,
    tiers: { core: { best: 62, weight: 0.7 }, speed: { best: 40, weight: 0.3 } },
    age: null, age_factor: 1, age_adjusted: false,
    history: [],
    ...overrides,
  };
}

function mockResponse(body: any, status = 200) {
  (global.fetch as jest.Mock) = jest.fn(() =>
    Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) }));
}

async function renderScreen() {
  const nav = createMockNavigation();
  const utils = render(<EnduranceScoreScreen navigation={nav as any} route={route as any} />);
  await act(async () => {});
  return { ...utils, nav };
}

describe('EnduranceScoreScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();  // the rank-up banner hides itself on a 3.5s timer
    appCache.clear();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    act(() => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
  });

  describe('states', () => {
    it('gates on gender, since pace standards are gendered', async () => {
      mockResponse({ missing: ['gender'] }, 422);
      const { getByText, nav } = await renderScreen();
      await waitFor(() => expect(getByText('Set Up Your Profile')).toBeTruthy());
      fireEvent.press(getByText('Complete Profile'));
      expect(nav.navigate).toHaveBeenCalledWith('ProfileTab', { screen: 'EditProfile', initial: false });
    });

    it('shows the empty state for a runner with no scored runs', async () => {
      mockResponse(payload({ overall: null, overall_rank: null, distances: [], distances_tracked: 0 }));
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText('No Runs Yet')).toBeTruthy());
    });

    it('says so when the score cannot be loaded', async () => {
      mockResponse({}, 500);
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText("Couldn't Load Score")).toBeTruthy());
    });

    it('reads the endurance-score endpoint, not the strength one', async () => {
      mockResponse(payload());
      await renderScreen();
      const urls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
      expect(urls.some(u => u.includes('/api/stats/endurance-score'))).toBe(true);
      expect(urls.some(u => u.includes('/api/stats/strength-score'))).toBe(false);
    });
  });

  describe('distance rows', () => {
    it('shows a finish time for every distance', async () => {
      mockResponse(payload());
      const { getByText, getAllByText } = await renderScreen();
      await waitFor(() => expect(getByText('5K')).toBeTruthy());
      // The off-screen share card repeats the best time, hence getAllByText
      expect(getAllByText('25:00').length).toBeGreaterThan(0);   // 5 km at 5:00/km
      expect(getAllByText('400m').length).toBeGreaterThan(0);
      expect(getByText('1:12')).toBeTruthy();                    // 0.4 km at 3:00/km
    });

    it('adds a pace from 5K up but not for the speed distances', async () => {
      mockResponse(payload());
      const { getByText, getByTestId } = await renderScreen();
      await waitFor(() => expect(getByText('5K')).toBeTruthy());
      expect(within(getByTestId('distance-row-5K')).getByText('8:03/mi')).toBeTruthy();  // 5:00/km in miles
      // A 400m runner quotes 1:12, never a per-mile pace
      expect(within(getByTestId('distance-row-400m')).queryByText(/\/(mi|km)/)).toBeNull();
    });

    it('shows pace in km for a runner whose GPS unit is km', async () => {
      await AsyncStorage.setItem(UNIT_KEY, 'km');
      mockResponse(payload());
      const { getByText, getAllByText } = await renderScreen();
      await waitFor(() => expect(getByText('5:00/km')).toBeTruthy());
      expect(getAllByText('25:00').length).toBeGreaterThan(0);  // the finish time is unit-free
    });

    it('names the time the next rank asks for', async () => {
      mockResponse(payload());
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText('Elite at 22:30')).toBeTruthy());
    });

    it('opens the detail sheet for a distance', async () => {
      mockResponse(payload());
      const { getByTestId, getAllByText } = await renderScreen();
      await waitFor(() => expect(getByTestId('distance-row-5K')).toBeTruthy());
      fireEvent.press(getByTestId('distance-row-5K'));
      await waitFor(() => expect(getAllByText('5K').length).toBeGreaterThan(1));
    });
  });

  describe('rank-up celebration', () => {
    it('seeds silently the first time', async () => {
      mockResponse(payload());
      const { queryByText } = await renderScreen();
      await waitFor(async () => expect(await AsyncStorage.getItem(LAST_TIER_KEY)).not.toBeNull());
      expect(queryByText(/You've reached/)).toBeNull();
    });

    it('celebrates when the tier goes up', async () => {
      await AsyncStorage.setItem(LAST_TIER_KEY, '0');
      mockResponse(payload());
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText("You've reached Advanced")).toBeTruthy());
    });

    it('is a separate moment from ranking up as a lifter', async () => {
      // A lifter's stored tier must not stand in for the runner's
      await AsyncStorage.setItem(STRENGTH_TIER_KEY, '0');
      mockResponse(payload());
      const { getByText, queryByText } = await renderScreen();
      await waitFor(() => expect(getByText('5K')).toBeTruthy());
      expect(queryByText(/You've reached/)).toBeNull();
      expect(await AsyncStorage.getItem(STRENGTH_TIER_KEY)).toBe('0');
    });
  });
});
