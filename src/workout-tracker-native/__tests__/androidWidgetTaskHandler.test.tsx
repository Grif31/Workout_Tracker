import AsyncStorage from '@react-native-async-storage/async-storage';
import { androidWidgetTaskHandler } from '../widgets/androidWidgetTaskHandler';
import { STREAK_WIDGET_KEY } from '../constants/storageKeys';

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

// The number the widget draws: the first TextWidget in each color scheme.
function drawnWeeks(renderWidget: jest.Mock) {
  const { light, dark } = renderWidget.mock.calls[0][0];
  const text = (el: any) => el.type(el.props).props.children[0].props.text;
  return [text(light), text(dark)];
}

describe('androidWidgetTaskHandler', () => {
  beforeEach(() => AsyncStorage.clear());

  it('draws the streak the app last saved, in both color schemes', async () => {
    await AsyncStorage.setItem(STREAK_WIDGET_KEY, '7');
    const renderWidget = jest.fn();
    await androidWidgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_ADDED', renderWidget });
    expect(drawnWeeks(renderWidget)).toEqual(['7', '7']);
  });

  it('draws 0 before the app has saved a streak', async () => {
    const renderWidget = jest.fn();
    await androidWidgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_UPDATE', renderWidget });
    expect(drawnWeeks(renderWidget)).toEqual(['0', '0']);
  });

  it('draws nothing when the widget is removed', async () => {
    const renderWidget = jest.fn();
    await androidWidgetTaskHandler({ widgetInfo, widgetAction: 'WIDGET_DELETED', renderWidget });
    expect(renderWidget).not.toHaveBeenCalled();
  });
});
