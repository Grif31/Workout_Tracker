import React from 'react';
import { FlatList, LayoutAnimation } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import GreekRankScreen from '../screens/ProfileTab/GreekRankScreen';
import type { GreekRankData } from '../utils/greekRank';
import { appCache } from '../utils/appCache';
import ProfileAvatarFrame from '../components/ProfileAvatarFrame';
import { setReduceMotionForTests } from '../utils/motion';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
// jest.setup mocks this as always-premium; this screen needs both states
let mockIsPremium = true;
jest.mock('../context/PurchaseContext', () => ({
  usePurchase: () => ({
    isPremium: mockIsPremium,
    offerings: null,
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    loading: false,
  }),
  PurchaseProvider: ({ children }: any) => children,
}));
// Its own request and tests (achievementScreens.test.tsx); here it would read the rank payload
jest.mock('../components/achievements/TrophyHallCard', () => () => null);
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
  await waitFor(() => expect(utils.getByLabelText(/^Score \d+ of 100/)).toBeTruthy());
  return { ...utils, nav };
}

/** Top ranks only renders at or next to the gated ranks, so anything
 *  asserting on that section has to be held high enough to see it. */
async function renderNearTopRanks(data: GreekRankData) {
  const utils = await renderWith({
    ...data,
    greek_rank: data.greek_rank === 'Hero' ? 'Olympian' : data.greek_rank,
    score_rank: data.score_rank === 'Hero' ? 'Olympian' : data.score_rank,
    greek_score: data.greek_score === 40 ? 70 : data.greek_score,
  });
  await waitFor(() => expect(utils.getByText('Top ranks')).toBeTruthy());
  return utils;
}

/** What builds your score is closed until the score button is pressed */
function openScoreParts(utils: { getByLabelText: (m: RegExp) => any }) {
  fireEvent.press(utils.getByLabelText(/^Score \d+ of 100/));
}

describe('GreekRankScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockIsPremium = true;
    appCache.clear();
    await AsyncStorage.clear();
  });

  it('loads from the greek-rank endpoint, which needs no gender', async () => {
    await renderWith(payload(null, null));
    const urls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
    expect(urls.some(u => u.includes('/api/stats/greek-rank'))).toBe(true);
    expect(urls.some(u => u.includes('/api/stats/strength-score'))).toBe(false);
  });

  it('shows the three effort components and no Performance points row', async () => {
    const utils = await renderWith(payload(41, 67));
    const { getByText, queryByText } = utils;
    openScoreParts(utils);
    expect(getByText('Consistency')).toBeTruthy();
    expect(getByText('Dedication')).toBeTruthy();
    expect(getByText('Volume')).toBeTruthy();
    expect(queryByText('Performance')).toBeNull();
  });

  describe('score highlight', () => {
    it('highlights Endurance for a cardio-only user and dashes Strength', async () => {
      const { getByTestId, queryByTestId, getByText } = await renderNearTopRanks(payload(null, 67));
      expect(getByTestId('greek-leg-endurance-counts')).toBeTruthy();
      expect(queryByTestId('greek-leg-strength-counts')).toBeNull();
      expect(getByText('–')).toBeTruthy();
    });

    it('highlights Strength for a lifter who has never run', async () => {
      const { getByTestId, queryByTestId } = await renderNearTopRanks(payload(72, null));
      expect(getByTestId('greek-leg-strength-counts')).toBeTruthy();
      expect(queryByTestId('greek-leg-endurance-counts')).toBeNull();
    });

    it('gives a tie to Strength, matching the backend', async () => {
      const { getByTestId, queryByTestId } = await renderNearTopRanks(payload(55, 55));
      expect(getByTestId('greek-leg-strength-counts')).toBeTruthy();
      expect(queryByTestId('greek-leg-endurance-counts')).toBeNull();
    });

    it('highlights neither with no score on either side', async () => {
      const { queryByTestId, getAllByText } = await renderNearTopRanks(payload(null, null));
      expect(queryByTestId('greek-leg-strength-counts')).toBeNull();
      expect(queryByTestId('greek-leg-endurance-counts')).toBeNull();
      expect(getAllByText('–')).toHaveLength(2);
    });
  });

  describe('top-rank gates', () => {
    it('marks each gate met or locked from the best score', async () => {
      const { getByTestId } = await renderNearTopRanks(payload(41, 67));
      expect(getByTestId('greek-gate-Titan-met')).toBeTruthy();
      expect(getByTestId(`greek-gate-${ARETE}-locked`)).toBeTruthy();
    });

    it('asks for gender when the profile has none, with a way to fix it', async () => {
      const { getByText, nav } = await renderNearTopRanks(payload(null, null, { profile_missing: ['gender'] }));
      expect(getByText(/add those to your profile to start scoring/)).toBeTruthy();
      fireEvent.press(getByText('Complete Profile'));
      expect(nav.navigate).toHaveBeenCalledWith('EditProfile');
    });

    it('says what the gate needs instead of "0 more points" when held at Olympian', async () => {
      const { getByText, queryByText } = await renderWith(payload(null, 41, {
        greek_rank: 'Olympian', greek_score: 90, score_rank: 'Titan', held_by_gate: true,
      }));
      expect(getByText('Reach the 50th percentile in Strength or Endurance to unlock Titan')).toBeTruthy();
      expect(queryByText(/0 more points/)).toBeNull();
    });

    it("doesn't offer the frame of a rank the score reached but a gate holds back", async () => {
      const { getByLabelText } = await renderWith(payload(null, 41, {
        greek_rank: 'Olympian', greek_score: 90, score_rank: 'Titan', held_by_gate: true,
      }));
      fireEvent.press(getByLabelText(/^Change frame/));
      expect(getByLabelText('Olympian frame').props.accessibilityState.disabled).toBe(false);
      expect(getByLabelText('Titan frame, locked. Unlocks at 80').props.accessibilityState.disabled).toBe(true);
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

    it('follows the circle the carousel snapped to, not just taps', async () => {
      jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
      const { UNSAFE_getByType, getByText } = await renderWith(payload(null, null, {
        greek_rank: 'Hero', greek_score: 40, score_rank: 'Hero',
      }));
      // Scroll Athlete (index 1) into the center
      fireEvent(UNSAFE_getByType(FlatList), 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: 104 } },
      });
      await waitFor(() => expect(getByText('12–28')).toBeTruthy());
    });

    it('scrolls a tapped circle to the center', async () => {
      const scrollSpy = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
      const { getAllByText } = await renderWith(payload(null, null, {
        greek_rank: 'Hero', score_rank: 'Hero',
      }));
      scrollSpy.mockClear();
      fireEvent.press(getAllByText('Titan')[0]);
      expect(scrollSpy).toHaveBeenCalledWith({ offset: 5 * 104, animated: true });
    });
  });

  describe('held rank vs the circle being viewed', () => {
    afterEach(() => jest.restoreAllMocks());

    it('keeps the hero in the held rank colour when a higher rank is tapped', async () => {
      jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
      const { getAllByText } = await renderWith(payload(null, null, {
        greek_rank: 'Hero', greek_score: 40, score_rank: 'Hero',
      }));
      const hero = () => getAllByText('Hero').find(n => n.props.style?.some?.((x: any) => x?.fontSize === 36))!;
      expect(hero()).toBeTruthy();
      fireEvent.press(getAllByText('Titan')[0]);
      const style = hero().props.style.flat();
      expect(style.some((x: any) => x?.color === '#E53935')).toBe(false);
      expect(style.some((x: any) => x?.color === '#4CAF50')).toBe(true);
    });

    it('never describes progress toward a rank already earned', async () => {
      jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
      const { getAllByText, getByText, queryByText } = await renderWith(payload(null, null, {
        greek_rank: 'Hero', greek_score: 40, score_rank: 'Hero',
      }));
      fireEvent.press(getAllByText('Neophyte')[0]);
      expect(queryByText(/reach Athlete/)).toBeNull();
      expect(getByText('Progress to Demigod')).toBeTruthy();
    });
  });

  describe('a rank held back by a gate', () => {
    it('puts the gate line where the points would be, once', async () => {
      const { getAllByText, queryByText } = await renderWith(payload(41, null, {
        greek_rank: 'Olympian', greek_score: 82, score_rank: 'Titan', held_by_gate: true,
      }));
      // The Top ranks hint would repeat it, so it drops out
      expect(getAllByText(/Reach the 50th percentile in Strength or Endurance to unlock Titan/))
        .toHaveLength(1);
      expect(queryByText(/points? to Titan/)).toBeNull();
    });

    it('leads with the points when the rank held is the rank earned', async () => {
      const { getByText } = await renderWith(payload(41, null, {
        greek_rank: 'Hero', greek_score: 41, score_rank: 'Hero', held_by_gate: false,
      }));
      expect(getByText('7 points to Demigod')).toBeTruthy();
    });
  });

  describe('what builds your score', () => {
    afterEach(() => { setReduceMotionForTests(false); jest.restoreAllMocks(); });

    it('still shows the score and its parts at zero', async () => {
      const utils = await renderWith(payload(null, null, {
        greek_rank: 'Neophyte', greek_score: 0, score_rank: 'Neophyte',
        components: { consistency: 0, dedication: 0, volume: 0 },
      }));
      expect(utils.getByText('Score 0 of 100')).toBeTruthy();
      expect(utils.getByText('12 points to Athlete')).toBeTruthy();
      openScoreParts(utils);
      expect(utils.getByText('What builds your score')).toBeTruthy();
    });

    it('opens from the score button and closes again', async () => {
      const utils = await renderWith(payload(null, null));
      const button = () => utils.getByLabelText(/^Score \d+ of 100/);
      expect(utils.queryByText('What builds your score')).toBeNull();
      expect(button().props.accessibilityState).toEqual({ expanded: false });
      fireEvent.press(button());
      expect(utils.getByText('What builds your score')).toBeTruthy();
      expect(button().props.accessibilityState).toEqual({ expanded: true });
      fireEvent.press(button());
      expect(utils.queryByText('What builds your score')).toBeNull();
    });

    it("gives each part's weight and what it counts", async () => {
      const utils = await renderWith(payload(null, null));
      openScoreParts(utils);
      expect(utils.getByText('40% of your score')).toBeTruthy();
      expect(utils.getAllByText('30% of your score')).toHaveLength(2);
      expect(utils.getByText('Weeks you trained, out of the last 12')).toBeTruthy();
      expect(utils.getByText('Workouts in the last 3 months')).toBeTruthy();
      expect(utils.getByText('Working sets and cardio a week')).toBeTruthy();
    });

    it('names the lowest part with its tip', async () => {
      const utils = await renderWith(payload(null, null, {
        components: { consistency: 20, dedication: 60, volume: 50 },
      }));
      openScoreParts(utils);
      expect(utils.getByText(/Consistency is your lowest/)).toBeTruthy();
      expect(utils.getByText(/Training in more weeks moves it most/)).toBeTruthy();
      expect(utils.queryByText(/Volume is your lowest/)).toBeNull();
    });

    it('animates the open, except under Reduce Motion', async () => {
      const spy = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
      const utils = await renderWith(payload(null, null));
      openScoreParts(utils);
      expect(spy).toHaveBeenCalledTimes(1);
      setReduceMotionForTests(true);
      openScoreParts(utils);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('progress card', () => {
    it("shows the percent and the band's ends", async () => {
      const { getByText } = await renderWith(payload(null, null, {
        greek_rank: 'Hero', greek_score: 41, score_rank: 'Hero',
      }));
      expect(getByText('Progress to Demigod')).toBeTruthy();
      expect(getByText('65%')).toBeTruthy();
      expect(getByText('Hero · 28')).toBeTruthy();
      expect(getByText('Demigod · 48')).toBeTruthy();
    });

    it('says so at the top rank', async () => {
      const { getByText } = await renderWith(payload(90, null, {
        greek_rank: ARETE, greek_score: 96, score_rank: ARETE,
      }));
      expect(getByText("You've reached the highest rank.")).toBeTruthy();
    });
  });

  describe('choose a frame', () => {
    it('opens from the avatar and puts on a tapped frame', async () => {
      const { getByLabelText, getByText, UNSAFE_getAllByType } = await renderWith(payload(null, null, {
        greek_rank: 'Hero', score_rank: 'Hero',
      }));
      fireEvent.press(getByLabelText('Change frame. Neophyte frame in use'));
      expect(getByText('3 of 7 unlocked')).toBeTruthy();
      expect(getByLabelText('Neophyte frame, in use')).toBeTruthy();
      expect(getByLabelText('Demigod frame, locked. Unlocks at 48')).toBeTruthy();
      fireEvent.press(getByLabelText('Hero frame'));
      await waitFor(() => expect(getByLabelText('Change frame. Hero frame in use')).toBeTruthy());
      const hero = UNSAFE_getAllByType(ProfileAvatarFrame).find(f => f.props.size > 88);
      expect(hero!.props.rankName).toBe('Hero');
      const keys = await AsyncStorage.getAllKeys();
      const frameKey = keys.find(k => k.startsWith('profile_frame_rank'));
      expect(frameKey && await AsyncStorage.getItem(frameKey)).toBe('Hero');
    });

    it('ignores a locked frame', async () => {
      const { getByLabelText } = await renderWith(payload(null, null, {
        greek_rank: 'Hero', score_rank: 'Hero',
      }));
      fireEvent.press(getByLabelText(/^Change frame/));
      fireEvent.press(getByLabelText('Titan frame, locked. Unlocks at 80'));
      expect(getByLabelText('Change frame. Neophyte frame in use')).toBeTruthy();
    });
  });

  describe('gate rows', () => {
    it('shows where the user currently stands on a locked gate', async () => {
      const { getByText } = await renderNearTopRanks(payload(34, null));
      expect(getByText(/50th percentile · you're at 34th/)).toBeTruthy();
    });

    it('drops the standing from a gate already met', async () => {
      // 64th clears Titan (50) but not Aretē (80), so only the locked row
      // needs to say where the user stands
      const { getByText, queryByText } = await renderNearTopRanks(payload(64, null));
      expect(queryByText(/50th percentile ·/)).toBeNull();
      expect(getByText(/80th percentile · you're at 64th/)).toBeTruthy();
    });

    it('lists gates in rank order whatever order they arrive in', async () => {
      const { getAllByText } = await renderNearTopRanks(payload(null, null, {
        gates: { [ARETE]: 80, Titan: 50 } as Record<string, number>,
      }));
      const shown = getAllByText(/th percentile/).map(n => String(n.props.children[0]));
      expect(shown).toEqual(['50th', '80th']);
    });

    it('writes percentiles as real ordinals', async () => {
      // 72 used to read "72th"
      const { getByText } = await renderNearTopRanks(payload(72, null));
      expect(getByText(/you're at 72nd/)).toBeTruthy();
    });
  });

  it('opens the explainer from the header', async () => {
    const { getByLabelText, nav } = await renderWith(payload(null, null));
    fireEvent.press(getByLabelText('How Greek Rank works'));
    expect(nav.navigate).toHaveBeenCalledWith('GreekRankIntro');
  });

  it('shows the equipped frame at full size in the hero', async () => {
    const { UNSAFE_getAllByType } = await renderWith(payload(null, null, {
      greek_rank: 'Hero', score_rank: 'Hero',
    }));
    const frames = UNSAFE_getAllByType(ProfileAvatarFrame);
    const hero = frames.find(f => f.props.size > 88);
    expect(hero).toBeTruthy();
    expect(hero!.props.rankName).toBe('Neophyte'); // nothing equipped yet
  });
  describe('who sees Top ranks', () => {
    afterEach(() => jest.restoreAllMocks());

    it('hides it from a rank nowhere near the gates', async () => {
      const { queryByText } = await renderWith(payload(41, null, {
        greek_rank: 'Hero', score_rank: 'Hero',
      }));
      expect(queryByText('Top ranks')).toBeNull();
    });

    it('shows it to an Olympian, who is one rank away', async () => {
      const { getByText } = await renderWith(payload(41, null, {
        greek_rank: 'Olympian', greek_score: 70, score_rank: 'Olympian',
      }));
      expect(getByText('Top ranks')).toBeTruthy();
    });

    it('shows it to someone already at a gated rank', async () => {
      const { getByText } = await renderWith(payload(84, null, {
        greek_rank: 'Titan', greek_score: 84, score_rank: 'Titan',
      }));
      expect(getByText('Top ranks')).toBeTruthy();
    });

    it('shows it to anyone browsing a gated circle', async () => {
      jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
      const { getAllByText, getByText, queryByText } = await renderWith(payload(41, null, {
        greek_rank: 'Hero', score_rank: 'Hero',
      }));
      expect(queryByText('Top ranks')).toBeNull();
      fireEvent.press(getAllByText('Titan')[0]);
      await waitFor(() => expect(getByText('Top ranks')).toBeTruthy());
    });
  });

  describe('no performance score yet', () => {
    it('points at bodyweight when that is what is missing', async () => {
      const { getByText, nav } = await renderNearTopRanks(payload(null, null, {
        profile_missing: ['bodyweight'],
      }));
      expect(getByText(/log your bodyweight to score your lifts/)).toBeTruthy();
      fireEvent.press(getByText('Log Bodyweight'));
      expect(nav.navigate).toHaveBeenCalledWith('Measurements');
    });

    it('asks for a qualifying lift or run when the profile is complete', async () => {
      const { getByText, queryByText } = await renderNearTopRanks(payload(null, null));
      expect(getByText(/Log a lift that counts toward your Strength Score, or a run/)).toBeTruthy();
      expect(queryByText('Complete Profile')).toBeNull();
      expect(queryByText('Log Bodyweight')).toBeNull();
    });

    it('drops the prompt once a score exists', async () => {
      const { queryByText } = await renderNearTopRanks(payload(41, null));
      expect(queryByText(/Log a lift that counts toward/)).toBeNull();
    });
  });
  describe('score cards', () => {
    it('are only in Top ranks, with no links at the bottom of the screen', async () => {
      const { queryByText } = await renderWith(payload(41, 67));
      expect(queryByText('Strength Score')).toBeNull();
      expect(queryByText('Endurance Score')).toBeNull();
    });

    it('show each percentile, and Counts on the higher', async () => {
      const { getByTestId } = await renderNearTopRanks(payload(41, 67));
      expect(getByTestId('greek-leg-endurance-counts').props.accessibilityLabel)
        .toBe('Endurance Score, 67th percentile, counts toward the top ranks');
      expect(getByTestId('greek-leg-strength').props.accessibilityLabel).toBe('Strength Score, 41st percentile');
    });

    it('still open a score screen with no score yet', async () => {
      const { getByTestId, nav } = await renderNearTopRanks(payload(null, 67));
      fireEvent.press(getByTestId('greek-leg-strength'));
      expect(nav.navigate).toHaveBeenCalledWith('ProgressTab', { screen: 'StrengthScore', initial: false });
    });

    it('opens each score screen', async () => {
      const { getByText, nav } = await renderNearTopRanks(payload(41, 67));
      fireEvent.press(getByText('Strength Score'));
      expect(nav.navigate).toHaveBeenCalledWith('ProgressTab', { screen: 'StrengthScore', initial: false });
      fireEvent.press(getByText('Endurance Score'));
      expect(nav.navigate).toHaveBeenCalledWith('ProgressTab', { screen: 'EnduranceScore', initial: false });
    });

    // The score screens show a free account its score and lock the breakdown
    // themselves, so the links no longer stop at the paywall
    it('opens them for a free account too, with no lock', async () => {
      mockIsPremium = false;
      const { getByText, getByTestId, nav } = await renderNearTopRanks(payload(41, 67));
      fireEvent.press(getByText('Strength Score'));
      expect(nav.navigate).toHaveBeenCalledWith('ProgressTab', { screen: 'StrengthScore', initial: false });
      expect(nav.navigate).not.toHaveBeenCalledWith('Paywall', expect.anything());
      const icons = getByTestId('greek-leg-strength').findAllByType(Ionicons as any);
      expect(icons.map((i: any) => i.props.name)).not.toContain('lock-closed');
    });
  });
});
