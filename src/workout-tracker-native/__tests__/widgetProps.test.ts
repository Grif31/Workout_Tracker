import {
  greekRankProps, ordinal, weeklyGoalProps, widgetRouteFor, widgetTimelineDates, WIDGET_LINKS,
} from '../utils/widgetProps';
import { buildGreekRank, buildWeek, mergeSnapshot, WIDGET_STALE_AFTER_MS } from '../utils/widgetSnapshot';
import type { GreekRankData } from '../utils/greekRank';

// jest.setup.ts mocks ThemeContext for every test; the default accent comes from its real presets.
jest.unmock('../context/ThemeContext');

const IMAGES = { logoDark: 'file:///d.png', logoLight: 'file:///l.png' };
const THU = new Date(2026, 8, 24, 21, 30);
const NEXT_MON = new Date(2026, 8, 28, 0, 0);

const week = (over = {}) => buildWeek({
  goal: 3, workoutCount: 2, allWorkoutDates: ['2026-09-21', '2026-09-23'], streakWeeks: 6,
  distanceGoalKm: null, distanceKm: 20, distanceUnit: 'mi', ...over,
}, THU);

const rankData = (over: Partial<GreekRankData> = {}): GreekRankData => ({
  greek_rank: 'Hero', greek_score: 41, score_rank: 'Hero', held_by_gate: false, next_gate: null,
  gates: { Titan: 50, 'Aretē': 80 }, components: { consistency: 52, dedication: 38, volume: 29 },
  weights: { consistency: 0.4, dedication: 0.3, volume: 0.3 },
  performance: { strength: 44, endurance: null, best: 44 }, profile_missing: [], ...over,
});
const snap = (sections: object) => mergeSnapshot(null, 7, sections, THU.getTime());

describe('weeklyGoalProps', () => {
  it('counts down to the goal and names the lock screen line', () => {
    const p = weeklyGoalProps(snap({ week: week() }), THU, IMAGES);
    expect(p).toMatchObject({ done: 2, goal: 3, remainingLabel: '1 to go', inlineLabel: '2 of 3 workouts this week', streakWeeks: 6 });
    expect(p.days.map(d => d.trained)).toEqual([true, false, true, false, false, false, false]);
    expect(p.days[3].today).toBe(true);
  });

  it('says the goal is met, and uses the singular for a goal of 1', () => {
    expect(weeklyGoalProps(snap({ week: week({ goal: 1, workoutCount: 1 }) }), THU, IMAGES))
      .toMatchObject({ goalMet: true, remainingLabel: 'Goal met', inlineLabel: '1 of 1 workout this week' });
  });

  it('shows the distance goal in the GPS unit, as the Coach card does', () => {
    const p = weeklyGoalProps(snap({ week: week({ distanceGoalKm: 24.1402 }) }), THU, IMAGES);
    expect(p.distance).toEqual({ label: '12.4 / 15 mi', fill: 12.4 / 15 });
  });

  it('is back to 0 on Monday, drawn from the same snapshot', () => {
    expect(weeklyGoalProps(snap({ week: week() }), NEXT_MON, IMAGES)).toMatchObject({ done: 0, remainingLabel: '3 to go' });
  });

  it('is stale a week after the last update, and says when that was', () => {
    const p = weeklyGoalProps(snap({ week: week() }), new Date(THU.getTime() + WIDGET_STALE_AFTER_MS + 1), IMAGES);
    expect(p.stale).toBe(true);
    expect(p.staleLabel).toBe('Open Aretē to update. Last updated Sep 24.');
  });

  it('has a logged-out state with no snapshot', () => {
    expect(weeklyGoalProps(null, THU, IMAGES)).toMatchObject({ loggedIn: false, hasWeek: false });
  });

  it('uses the stored accent, or the default green', () => {
    expect(weeklyGoalProps(snap({ week: week(), accent: { dark: '#007AFF', light: '#006BE0' } }), THU, IMAGES))
      .toMatchObject({ accentDark: '#007AFF', accentLight: '#006BE0' });
    expect(weeklyGoalProps(snap({ week: week() }), THU, IMAGES)).toMatchObject({ accentDark: '#30D158', accentLight: '#1C7F35' });
  });
});

describe('greekRankProps', () => {
  it('shows points to the next rank and the band\'s ends', () => {
    const p = greekRankProps(snap({ greekRank: buildGreekRank(rankData()) }), THU, IMAGES);
    expect(p).toMatchObject({
      rank: 'Hero', letter: 'H', pointsLabel: '41 points', smallCaption: '7 points to Demigod',
      bandLowLabel: 'Hero 28', bandHighLabel: 'Demigod 48', headline: 'Hero · 41', isTop: false, gateDetail: null,
    });
  });

  it('uses readable text colors on each background, not the badge color', () => {
    const p = greekRankProps(snap({ greekRank: buildGreekRank(rankData({ greek_rank: 'Olympian', greek_score: 70, score_rank: 'Olympian' })) }), THU, IMAGES);
    expect(p).toMatchObject({ color: '#9C27B0', textDark: '#CE82E0', textLight: '#8E24AA' });
  });

  it('shortens a held gate to one line on the small widget, and gives the medium the detail', () => {
    const p = greekRankProps(snap({
      greekRank: buildGreekRank(rankData({ greek_rank: 'Olympian', greek_score: 84, score_rank: 'Titan', held_by_gate: true })),
    }), THU, IMAGES);
    expect(p.smallCaption).toBe('Unlock by logging a Strength or Endurance Score');
    expect(p.pointsLabel).toBe('84 points, enough for Titan');
    expect(p.gateDetail).toBe("Reach the 50th percentile in Strength or Endurance to unlock Titan. You're at the 44th.");
  });

  it('says Excellence at Aretē, with no next rank', () => {
    const p = greekRankProps(snap({
      greekRank: buildGreekRank(rankData({ greek_rank: 'Aretē', greek_score: 95, performance: { strength: 90, endurance: null, best: 90 } })),
    }), THU, IMAGES);
    expect(p).toMatchObject({ isTop: true, smallCaption: 'Excellence', gateDetail: null, bandHighLabel: '' });
  });

  it('has a logged-out state with no snapshot', () => {
    expect(greekRankProps(null, THU, IMAGES)).toMatchObject({ loggedIn: false, hasRank: false });
  });
});

describe('ordinal', () => {
  it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [22, '22nd'], [44, '44th'], [62, '62nd'], [73, '73rd']])(
    '%i is %s', (n, s) => expect(ordinal(n)).toBe(s),
  );
});

describe('widgetTimelineDates', () => {
  it('redraws now, at the Monday rollover and when the snapshot goes stale', () => {
    const s = snap({});
    expect(widgetTimelineDates(s, THU).map(d => d.getTime())).toEqual([
      THU.getTime(), NEXT_MON.getTime(), THU.getTime() + WIDGET_STALE_AFTER_MS + 1,
    ]);
  });

  it('leaves out a moment already past', () => {
    const s = mergeSnapshot(null, 7, {}, THU.getTime() - WIDGET_STALE_AFTER_MS * 2);
    expect(widgetTimelineDates(s, THU)).toEqual([THU, NEXT_MON]);
  });

  it('has only now when logged out', () => {
    expect(widgetTimelineDates(null, THU)).toEqual([THU]);
  });
});

describe('widgetRouteFor', () => {
  it('routes each widget link, trailing slash or query and all', () => {
    expect(widgetRouteFor(WIDGET_LINKS.home)).toEqual({ tab: 'DashboardTab' });
    expect(widgetRouteFor(`${WIDGET_LINKS.greekRank}/?from=widget`)).toEqual({ tab: 'ProfileTab', screen: 'GreekRank' });
  });

  it('ignores links that aren\'t a widget\'s', () => {
    expect(widgetRouteFor('aretefitness://reset-password?token=x')).toBeNull();
    expect(widgetRouteFor(null)).toBeNull();
  });
});
