/**
 * Strength Score screen. The maths lives on the backend; what this screen has
 * to get right is which of its four states it shows (gate / no data / error /
 * score) and the rank-up celebration, which writes a per-user tier slot that
 * must not be shared with the Endurance Score.
 */
import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute, mockUser } from './testUtils';
import StrengthScoreScreen from '../screens/TrainingTab/StrengthScoreScreen';
import { appCache } from '../utils/appCache';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const route = createMockRoute('StrengthScore');
const LAST_TIER_KEY = `strength_score_last_tier_${mockUser.id}`;
const ENDURANCE_TIER_KEY = `endurance_score_last_tier_${mockUser.id}`;

const lift = (exercise: string, percentile: number | null, rankLabel: string | null, estimated_1rm: number | null = null) => ({
  exercise,
  percentile,
  rank: rankLabel ? { label: rankLabel, tier: 0, display: rankLabel } : null,
  estimated_1rm,
  has_data: percentile != null,
});

function scorePayload(overrides: any = {}) {
  return {
    overall: 62,
    overall_rank: { label: 'Advanced', tier: 3, display: 'Advanced' },
    exercises_used: 4,
    muscle_groups_used: 3,
    big6: [lift('Bench Press', 62, 'Advanced', 225), lift('Deadlift', null, null)],
    muscle_groups: [{ name: 'Chest', score: 62, rank: { label: 'Advanced', tier: 3, display: 'Advanced' } }],
    weight_unit: 'lbs',
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
  const utils = render(<StrengthScoreScreen navigation={nav as any} route={route as any} />);
  await act(async () => {});
  return { ...utils, nav };
}

describe('StrengthScoreScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // The rank-up banner hides itself on a 3.5s timer; with real timers that
    // fires after the test has torn the screen down.
    jest.useFakeTimers();
    // The screen shows its last score instantly from this in-memory cache;
    // left alone it leaks one test's data into the next.
    appCache.clear();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    act(() => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
  });

  describe('states', () => {
    it('shows the score once loaded', async () => {
      mockResponse(scorePayload());
      const { getByText, getAllByText } = await renderScreen();
      await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
      expect(getAllByText('Advanced').length).toBeGreaterThan(0);
      // A lift with no logged data is listed, but marked rather than ranked
      expect(getByText('Deadlift')).toBeTruthy();
      expect(getByText('No data logged')).toBeTruthy();
    });

    it('asks for gender and bodyweight when the API says they are missing (422)', async () => {
      mockResponse({ missing: ['gender', 'bodyweight'] }, 422);
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText('Set up your profile')).toBeTruthy());
      expect(getByText(/Add your gender and log your bodyweight/)).toBeTruthy();
    });

    it('asks only for bodyweight when gender is already set, with no profile button', async () => {
      mockResponse({ missing: ['bodyweight'] }, 422);
      const { getByText, queryByText } = await renderScreen();
      await waitFor(() => expect(getByText('Log your bodyweight to see your strength score')).toBeTruthy());
      // Bodyweight is logged on the Measurements screen, not Edit Profile
      expect(queryByText('Complete Profile')).toBeNull();
    });

    it('sends the user to Edit Profile from the gate, staying out of the tab root', async () => {
      mockResponse({ missing: ['gender'] }, 422);
      const { getByText, nav } = await renderScreen();
      await waitFor(() => expect(getByText('Complete Profile')).toBeTruthy());
      fireEvent.press(getByText('Complete Profile'));
      expect(nav.navigate).toHaveBeenCalledWith('ProfileTab', { screen: 'EditProfile', initial: false });
    });

    it('shows the empty state for a user with no lifts logged', async () => {
      mockResponse(scorePayload({ exercises_used: 0, big6: [] }));
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText('No exercise data yet')).toBeTruthy());
    });

    it('shows the profile gate, not the empty state, when the strength leg was skipped', async () => {
      // 200 with no lifts used because bodyweight is missing: the user has
      // data, so "log some workouts" would be wrong advice.
      mockResponse(scorePayload({ exercises_used: 0, big6: [], missing_for_strength: ['bodyweight'] }));
      const { getByText, queryByText } = await renderScreen();
      await waitFor(() => expect(getByText('Set up your profile')).toBeTruthy());
      expect(queryByText('No exercise data yet')).toBeNull();
    });

    it('says so when the score cannot be loaded', async () => {
      mockResponse({}, 500);
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText("Couldn't load score")).toBeTruthy());
    });
  });

  describe('rank-up celebration', () => {
    const tierOf = async () => AsyncStorage.getItem(LAST_TIER_KEY);

    it('seeds the tier silently the first time, so existing users are not congratulated', async () => {
      mockResponse(scorePayload());
      const { queryByText } = await renderScreen();
      await waitFor(async () => expect(await tierOf()).not.toBeNull());
      expect(queryByText(/You've reached/)).toBeNull();
    });

    it('celebrates once the tier goes up, and not on a later visit at the same tier', async () => {
      await AsyncStorage.setItem(LAST_TIER_KEY, '0');
      mockResponse(scorePayload());
      const first = await renderScreen();
      await waitFor(() => expect(first.getByText("You've reached Advanced")).toBeTruthy());
      first.unmount();

      const second = await renderScreen();
      await waitFor(() => expect(second.getByText('Bench Press')).toBeTruthy());
      expect(second.queryByText(/You've reached/)).toBeNull();
    });

    it('does not celebrate when the tier dropped', async () => {
      await AsyncStorage.setItem(LAST_TIER_KEY, '99');
      mockResponse(scorePayload());
      const { queryByText, getByText } = await renderScreen();
      await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
      expect(queryByText(/You've reached/)).toBeNull();
    });

    it('keeps its own tier slot, so an endurance rank-up is a separate moment', async () => {
      await AsyncStorage.setItem(ENDURANCE_TIER_KEY, '0');
      mockResponse(scorePayload());
      const { getByText, queryByText } = await renderScreen();
      await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
      // Strength has no stored tier of its own yet: seed, don't celebrate
      expect(queryByText(/You've reached/)).toBeNull();
      expect(await AsyncStorage.getItem(ENDURANCE_TIER_KEY)).toBe('0');
      expect(await tierOf()).not.toBeNull();
    });
  });

  it('reads the strength-score endpoint', async () => {
    mockResponse(scorePayload());
    await renderScreen();
    const urls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
    expect(urls.some(u => u.includes('/api/stats/strength-score'))).toBe(true);
  });
});
