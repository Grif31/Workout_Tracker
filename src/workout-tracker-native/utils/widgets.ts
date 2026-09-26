import { Platform } from 'react-native';
import type { StreakWidgetProps } from '../widgets/StreakWidget';
import { nextMondayStart, type WidgetSnapshot } from './widgetSnapshot';

// Lazy-load both widget libraries: each touches its native module on import
// (expo-widgets builds its native object, react-native-android-widget calls
// TurboModuleRegistry.getEnforcing), and neither module exists in Expo Go or a
// binary built before the widgets were added. A static import would crash the
// app there.
type IosWidget<P> = { updateTimeline(entries: { date: Date; props: P }[]): void };
let streakWidget: IosWidget<StreakWidgetProps> | null = null;
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

/**
 * Redraws every widget from `snapshot`, or in its logged-out state for null.
 * Only utils/widgetData.ts calls this, straight after saving the snapshot, so
 * what a widget shows now and what it redraws from later never disagree.
 *
 * iOS gets a second timeline entry at midnight next Monday with the same
 * props: the layout works out the week from the entry's date, so that's the
 * redraw that rolls it over when the app isn't opened. Android redraws on its
 * own and its task handler does the same from the stored snapshot.
 */
export function renderWidgets(snapshot: WidgetSnapshot | null) {
  const now = new Date();
  const props: StreakWidgetProps = { weeks: snapshot?.week?.streakWeeks ?? null };
  try {
    streakWidget?.updateTimeline([{ date: now, props }, { date: nextMondayStart(now), props }]);
  } catch {}
  if (androidWidget) {
    const { renderStreakWidget } = require('../widgets/AndroidStreakWidget');
    androidWidget.requestWidgetUpdate({
      widgetName: 'StreakWidget',
      renderWidget: () => renderStreakWidget(snapshot),
    }).catch(() => {});
  }
}
