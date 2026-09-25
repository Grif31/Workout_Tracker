import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { STREAK_WIDGET_KEY } from '../constants/storageKeys';
import { renderStreakWidget } from './AndroidStreakWidget';

// Android asks for a drawing when the widget is added, resized or updated,
// often with the app closed. The widget runs in the app's own process, so it
// reads the streak the app last saved rather than being handed props the way
// the iOS widget is. Nothing to draw on delete, and a tap is handled by the
// widget's clickAction.
export async function androidWidgetTaskHandler({ widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  const stored = await AsyncStorage.getItem(STREAK_WIDGET_KEY).catch(() => null);
  renderWidget(renderStreakWidget(parseInt(stored ?? '0', 10) || 0));
}
