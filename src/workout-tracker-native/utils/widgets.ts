import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StreakWidgetProps } from '../widgets/StreakWidget';
import { STREAK_WIDGET_KEY } from '../constants/storageKeys';

// Lazy-load both widget libraries: each touches its native module on import
// (expo-widgets builds its native object, react-native-android-widget calls
// TurboModuleRegistry.getEnforcing), and neither module exists in Expo Go or a
// binary built before the widgets were added. A static import would crash the
// app there.
let streakWidget: { updateSnapshot(props: StreakWidgetProps): void } | null = null;
let androidWidget: typeof import('react-native-android-widget') | null = null;
if (Platform.OS === 'ios') {
  try { streakWidget = require('../widgets/StreakWidget').default; } catch {}
} else if (Platform.OS === 'android') {
  try { androidWidget = require('react-native-android-widget'); } catch {}
}

// Called from index.js before the app registers: Android can start the JS
// runtime just to draw a widget, without ever mounting App.
export function registerAndroidWidgets() {
  if (!androidWidget) return;
  const { androidWidgetTaskHandler } = require('../widgets/androidWidgetTaskHandler');
  androidWidget.registerWidgetTaskHandler(androidWidgetTaskHandler);
}

// Neither widget can call the API (neither has the JWT), so each only ever
// shows what the app last handed it. iOS: updateSnapshot writes the props to
// the App Group and reloads the widget. Android: the saved value is what the
// widget draws when Android redraws it later, and requestWidgetUpdate redraws
// any widget already on the home screen now.
export function updateStreakWidget(weeks: number) {
  try { streakWidget?.updateSnapshot({ weeks }); } catch {}
  if (androidWidget) {
    const { renderStreakWidget } = require('../widgets/AndroidStreakWidget');
    AsyncStorage.setItem(STREAK_WIDGET_KEY, String(weeks)).catch(() => {});
    androidWidget.requestWidgetUpdate({
      widgetName: 'StreakWidget',
      renderWidget: () => renderStreakWidget(weeks),
    }).catch(() => {});
  }
}
