import AsyncStorage from '@react-native-async-storage/async-storage';
import { androidWidgetTaskHandler } from '../widgets/androidWidgetTaskHandler';
import { WIDGET_SNAPSHOT_KEY } from '../constants/storageKeys';
import { buildWeek, mergeSnapshot } from '../utils/widgetSnapshot';

// jest.setup.ts mocks ThemeContext for every test; the widget needs its real palettes.
jest.unmock('../context/ThemeContext');
jest.mock('react-native-android-widget', () => ({
  FlexWidget: 'FlexWidget',
  TextWidget: 'TextWidget',
}));

const widgetInfo = {
  widgetName: 'StreakWidget',
  widgetId: 1,
  width: 110,
  height: 110,
  screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 2, densityDpi: 320 },
};

// The first line the widget draws, in each color scheme.
function drawnText(renderWidget: jest.Mock) {
  const { light, dark } = renderWidget.mock.calls[0][0];
  const first = (el: any) => el.type(el.props).props.children[0].props.text;
  return [first(light), first(dark)];
}

const saveSnapshot = (streakWeeks: number) => AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(
  mergeSnapshot(null, 7, {
    week: buildWeek({
      goal: 3, workoutCount: 1, allWorkoutDates: [], streakWeeks,
      distanceGoalKm: null, distanceKm: 0, distanceUnit: 'mi',
    }, new Date()),
  }, Date.now()),
));

describe('androidWidgetTaskHandler', () => {
  beforeEach(() => AsyncStorage.clear());

  it('draws the streak from the saved snapshot, in both color schemes', async () => {
    await saveSnapshot(7);
    const renderWidget = jest.fn();
    await androidWidgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_ADDED', renderWidget });
    expect(drawnText(renderWidget)).toEqual(['7', '7']);
  });

  it('asks the user to log in when there is no snapshot', async () => {
    const renderWidget = jest.fn();
    await androidWidgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_UPDATE', renderWidget });
    expect(drawnText(renderWidget)).toEqual(['Log in to Aretē', 'Log in to Aretē']);
  });

  it('draws nothing when the widget is removed', async () => {
    const renderWidget = jest.fn();
    await androidWidgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_DELETED', renderWidget });
    expect(renderWidget).not.toHaveBeenCalled();
  });
});
