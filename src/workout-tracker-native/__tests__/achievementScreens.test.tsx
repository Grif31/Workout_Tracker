import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import { appCache } from '../utils/appCache';
import {
  almostThere, amountText, earnedLine, goalText, milestoneTiles, notYetShown, orderUnlocks, rungProgress,
  shareLine, showcaseBadges, topBadges, unlockLine,
  type AchievementsData, type LadderBadge, type NewAchievement, type Track,
} from '../utils/achievements';
import AchievementsScreen from '../screens/ProfileTab/AchievementsScreen';
import AchievementTrackScreen from '../screens/ProfileTab/AchievementTrackScreen';
import TrophyHallCard from '../components/achievements/TrophyHallCard';
import BadgeDetailModal from '../components/achievements/BadgeDetailModal';
import AchievementUnlockSheet from '../components/achievements/AchievementUnlockSheet';
import { captureAndShare } from '../utils/shareCapture';
import { setReduceMotionForTests } from '../utils/motion';

jest.mock('../utils/shareCapture', () => ({ captureAndShare: jest.fn() }));
jest.mock('react-native-confetti-cannon', () => () => null);
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(), impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' }, ImpactFeedbackStyle: { Heavy: 'heavy', Medium: 'medium', Light: 'light' },
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const React = require('react');
  return { ...actual, useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), []) };
});

const unearned = { earned: false, earned_at: null, workout_id: null, workout_name: null, workout_cardio: false, seen: true };
const earnedOn = (date: string, workout_id = 7, extra = {}) => ({
  earned: true, earned_at: `${date}T00:00:00`, workout_id, workout_name: 'Push Day', workout_cardio: false, seen: true, ...extra,
});

function ladder(track: string, label: string, unit: string, thresholds: number[], titles: string[], value: number, earnedDates: string[], extra: Partial<Track> = {}): Track {
  const badges: LadderBadge[] = thresholds.map((t, i) => ({
    key: `${track}_${i + 1}`, rung: i + 1, title: titles[i], threshold: t,
    ...(earnedDates[i] ? earnedOn(earnedDates[i]) : unearned),
  }));
  const nextB = badges.find(b => !b.earned);
  return {
    track, label, group: null, unit, value, visible: true,
    earned_count: badges.filter(b => b.earned).length, total: badges.length, badges,
    next: nextB ? { key: nextB.key, title: nextB.title, threshold: nextB.threshold, remaining: nextB.threshold - value } : null,
    ...extra,
  };
}

function fixture(): AchievementsData {
  const workouts = ladder('workouts', 'Workouts', 'any', [1, 10, 25, 50, 100, 250, 500, 1000],
    ['Ephebe', 'Palaestra', 'Gymnasion', 'Hoplite', 'Hekaton', 'Phalanx', 'Spartan', 'Chiliad'], 137,
    ['2026-02-02', '2026-02-20', '2026-03-24', '2026-05-09', '2026-09-28']);
  workouts.badges[4].seen = false;
  const prs = ladder('prs', 'PRs', 'any', [1, 25, 100, 250, 500, 1000, 2500, 5000],
    ['First PR', '25 PRs', '100 PRs', '250 PRs', '500 PRs', '1,000 PRs', '2,500 PRs', '5,000 PRs'], 439,
    ['2026-02-02', '2026-03-01', '2026-05-01', '2026-08-01']);
  const ride = ladder('ride', 'Ride', 'mi', [25, 100, 250, 500, 1000, 2500, 5000],
    ['Hippeus', 'Hippodrome', 'Quadriga', 'Pegasus', 'Helios', 'Okeanos', 'Oikoumene'], 0, [], { visible: false });
  const bench = ladder('plates_bench', 'Bench', 'lbs', [135, 225, 315, 405],
    ['1 Plate Bench', '2 Plate Bench', '3 Plate Bench', '4 Plate Bench'], 245, ['2026-02-09', '2026-06-30'], { group: 'plates' });
  const squat = ladder('plates_squat', 'Squat', 'lbs', [135, 225, 315, 405],
    ['1 Plate Squat', '2 Plate Squat', '3 Plate Squat', '4 Plate Squat'], 335, ['2026-02-04', '2026-04-21', '2026-10-13'], { group: 'plates' });
  const dead = ladder('plates_deadlift', 'Deadlift', 'lbs', [135, 225, 315, 405],
    ['1 Plate Deadlift', '2 Plate Deadlift', '3 Plate Deadlift', '4 Plate Deadlift'], 0, [], { group: 'plates', visible: false });
  return {
    weight_unit: 'lbs', distance_unit: 'mi', earned_count: 16, total_count: 40,
    tracks: [workouts, prs, ride, bench, squat, dead],
    feats: [
      { key: 'feat_bw_bench', title: 'Bodyweight Bench', visible: true, ...earnedOn('2026-06-30') },
      { key: 'feat_marathon', title: 'Marathon', visible: true, ...unearned },
      { key: 'feat_century', title: 'Century', visible: false, ...unearned },
    ],
    hidden: [{ key: 'hidden_neomenia', title: 'Neomenia', ...earnedOn('2026-01-01', 3, { workout_cardio: true }) }],
    hidden_remaining: 5,
    unseen: ['workouts_5'],
    pinned: [],
    pins_saved: false,
  };
}

function mockApi(data: AchievementsData) {
  (global.fetch as jest.Mock) = jest.fn((url: string) => Promise.resolve({
    ok: true, status: 200, json: () => Promise.resolve(url.includes('/seen') ? { message: 'ok' } : data),
  }));
}

beforeEach(() => appCache.clear());

describe('achievement helpers', () => {
  it('measures progress within the current rung, not from zero', () => {
    const prs = fixture().tracks[1];
    expect(rungProgress(prs)).toBeCloseTo((439 - 250) / 250);
  });

  it('puts the closest badges first, and only what the user trains', () => {
    const close = almostThere(fixture());
    // PRs 76% through 250 to 500, Workouts 25% through 100 to 250, Bench 22% through 225 to 315
    expect(close.map(t => t.track)).toEqual(['prs', 'workouts', 'plates_bench']);
    expect(close.every(t => t.visible)).toBe(true);
    expect(close.find(t => t.track === 'ride')).toBeUndefined();
  });

  it('draws the three lifts as one Plates tile with the most plates earned', () => {
    const tiles = milestoneTiles(fixture());
    expect(tiles.map(t => t.id)).toEqual(['workouts', 'prs', 'plates']);
    const plates = tiles.find(t => t.id === 'plates')!;
    expect(plates.badge.key).toBe('plates_squat_3');
    expect([plates.earned, plates.total]).toEqual([5, 8]);
  });

  it('says why an untrained track is missing', () => {
    expect(notYetShown(fixture())).toEqual([
      { track: 'ride', label: 'Ride', trigger: 'After your first ride', line: 'Ride distance appears after your first ride.' },
    ]);
  });

  it('writes amounts and goals in the track’s own terms', () => {
    expect(goalText('workouts', 250, 'any', 'mi')).toBe('250 workouts');
    expect(goalText('streak', 26, 'any', 'mi')).toBe('26 weeks in a row');
    expect(goalText('plates_bench', 315, 'lbs', 'mi')).toBe('315 lbs bench');
    expect(amountText('elevation', 2917, 'any', 'mi')).toBe('9,570 ft');
    // Under an hour to go reads as minutes, never "0.5 hours"
    expect(amountText('hours', 0.5, 'any', 'mi')).toBe('30 minutes');
    expect(amountText('hours', 1, 'any', 'mi')).toBe('1 hour');
    expect(amountText('elevation', 2917, 'any', 'km')).toBe('2,917 m');
    expect(earnedLine('workouts_5', 100, 'any', 'mi')).toBe('Your 100th workout');
    expect(earnedLine('feat_century', undefined, 'mi', 'km')).toBe('100 km in one ride');
  });

  it('picks the finest badges for the top of the hall', () => {
    // Both gold: the newer (Oct 13) leads
    expect(topBadges(fixture()).map(b => b.key)).toEqual(['plates_squat_3', 'workouts_5', 'feat_bw_bench']);
  });
});

describe('pinned badges', () => {
  it('shows the finest three until the user picks, then exactly the pins in order', () => {
    expect(showcaseBadges(fixture()).map(b => b.key)).toEqual(['plates_squat_3', 'workouts_5', 'feat_bw_bench']);
    const picked = { ...fixture(), pins_saved: true, pinned: ['hidden_neomenia', 'prs_1'] };
    expect(showcaseBadges(picked).map(b => b.key)).toEqual(['hidden_neomenia', 'prs_1']);
    expect(showcaseBadges({ ...fixture(), pins_saved: true, pinned: [] })).toEqual([]);
  });

});

describe('unlock helpers', () => {
  const hekaton: NewAchievement = {
    key: 'workouts_5', kind: 'ladder', title: 'Hekaton', earned_at: '2026-09-28T18:00:00', workout_id: 9,
    track: 'workouts', rung: 5, of: 8, threshold: 100, unit: 'any', next: { title: 'Phalanx', threshold: 250 },
  };
  const firstPr: NewAchievement = {
    key: 'prs_1', kind: 'ladder', title: 'First PR', earned_at: '2026-09-28T18:00:00', workout_id: 9,
    track: 'prs', rung: 1, of: 8, threshold: 1, unit: 'any', next: { title: '25 PRs', threshold: 25 },
  };
  const nostos: NewAchievement = { key: 'feat_nostos', kind: 'feat', title: 'Nostos', earned_at: '2026-09-28T18:00:00', workout_id: 9 };

  it('leads with the finest new badge, not the first the server lists', () => {
    expect(orderUnlocks([firstPr, hekaton]).map(a => a.key)).toEqual(['workouts_5', 'prs_1']);
    // Gold feat against a gold rung: the newer one leads
    expect(orderUnlocks([hekaton, nostos])[0].key).toBe('feat_nostos');
  });

  it('says what it took and what comes next, in one line', () => {
    expect(unlockLine(hekaton, 'mi')).toBe('Your 100th workout logged. Next: Phalanx, at 250.');
    expect(unlockLine(nostos, 'mi')).toBe('Back at it.');
    const volume: NewAchievement = {
      key: 'volume_5', kind: 'ladder', title: 'Half Million', earned_at: '2026-09-28T18:00:00', workout_id: 9,
      track: 'volume', rung: 5, of: 8, threshold: 500000, unit: 'kg', next: { title: 'Atlas', threshold: 1000000 },
    };
    expect(unlockLine(volume, 'km')).toBe('500,000 kg lifted, all time. Next: Atlas, at 1,000,000 kg.');
    expect(unlockLine({ ...hekaton, key: 'workouts_8', title: 'Chiliad', threshold: 1000, next: null }, 'mi')).toBe('Your 1,000th workout logged.');
  });

  it('dates the share line with the workout, without a doubled stop', () => {
    expect(shareLine('workouts_5', 100, 'any', 'mi', '2026-09-28T23:30:00')).toBe('Your 100th workout · Sep 28, 2026');
    expect(shareLine('feat_nostos', undefined, 'mi', 'mi', '2026-09-28T00:00:00')).toBe('Back at it · Sep 28, 2026');
  });
});

describe('AchievementUnlockSheet', () => {
  const items: NewAchievement[] = [
    { key: 'prs_1', kind: 'ladder', title: 'First PR', earned_at: '2026-09-28T18:00:00', workout_id: 9,
      track: 'prs', rung: 1, of: 8, threshold: 1, unit: 'any', next: { title: '25 PRs', threshold: 25 } },
    { key: 'workouts_5', kind: 'ladder', title: 'Hekaton', earned_at: '2026-09-28T18:00:00', workout_id: 9,
      track: 'workouts', rung: 5, of: 8, threshold: 100, unit: 'any', next: { title: 'Phalanx', threshold: 250 } },
  ];
  beforeEach(() => setReduceMotionForTests(true));
  afterEach(() => setReduceMotionForTests(false));

  it('opens on the finest badge, with the rest a swipe away and no ladder count', () => {
    const { getAllByText, getByText, queryByText, getByLabelText } = render(
      <AchievementUnlockSheet items={items} visible weightUnit="lbs" distanceUnit="mi" reduceMotion onClose={jest.fn()} onOpenTrophyHall={jest.fn()} />,
    );
    expect(getByText('Hekaton')).toBeTruthy();
    expect(getByText('Your 100th workout logged. Next: Phalanx, at 250.')).toBeTruthy();
    expect(getByText('2 ACHIEVEMENTS UNLOCKED')).toBeTruthy();
    expect(getByLabelText('Badge 1 of 2')).toBeTruthy();
    // Every badge has its own page in the pager, in order
    expect(getByText('First PR')).toBeTruthy();
    // The off-screen share card, hidden from screen readers behind the modal sheet
    expect(getAllByText('Your 100th workout · Sep 28, 2026', { includeHiddenElements: true })).toHaveLength(1);
    expect(queryByText(/of 8/)).toBeNull();
  });

  it('sets the badge down with a thud, even under Reduce Motion where nothing moves', async () => {
    const Haptics = require('expo-haptics');
    Haptics.impactAsync.mockClear();
    render(<AchievementUnlockSheet items={items} visible weightUnit="lbs" distanceUnit="mi" reduceMotion onClose={jest.fn()} onOpenTrophyHall={jest.fn()} />);
    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy'));
  });

  it('follows the swipe: the next badge is set down, and Share and the heading go with it', async () => {
    const Haptics = require('expo-haptics');
    const { getByTestId, getByLabelText, getAllByText } = render(
      <AchievementUnlockSheet items={items} visible weightUnit="lbs" distanceUnit="mi" reduceMotion onClose={jest.fn()} onOpenTrophyHall={jest.fn()} />,
    );
    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy'));
    Haptics.impactAsync.mockClear();
    const pager = getByTestId('unlock-pager');
    fireEvent(pager, 'layout', { nativeEvent: { layout: { width: 350, height: 300, x: 0, y: 0 } } });
    fireEvent(pager, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 350, y: 0 } } });
    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalledWith('medium'));
    expect(getByLabelText('Badge 2 of 2')).toBeTruthy();
    expect(getByLabelText('Share First PR')).toBeTruthy();
    // The off-screen share card now draws the badge on show
    expect(getAllByText('First PR', { includeHiddenElements: true }).length).toBeGreaterThan(1);
  });

  it('jumps to a badge from its dot, and sets each down only once', async () => {
    const Haptics = require('expo-haptics');
    const { getByTestId, getByLabelText } = render(
      <AchievementUnlockSheet items={items} visible weightUnit="lbs" distanceUnit="mi" reduceMotion onClose={jest.fn()} onOpenTrophyHall={jest.fn()} />,
    );
    // Only the second badge thuds 'medium'; a straggling 'heavy' from an earlier test's sheet doesn't count
    const secondLandings = () => Haptics.impactAsync.mock.calls.filter((c: string[]) => c[0] === 'medium').length;
    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy'));
    Haptics.impactAsync.mockClear();
    fireEvent.press(getByTestId('unlock-dot-1'));
    await waitFor(() => expect(getByLabelText('Badge 2 of 2')).toBeTruthy());
    await waitFor(() => expect(secondLandings()).toBe(1));
    fireEvent.press(getByTestId('unlock-dot-0'));
    fireEvent.press(getByTestId('unlock-dot-1'));
    await new Promise(r => setTimeout(r, 50));
    expect(secondLandings()).toBe(1);
  });

  it('has no pager dots for a single badge', () => {
    const { getByText, queryByLabelText } = render(
      <AchievementUnlockSheet items={[items[1]]} visible weightUnit="lbs" distanceUnit="mi" reduceMotion onClose={jest.fn()} onOpenTrophyHall={jest.fn()} />,
    );
    expect(getByText('ACHIEVEMENT UNLOCKED')).toBeTruthy();
    expect(queryByLabelText(/^Badge \d of/)).toBeNull();
  });

  it('opens the Trophy Hall once the sheet has closed', async () => {
    const order: string[] = [];
    const { getByText } = render(
      <AchievementUnlockSheet
        items={items} visible weightUnit="lbs" distanceUnit="mi" reduceMotion
        onClose={() => order.push('close')} onOpenTrophyHall={() => order.push('hall')}
      />,
    );
    fireEvent.press(getByText('See your Trophy Hall'));
    await waitFor(() => expect(order).toEqual(['close', 'hall']));
  });

  it('shares the lead badge and closes on Continue', async () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <AchievementUnlockSheet items={items} visible weightUnit="lbs" distanceUnit="mi" reduceMotion onClose={onClose} onOpenTrophyHall={jest.fn()} />,
    );
    fireEvent.press(getByText('Share'));
    expect(captureAndShare).toHaveBeenCalledWith(expect.anything(), 'Share your badge');
    fireEvent.press(getByText('Continue'));
    // After the slide away, which Reduce Motion makes instant
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('AchievementsScreen', () => {
  it('shows each section, the hidden count, and never an untrained track', async () => {
    mockApi(fixture());
    const nav = createMockNavigation();
    const { findByText, getByText, queryByText, getAllByLabelText } = render(
      <AchievementsScreen navigation={nav as any} route={createMockRoute('Achievements') as any} />,
    );
    expect(await findByText('16 of 40 earned')).toBeTruthy();
    expect(getByText('Almost there')).toBeTruthy();
    expect(getByText('Milestones')).toBeTruthy();
    expect(getByText('1 found · 5 to find')).toBeTruthy();
    expect(getAllByLabelText('Hidden badge, not found yet')).toHaveLength(5);
    expect(queryByText('Century')).toBeNull();
    expect(queryByText('Hippeus')).toBeNull();
  });

  it('lists untrained tracks under Still to discover, explaining one on a tap', async () => {
    mockApi(fixture());
    const { findByText, getByText, queryByText, getByLabelText } = render(
      <AchievementsScreen navigation={createMockNavigation() as any} route={createMockRoute('Achievements') as any} />,
    );
    expect(await findByText('Still to discover')).toBeTruthy();
    expect(getByText('RIDE')).toBeTruthy();
    expect(getByText('After your first ride')).toBeTruthy();
    expect(queryByText('Ride distance appears after your first ride.')).toBeNull();
    fireEvent.press(getByLabelText('Ride distance appears after your first ride.'));
    expect(getByText('Ride distance appears after your first ride.')).toBeTruthy();
  });

  it('sets each top badge down with a light tap', async () => {
    const Haptics = require('expo-haptics');
    Haptics.impactAsync.mockClear();
    setReduceMotionForTests(true);
    mockApi(fixture());
    render(<AchievementsScreen navigation={createMockNavigation() as any} route={createMockRoute('Achievements') as any} />);
    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalledTimes(3), { timeout: 3000 });
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    setReduceMotionForTests(false);
  });

  it('tells the server the new badges were seen, but keeps their dot for this visit', async () => {
    mockApi(fixture());
    const nav = createMockNavigation();
    const { findByLabelText } = render(<AchievementsScreen navigation={nav as any} route={createMockRoute('Achievements') as any} />);
    expect(await findByLabelText('Hekaton, earned September 28, new')).toBeTruthy();
    await waitFor(() => {
      const seen = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).includes('/api/achievements/seen'));
      expect(JSON.parse(seen[1].body)).toEqual({ keys: ['workouts_5'] });
    });
  });

  it('opens a track from its Milestones tile', async () => {
    mockApi(fixture());
    const nav = createMockNavigation();
    const { findByLabelText } = render(<AchievementsScreen navigation={nav as any} route={createMockRoute('Achievements') as any} />);
    fireEvent.press(await findByLabelText('Plates: 3 Plate Squat, 5 of 8 earned'));
    expect(nav.navigate).toHaveBeenCalledWith('AchievementTrack', { track: 'plates' });
  });
});

describe('AchievementTrackScreen', () => {
  it('shows the next badge, how far along, and every rung', async () => {
    mockApi(fixture());
    const nav = createMockNavigation();
    const { findByText, getByText, getAllByText } = render(
      <AchievementTrackScreen navigation={nav as any} route={createMockRoute('AchievementTrack', { track: 'workouts' }) as any} />,
    );
    expect(await findByText('5 of 8')).toBeTruthy();
    expect(getByText('NEXT')).toBeTruthy();
    expect(getByText('137 workouts so far · 113 workouts to go')).toBeTruthy();
    expect(getAllByText('Chiliad').length).toBeGreaterThan(0);
    expect(getByText('Sep 28, 2026')).toBeTruthy();
  });

  it('shows plates per lift the user trains, with their best', async () => {
    mockApi(fixture());
    const nav = createMockNavigation();
    const { findByText, getByText, queryByText } = render(
      <AchievementTrackScreen navigation={nav as any} route={createMockRoute('AchievementTrack', { track: 'plates' }) as any} />,
    );
    expect(await findByText('Best 245 lbs')).toBeTruthy();
    expect(getByText('Best 335 lbs')).toBeTruthy();
    expect(queryByText('Deadlift')).toBeNull();
  });
});

describe('BadgeDetailModal', () => {
  const props = { weightUnit: 'lbs', distanceUnit: 'mi' as const, onClose: jest.fn() };

  it('offers the workout for an earned badge and opens the cardio screen for a cardio one', () => {
    const onViewWorkout = jest.fn();
    const neo = fixture().hidden[0];
    const { getByText } = render(
      <BadgeDetailModal {...props} onViewWorkout={onViewWorkout}
        detail={{ key: neo.key, title: neo.title, unit: 'mi', state: neo }} />,
    );
    fireEvent.press(getByText('View Workout'));
    expect(onViewWorkout).toHaveBeenCalledWith(3, true);
  });

  it('shares an earned badge on its own card', () => {
    (captureAndShare as jest.Mock).mockClear();
    const neo = fixture().hidden[0];
    const { getByText } = render(
      <BadgeDetailModal {...props} detail={{ key: neo.key, title: neo.title, unit: 'mi', state: neo }} />,
    );
    expect(getByText('A workout on New Year’s Day · Jan 1, 2026')).toBeTruthy();
    expect(getByText('Excellence, logged.')).toBeTruthy();
    fireEvent.press(getByText('Share'));
    expect(captureAndShare).toHaveBeenCalledTimes(1);
  });

  it('has no buttons but Close on a locked badge', () => {
    const { queryByText, getByText } = render(
      <BadgeDetailModal {...props} onViewWorkout={jest.fn()}
        detail={{ key: 'workouts_6', title: 'Phalanx', threshold: 250, unit: 'any', value: 137, state: { ...unearned } }} />,
    );
    expect(queryByText('View Workout')).toBeNull();
    expect(queryByText('Share')).toBeNull();
    expect(getByText('Close')).toBeTruthy();
  });

  it('turns over on a tap', () => {
    jest.useFakeTimers();
    const { getByLabelText } = render(
      <BadgeDetailModal {...props}
        detail={{ key: 'workouts_6', title: 'Phalanx', threshold: 250, unit: 'any', value: 137, state: { ...unearned } }} />,
    );
    // Face up first, long enough to be seen
    act(() => { jest.advanceTimersByTime(400); });
    expect(getByLabelText('Phalanx, locked, 137 of 250')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(300); });
    const back = getByLabelText(/^Back of Phalanx/);
    expect(back.props.accessibilityLabel).toContain('137 workouts so far');
    fireEvent.press(back);
    expect(getByLabelText('Phalanx, locked, 137 of 250')).toBeTruthy();
    jest.useRealTimers();
  });
});

describe('BadgeDetailModal reopened', () => {
  it('opens the next badge face up, never on the last badge back', () => {
    jest.useFakeTimers();
    const detail = { key: 'workouts_6', title: 'Phalanx', threshold: 250, unit: 'any', value: 137, state: { ...unearned } };
    const props = { weightUnit: 'lbs', distanceUnit: 'mi' as const, onClose: jest.fn() };
    const { getByLabelText, rerender } = render(<BadgeDetailModal {...props} detail={detail} />);
    act(() => { jest.advanceTimersByTime(700); });
    expect(getByLabelText(/^Back of Phalanx/)).toBeTruthy();
    rerender(<BadgeDetailModal {...props} detail={null} />);
    rerender(<BadgeDetailModal {...props} detail={{ ...detail }} />);
    expect(getByLabelText('Phalanx, locked, 137 of 250')).toBeTruthy();
    jest.useRealTimers();
  });
});

describe('TrophyHallCard', () => {
  it('shows the count and the newest badges, and opens the hall', async () => {
    mockApi(fixture());
    const onOpen = jest.fn();
    const { findByLabelText } = render(<TrophyHallCard onOpen={onOpen} />);
    fireEvent.press(await findByLabelText('Trophy Hall, 16 of 40 earned, 1 new'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('shows nothing until it has data', () => {
    (global.fetch as jest.Mock) = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    const { toJSON } = render(<TrophyHallCard onOpen={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });
});

// Last: the Hall's set-down timers would otherwise land in the unlock sheet's haptic counts
describe('pinning from the Trophy Hall', () => {
  it('pins from the Trophy Hall, in the order tapped', async () => {
    mockApi(fixture());
    const { findByLabelText, getByLabelText, getByText, findByText } = render(
      <AchievementsScreen navigation={createMockNavigation() as any} route={createMockRoute('Achievements') as any} />,
    );
    fireEvent.press(await findByLabelText('Change pinned badges'));
    // Opens on what's shown: the finest three, so a fourth can't be added
    expect(getByLabelText('Neomenia').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(getByLabelText('3 Plate Squat, pinned 1 of 3'));
    fireEvent.press(getByLabelText('Hekaton, pinned 1 of 3'));
    fireEvent.press(getByLabelText('Neomenia'));
    expect(getByLabelText('Neomenia, pinned 2 of 3')).toBeTruthy();
    fireEvent.press(getByText('Save'));
    await waitFor(() => {
      const put = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).includes('/api/achievements/pins'));
      expect(put[1].method).toBe('PUT');
      expect(JSON.parse(put[1].body)).toEqual({ keys: ['feat_bw_bench', 'hidden_neomenia'] });
    });
    expect(await findByText('Pinned to your profile')).toBeTruthy();
  });
});

describe('pinned badges, failed save', () => {
  it('says so inside the sheet and keeps the picks, rather than closing', async () => {
    const data = fixture();
    (global.fetch as jest.Mock) = jest.fn((url: string, init?: { method?: string }) => Promise.resolve(
      init?.method === 'PUT'
        ? { ok: false, status: 404, json: () => Promise.resolve({}) }
        : { ok: true, status: 200, json: () => Promise.resolve(url.includes('/seen') ? { message: 'ok' } : data) },
    ));
    const { findByLabelText, getByLabelText, getByText, findByText } = render(
      <AchievementsScreen navigation={createMockNavigation() as any} route={createMockRoute('Achievements') as any} />,
    );
    fireEvent.press(await findByLabelText('Change pinned badges'));
    fireEvent.press(getByLabelText('3 Plate Squat, pinned 1 of 3'));
    fireEvent.press(getByText('Save'));
    expect(await findByText('Your pinned badges weren’t saved. Try again.')).toBeTruthy();
    expect(getByLabelText('Hekaton, pinned 1 of 3')).toBeTruthy();
  });
});
