import AsyncStorage from '@react-native-async-storage/async-storage';
import { androidWidgetTaskHandler } from '../widgets/androidWidgetTaskHandler';
import { ANDROID_WIDGETS } from '../widgets/androidWidgets';
import { WIDGET_SNAPSHOT_KEY } from '../constants/storageKeys';
import { buildGreekRank, buildRoutine, buildWeek, mergeSnapshot, WIDGET_STALE_AFTER_MS, type WidgetSnapshot } from '../utils/widgetSnapshot';
import { upNextStartLink, WIDGET_LINKS } from '../utils/widgetProps';
import type { GreekRankData } from '../utils/greekRank';

// jest.setup.ts mocks ThemeContext for every test; the widgets need its real palettes.
jest.unmock('../context/ThemeContext');
jest.mock('react-native-android-widget', () => ({
  FlexWidget: 'FlexWidget',
  TextWidget: 'TextWidget',
  ImageWidget: 'ImageWidget',
  OverlapWidget: 'OverlapWidget',
  SvgWidget: 'SvgWidget',
}));

type El = { type: unknown; props: Record<string, any> };

// What the library would turn into RemoteViews: our own components expanded,
// then every library element in order.
function expand(node: any): El[] {
  if (node == null || node === false) return [];
  if (Array.isArray(node)) return node.flatMap(expand);
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return [node, ...expand(node.props?.children)];
}
const texts = (el: any) => expand(el).filter(e => e.type === 'TextWidget').map(e => e.props.text);
const root = (el: any) => expand(el)[0];

const NOW = new Date(2026, 8, 24, 21, 30);
const SMALL = { width: 170 };
const MEDIUM = { width: 360 };

const rank = (over: Partial<GreekRankData> = {}) => buildGreekRank({
  greek_rank: 'Hero', greek_score: 41, score_rank: 'Hero', held_by_gate: false, next_gate: null,
  gates: { Titan: 50, 'Aretē': 80 }, components: { consistency: 52, dedication: 38, volume: 29 },
  weights: { consistency: 0.4, dedication: 0.3, volume: 0.3 },
  performance: { strength: 44, endurance: null, best: 44 }, profile_missing: [], ...over,
});
const snapshot = (over: Partial<WidgetSnapshot> = {}) => mergeSnapshot(null, 7, {
  week: buildWeek({
    goal: 3, workoutCount: 2, allWorkoutDates: ['2026-09-21', '2026-09-23'], streakWeeks: 6,
    distanceGoalKm: 24.1402, distanceKm: 20, distanceUnit: 'mi',
  }, NOW),
  greekRank: rank(),
  ...over,
}, NOW.getTime());

const widgetInfo = (widgetName: string, width = 170) => ({
  widgetName, widgetId: 1, width, height: 170,
  screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 2, densityDpi: 320 },
});

describe('Android Weekly Goal', () => {
  it('draws the small layout at 2x2 and the medium one from about 4 cells wide', () => {
    const small = ANDROID_WIDGETS.WeeklyGoal(snapshot(), SMALL, NOW);
    const medium = ANDROID_WIDGETS.WeeklyGoal(snapshot(), MEDIUM, NOW);
    expect(texts(small.dark)).toEqual(expect.arrayContaining(['WEEKLY GOAL', '6', '2', '/3']));
    expect(texts(small.dark)).not.toContain('1 to go');
    expect(texts(medium.dark)).toEqual(expect.arrayContaining(['1 to go', '6 week streak', 'Distance', '12.4 / 15 mi']));
  });

  it('opens Home when tapped', () => {
    expect(root(ANDROID_WIDGETS.WeeklyGoal(snapshot(), SMALL, NOW).light).props)
      .toMatchObject({ clickAction: 'OPEN_URI', clickActionData: { uri: WIDGET_LINKS.home } });
  });

  it('is back to 0 on Monday without the app', () => {
    expect(texts(ANDROID_WIDGETS.WeeklyGoal(snapshot(), MEDIUM, new Date(2026, 8, 28, 0, 30)).dark)).toContain('3 to go');
  });

  it('asks to open the app once the snapshot is a week old', () => {
    const stale = new Date(NOW.getTime() + WIDGET_STALE_AFTER_MS + 1);
    expect(texts(ANDROID_WIDGETS.WeeklyGoal(snapshot(), SMALL, stale).dark)).toContain('Open Aretē to update');
    expect(texts(ANDROID_WIDGETS.WeeklyGoal(snapshot(), MEDIUM, stale).dark)).toContain('Open Aretē to update. Last updated Sep 24.');
  });

  it('draws both color schemes on their own surfaces', () => {
    const { light, dark } = ANDROID_WIDGETS.WeeklyGoal(snapshot(), SMALL, NOW);
    expect(root(light).props.style.backgroundColor).toBe('#FFFFFF');
    expect(root(dark).props.style.backgroundColor).toBe('#1C1C1E');
  });
});

describe('Android Greek Rank', () => {
  it('shows points to the next rank small, and the score\'s parts medium', () => {
    expect(texts(ANDROID_WIDGETS.GreekRank(snapshot(), SMALL, NOW).dark))
      .toEqual(expect.arrayContaining(['GREEK RANK', 'H', 'Hero', '41 points', '7 points to Demigod']));
    expect(texts(ANDROID_WIDGETS.GreekRank(snapshot(), MEDIUM, NOW).dark))
      .toEqual(expect.arrayContaining(['Hero 28', 'Demigod 48', 'Consistency', '52', 'Dedication', 'Volume']));
  });

  it('shows the short gate line small and the full one medium', () => {
    const held = snapshot({ greekRank: rank({ greek_rank: 'Olympian', greek_score: 84, score_rank: 'Titan', held_by_gate: true }) });
    expect(texts(ANDROID_WIDGETS.GreekRank(held, SMALL, NOW).dark)).toContain('Unlock by logging a Strength or Endurance Score');
    expect(texts(ANDROID_WIDGETS.GreekRank(held, MEDIUM, NOW).dark))
      .toContain("Reach the 50th percentile in Strength or Endurance to unlock Titan. You're at the 44th.");
  });

  it('says Excellence at Aretē', () => {
    const top = snapshot({ greekRank: rank({ greek_rank: 'Aretē', greek_score: 95, performance: { strength: 90, endurance: null, best: 90 } }) });
    expect(texts(ANDROID_WIDGETS.GreekRank(top, SMALL, NOW).dark)).toContain('EXCELLENCE');
  });

  it('opens Greek Rank when tapped', () => {
    expect(root(ANDROID_WIDGETS.GreekRank(snapshot(), SMALL, NOW).dark).props.clickActionData).toEqual({ uri: WIDGET_LINKS.greekRank });
  });
});

describe('Android Up Next', () => {
  const ppl = {
    id: 3, name: 'Push Pull Legs', days: [
      { day_order: 1, label: 'Push', workout_template: { exercises: [{ name: 'Bench Press', muscle_group: 'Chest' }] } },
      { day_order: 2, label: 'Pull', workout_template: { exercises: [{ name: 'Deadlift', muscle_group: 'Back' }, { name: 'Curl', muscle_group: 'Biceps' }] } },
    ],
  };
  const svgs = (el: any) => expand(el).filter(e => e.type === 'SvgWidget').map(e => e.props.svg as string);

  it('shows the next day with its muscle diagram, and Start opens it', () => {
    const s = snapshot({ routine: buildRoutine(ppl, ['push'], NOW) });
    for (const info of [SMALL, MEDIUM]) {
      const { dark } = ANDROID_WIDGETS.UpNext(s, info, NOW);
      expect(texts(dark)).toEqual(expect.arrayContaining(['UP NEXT', 'Push Pull Legs', 'Day 2 · Pull', 'Start']));
      expect(root(dark).props.clickActionData).toEqual({ uri: upNextStartLink(3, 1) });
      // The body with the day's muscles lit in the accent
      expect(svgs(dark).some(svg => svg.includes('viewBox="0 0 1448 1448"') && svg.includes('fill="#30D158"'))).toBe(true);
    }
    expect(texts(ANDROID_WIDGETS.UpNext(s, MEDIUM, NOW).dark)).toContain('Deadlift and Curl');
  });

  it('congratulates when every day is done', () => {
    const s = snapshot({ routine: buildRoutine(ppl, ['push', 'pull'], NOW) });
    expect(texts(ANDROID_WIDGETS.UpNext(s, SMALL, NOW).dark)).toEqual(expect.arrayContaining(['Great Job!', 'All 2 Days Complete']));
    expect(texts(ANDROID_WIDGETS.UpNext(s, MEDIUM, NOW).dark)).toContain('Great Job! All 2 Days Complete');
  });

  it('asks for a routine, and opens Coach, when there is none', () => {
    const { light } = ANDROID_WIDGETS.UpNext(snapshot(), SMALL, NOW);
    expect(texts(light)).toContain('Pick a routine');
    expect(root(light).props.clickActionData).toEqual({ uri: WIDGET_LINKS.coach });
  });
});

describe('androidWidgetTaskHandler', () => {
  beforeEach(() => AsyncStorage.clear());

  it('draws each widget from the saved snapshot', async () => {
    await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot()));
    const renderWidget = jest.fn();
    await androidWidgetTaskHandler({ widgetInfo: widgetInfo('GreekRank'), widgetAction: 'WIDGET_ADDED', renderWidget });
    expect(texts(renderWidget.mock.calls[0][0].dark)).toContain('Hero');
  });

  it('asks the user to log in when there is no snapshot', async () => {
    const renderWidget = jest.fn();
    await androidWidgetTaskHandler({ widgetInfo: widgetInfo('WeeklyGoal', 360), widgetAction: 'WIDGET_UPDATE', renderWidget });
    const { light, dark } = renderWidget.mock.calls[0][0];
    expect(texts(light)[0]).toBe('Log in to Aretē');
    expect(texts(dark)[0]).toBe('Log in to Aretē');
  });

  it('draws nothing for a removed widget or one it doesn\'t know', async () => {
    const renderWidget = jest.fn();
    await androidWidgetTaskHandler({ widgetInfo: widgetInfo('WeeklyGoal'), widgetAction: 'WIDGET_DELETED', renderWidget });
    await androidWidgetTaskHandler({ widgetInfo: widgetInfo('StreakWidget'), widgetAction: 'WIDGET_UPDATE', renderWidget });
    expect(renderWidget).not.toHaveBeenCalled();
  });
});
