import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import { appCache } from '../utils/appCache';
import {
  almostThere, amountText, earnedLine, goalText, milestoneTiles, notYetShownLines, rungProgress, topBadges,
  type AchievementsData, type LadderBadge, type Track,
} from '../utils/achievements';
import AchievementsScreen from '../screens/ProfileTab/AchievementsScreen';
import AchievementTrackScreen from '../screens/ProfileTab/AchievementTrackScreen';
import TrophyHallCard from '../components/achievements/TrophyHallCard';
import BadgeDetailModal from '../components/achievements/BadgeDetailModal';

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
    expect(notYetShownLines(fixture())).toEqual(['Ride distance appears after your first ride.']);
  });

  it('writes amounts and goals in the track’s own terms', () => {
    expect(goalText('workouts', 250, 'any', 'mi')).toBe('250 workouts');
    expect(goalText('streak', 26, 'any', 'mi')).toBe('26 weeks in a row');
    expect(goalText('plates_bench', 315, 'lbs', 'mi')).toBe('315 lbs bench');
    expect(amountText('elevation', 2917, 'any', 'mi')).toBe('9,570 ft');
    expect(amountText('elevation', 2917, 'any', 'km')).toBe('2,917 m');
    expect(earnedLine('workouts_5', 100, 'any', 'mi')).toBe('Your 100th workout');
    expect(earnedLine('feat_century', undefined, 'mi', 'km')).toBe('100 km in one ride');
  });

  it('picks the finest badges for the top of the hall', () => {
    // Both gold: the newer (Oct 13) leads
    expect(topBadges(fixture()).map(b => b.key)).toEqual(['plates_squat_3', 'workouts_5', 'feat_bw_bench']);
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
    expect(getByText('Ride distance appears after your first ride.')).toBeTruthy();
    expect(queryByText('Century')).toBeNull();
    expect(queryByText('Hippeus')).toBeNull();
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

  it('has no buttons but Close on a locked badge', () => {
    const { queryByText, getByText } = render(
      <BadgeDetailModal {...props} onViewWorkout={jest.fn()} onShare={jest.fn()}
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
    act(() => { jest.advanceTimersByTime(300); });
    const back = getByLabelText(/^Back of Phalanx/);
    expect(back.props.accessibilityLabel).toContain('137 workouts so far');
    fireEvent.press(back);
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
