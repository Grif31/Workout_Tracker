import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearWidgetSnapshot, readWidgetSnapshot, writeWidgetGreekRank, writeWidgetScore,
  writeWidgetSnapshot, writeWidgetWeek,
} from '../utils/widgetData';
import { renderWidgets } from '../utils/widgets';
import { USER_KEY, WEEKLY_DISTANCE_GOAL_KEY, WEEKLY_GOAL_KEY } from '../constants/storageKeys';
import { GPS_DISTANCE_UNIT_KEY } from '../utils/units';
import type { GreekRankData } from '../utils/greekRank';

jest.mock('../utils/widgets', () => ({ renderWidgets: jest.fn() }));

const ACCENT = { dark: '#30D158', light: '#1C7F35' };
const logIn = (id: number) => AsyncStorage.setItem(USER_KEY, JSON.stringify({ id }));

beforeEach(async () => {
  await AsyncStorage.clear();
  (renderWidgets as jest.Mock).mockClear();
});

describe('writeWidgetSnapshot', () => {
  it('saves the sections and redraws the widgets from what it saved', async () => {
    await logIn(7);
    await writeWidgetSnapshot(7, { accent: ACCENT });
    const saved = await readWidgetSnapshot();
    expect(saved).toMatchObject({ userId: 7, accent: ACCENT, week: null });
    expect(renderWidgets).toHaveBeenLastCalledWith(saved);
  });

  it('writes nothing for a user who is no longer logged in', async () => {
    // A fetch that resolves after logout must not put the old account back
    await writeWidgetSnapshot(7, { accent: ACCENT });
    await logIn(8);
    await writeWidgetSnapshot(7, { accent: ACCENT });
    expect(await readWidgetSnapshot()).toBeNull();
    expect(renderWidgets).not.toHaveBeenCalled();
  });

  it('keeps both writes when two screens write at once', async () => {
    await logIn(7);
    await Promise.all([
      writeWidgetSnapshot(7, { accent: ACCENT }),
      writeWidgetScore(7, 'strength', { overall: 61.8, overall_rank: { label: 'Advanced' } }),
      writeWidgetScore(7, 'endurance', { overall: 38.2, overall_rank: { label: 'Intermediate' } }),
    ]);
    expect(await readWidgetSnapshot()).toMatchObject({
      accent: ACCENT,
      scores: {
        strength: { percentile: 62, label: 'Advanced' },
        endurance: { percentile: 38, label: 'Intermediate' },
      },
    });
  });
});

describe('clearWidgetSnapshot', () => {
  it('removes the snapshot and draws the logged-out state', async () => {
    await logIn(7);
    await writeWidgetSnapshot(7, { accent: ACCENT });
    await clearWidgetSnapshot();
    expect(await readWidgetSnapshot()).toBeNull();
    expect(renderWidgets).toHaveBeenLastCalledWith(null);
  });
});

describe('writeWidgetWeek', () => {
  const profileStats = { this_week_count: 2, current_streak: 6, week_cardio_distance_km: 20 };

  it('reads the goal, distance goal and GPS unit from that user\'s settings', async () => {
    await logIn(7);
    await AsyncStorage.multiSet([
      [`${WEEKLY_GOAL_KEY}_7`, '4'],
      [`${WEEKLY_DISTANCE_GOAL_KEY}_7`, '24'],
      [`${GPS_DISTANCE_UNIT_KEY}_7`, 'km'],
    ]);
    await writeWidgetWeek(7, { profileStats, allWorkoutDates: [] });
    expect((await readWidgetSnapshot())?.week).toMatchObject({
      goal: 4, workoutCount: 2, streakWeeks: 6, distanceGoalKm: 24, distanceKm: 20, distanceUnit: 'km',
    });
  });

  it('falls back to 3 a week, no distance goal and miles, as the app does', async () => {
    await logIn(7);
    await writeWidgetWeek(7, { profileStats, allWorkoutDates: [] });
    expect((await readWidgetSnapshot())?.week).toMatchObject({ goal: 3, distanceGoalKm: null, distanceUnit: 'mi' });
  });

  it('leaves the stored week alone when either response is missing', async () => {
    await logIn(7);
    await writeWidgetWeek(7, { profileStats: null, allWorkoutDates: [] });
    await writeWidgetWeek(7, { profileStats, allWorkoutDates: null });
    expect(await readWidgetSnapshot()).toBeNull();
  });
});

describe('writeWidgetGreekRank', () => {
  it('ignores a response with no rank', async () => {
    await logIn(7);
    await writeWidgetGreekRank(7, null);
    await writeWidgetGreekRank(7, {} as GreekRankData);
    expect(await readWidgetSnapshot()).toBeNull();
  });
});
