import React from 'react';
import { FlatList } from 'react-native';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import GreekRankScreen from '../screens/ProfileTab/GreekRankScreen';
import type { GreekRankData } from '../utils/greekRank';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const route = createMockRoute('GreekRank');
const ARETE = 'Aretē';

// Mirrors GET /api/stats/greek-rank. The score is effort only; the higher of
// Strength/Endurance (null = no score) gates Titan at 50 and Aretē at 80.
function payload(
  strength: number | null,
  endurance: number | null,
  overrides: Partial<GreekRankData> = {},
): GreekRankData {
  const legs = [strength, endurance].filter((v): v is number => v != null);
  const best = legs.length ? Math.max(...legs) : null;
  return {
    greek_rank: 'Hero',
    greek_score: 40,
    score_rank: 'Hero',
    held_by_gate: false,
    next_gate: { rank: 'Titan', required_percentile: 50, met: best != null && best >= 50 },
    gates: { Titan: 50, [ARETE]: 80 },
    components: { consistency: 60, dedication: 30, volume: 25 },
    weights: { consistency: 0.4, dedication: 0.3, volume: 0.3 },
    performance: { strength, endurance, best },
    profile_missing: [],
    ...overrides,
  };
}

async function renderWith(data: GreekRankData) {
  mockFetch(data);
  const nav = createMockNavigation();
  const utils = render(<GreekRankScreen navigation={nav as any} route={route as any} />);
  await waitFor(() => expect(utils.getByText('Unlock Top Ranks')).toBeTruthy());
  return { ...utils, nav };
}

describe('GreekRankScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('loads from the greek-rank endpoint, which needs no gender', async () => {
    await renderWith(payload(null, null));
    const urls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
    expect(urls.some(u => u.includes('/api/stats/greek-rank'))).toBe(true);
    expect(urls.some(u => u.includes('/api/stats/strength-score'))).toBe(false);
  });

  it('shows the three effort components and no Performance points row', async () => {
    const { getByText, queryByText } = await renderWith(payload(41, 67));
    expect(getByText('Consistency')).toBeTruthy();
    expect(getByText('Dedication')).toBeTruthy();
    expect(getByText('Volume')).toBeTruthy();
    expect(queryByText('Performance')).toBeNull();
  });

  describe('score highlight', () => {
    it('highlights Endurance for a cardio-only user and dashes Strength', async () => {
      const { getByTestId, queryByTestId, getByText } = await renderWith(payload(null, 67));
      expect(getByTestId('greek-leg-endurance-counts')).toBeTruthy();
      expect(queryByTestId('greek-leg-strength-counts')).toBeNull();
      expect(getByText('–')).toBeTruthy();
    });

    it('highlights Strength for a lifter who has never run', async () => {
      const { getByTestId, queryByTestId } = await renderWith(payload(72, null));
      expect(getByTestId('greek-leg-strength-counts')).toBeTruthy();
      expect(queryByTestId('greek-leg-endurance-counts')).toBeNull();
    });

    it('gives a tie to Strength, matching the backend', async () => {
      const { getByTestId, queryByTestId } = await renderWith(payload(55, 55));
      expect(getByTestId('greek-leg-strength-counts')).toBeTruthy();
      expect(queryByTestId('greek-leg-endurance-counts')).toBeNull();
    });

    it('highlights neither with no score on either side', async () => {
      const { queryByTestId, getAllByText } = await renderWith(payload(null, null));
      expect(queryByTestId('greek-leg-strength-counts')).toBeNull();
      expect(queryByTestId('greek-leg-endurance-counts')).toBeNull();
      expect(getAllByText('–')).toHaveLength(2);
    });
  });

  describe('top-rank gates', () => {
    it('marks each gate met or locked from the best score', async () => {
      const { getByTestId } = await renderWith(payload(41, 67));
      expect(getByTestId('greek-gate-Titan-met')).toBeTruthy();
      expect(getByTestId(`greek-gate-${ARETE}-locked`)).toBeTruthy();
    });

    it('asks for gender when the profile has none', async () => {
      const { getByText } = await renderWith(payload(null, null, { profile_missing: ['gender'] }));
      expect(getByText('Add your gender to your profile to unlock Titan')).toBeTruthy();
    });

    it('says what the gate needs instead of "0 more points" when held at Olympian', async () => {
      const { getByText, queryByText } = await renderWith(payload(null, 41, {
        greek_rank: 'Olympian', greek_score: 90, score_rank: 'Titan', held_by_gate: true,
      }));
      expect(getByText('Reach the 50th percentile in Strength or Endurance to unlock Titan')).toBeTruthy();
      expect(queryByText(/0 more points/)).toBeNull();
    });

    it("doesn't offer the frame of a rank the score reached but a gate holds back", async () => {
      const { getByText, getAllByText, queryByText } = await renderWith(payload(null, 41, {
        greek_rank: 'Olympian', greek_score: 90, score_rank: 'Titan', held_by_gate: true,
      }));
      // The carousel opens on the held rank; Olympian's frame is usable
      expect(getByText('Use This Frame')).toBeTruthy();
      // "Titan" also labels its gate row further down; the carousel comes first
      fireEvent.press(getAllByText('Titan')[0]);
      await waitFor(() => expect(getByText('Rank up to unlock frame')).toBeTruthy());
      expect(queryByText('Use This Frame')).toBeNull();
    });
  });

  describe('rank carousel', () => {
    afterEach(() => jest.restoreAllMocks());

    it('centers the held rank once the list has content', async () => {
      // Circle 88 + gap 16 = 104 per item. With half the leftover width as side
      // padding, index 4 (Olympian) is dead center at exactly 4 * 104.
      const scrollSpy = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
      const { UNSAFE_getByType } = await renderWith(payload(null, 41, {
        greek_rank: 'Olympian', greek_score: 70, score_rank: 'Olympian',
      }));
      fireEvent(UNSAFE_getByType(FlatList), 'contentSizeChange', 1000, 120);
      expect(scrollSpy).toHaveBeenCalledWith({ offset: 416, animated: false });
    });

    it('recenters when the measured width changes the padding', async () => {
      const scrollSpy = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
      const { UNSAFE_getByType } = await renderWith(payload(null, null, {
        greek_rank: 'Hero', score_rank: 'Hero',
      }));
      const list = UNSAFE_getByType(FlatList);
      fireEvent(list, 'layout', { nativeEvent: { layout: { width: 500, height: 120, x: 0, y: 0 } } });
      expect(list.props.contentContainerStyle).toEqual({ paddingHorizontal: (500 - 104) / 2 });
      fireEvent(list, 'contentSizeChange', 1124, 120);
      // Hero is index 2, independent of width
      expect(scrollSpy).toHaveBeenLastCalledWith({ offset: 208, animated: false });
    });
  });

  it('links to both full score screens', async () => {
    const { getByText, nav } = await renderWith(payload(41, 67));
    fireEvent.press(getByText('Strength Score'));
    expect(nav.navigate).toHaveBeenCalledWith('TrainingTab', { screen: 'StrengthScore', initial: false });
    fireEvent.press(getByText('Endurance Score'));
    expect(nav.navigate).toHaveBeenCalledWith('TrainingTab', { screen: 'EnduranceScore', initial: false });
  });
});
