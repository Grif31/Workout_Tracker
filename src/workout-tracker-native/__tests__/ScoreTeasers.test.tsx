/**
 * What a free account sees on the two score screens: its own overall score,
 * with the breakdown behind a blur and one way to unlock it. A subscriber
 * sees the screens untouched.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { createMockNavigation, createMockRoute } from './testUtils';
import StrengthScoreScreen from '../screens/TrainingTab/StrengthScoreScreen';
import EnduranceScoreScreen from '../screens/TrainingTab/EnduranceScoreScreen';
import { appCache } from '../utils/appCache';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

let mockIsPremium = false;
jest.mock('../context/PurchaseContext', () => ({
  usePurchase: () => ({ isPremium: mockIsPremium }),
}));

const rank = (label: string) => ({ label, tier: 3, display: label });

const STRENGTH = {
  overall: 62,
  overall_rank: rank('Advanced'),
  exercises_used: 4,
  muscle_groups_used: 3,
  big6: [{ exercise: 'Bench Press', percentile: 62, rank: rank('Advanced'), estimated_1rm: 225, has_data: true }],
  muscle_groups: [{ name: 'Chest', score: 62, rank: rank('Advanced') }],
  weight_unit: 'lbs',
  history: [],
};

const ENDURANCE = {
  overall: 62,
  overall_rank: rank('Advanced'),
  distances: [{
    distance_km: 5, label: '5K', pace_min_per_km: 5, percentile: 62,
    rank: rank('Advanced'), tier: 'core', thresholds: [],
  }],
  distances_tracked: 1,
  tiers: { core: { best: 62, weight: 0.7 }, speed: { best: null, weight: 0.3 } },
  age: null, age_factor: 1, age_adjusted: false,
  history: [],
};

const SCREENS = [
  { name: 'Strength Score', Screen: StrengthScoreScreen, route: 'StrengthScore', body: STRENGTH, source: 'strength_score' },
  { name: 'Endurance Score', Screen: EnduranceScoreScreen, route: 'EnduranceScore', body: ENDURANCE, source: 'endurance_score' },
] as const;

async function renderScreen({ Screen, route, body }: (typeof SCREENS)[number]) {
  (global.fetch as jest.Mock) = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) }));
  const AnyScreen = Screen as React.ComponentType<any>;
  const utils = render(<AnyScreen navigation={createMockNavigation()} route={createMockRoute(route)} />);
  await act(async () => {});
  return utils;
}

describe.each(SCREENS)('$name for a free account', screen => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();  // the rank-up banner hides itself on a timer
    appCache.clear();
    await AsyncStorage.clear();
    mockIsPremium = false;
  });
  afterEach(() => {
    act(() => { jest.runOnlyPendingTimers(); });
    jest.useRealTimers();
  });

  it('shows the overall rank, with the breakdown locked behind one unlock button', async () => {
    const r = await renderScreen(screen);
    expect(r.getByTestId('premium-teaser')).toBeTruthy();
    // The hero's rank badge sits outside the locked area
    expect(r.getAllByText('Advanced').length).toBeGreaterThan(0);
    expect(r.getByText("See what's behind your score")).toBeTruthy();

    fireEvent.press(r.getByText('Unlock with Premium'));
    expect(useNavigation().navigate).toHaveBeenCalledWith('Paywall', { source: screen.source });
  });

  it('keeps the locked rows out of reach of touch and screen readers', async () => {
    const r = await renderScreen(screen);
    const preview = r.getByTestId('premium-teaser').children[0] as any;
    expect(preview.props.pointerEvents).toBe('none');
    expect(preview.props.accessibilityElementsHidden).toBe(true);
  });

  it('has no "Show more" on the hero, which would name the strongest and weakest lifts', async () => {
    const r = await renderScreen(screen);
    expect(r.queryByText('Show more')).toBeNull();
  });

  it('shows a subscriber the full screen with no lock', async () => {
    mockIsPremium = true;
    const r = await renderScreen(screen);
    expect(r.queryByTestId('premium-teaser')).toBeNull();
    expect(r.queryByText('Unlock with Premium')).toBeNull();
    expect(r.getByText('Show more')).toBeTruthy();
  });
});
