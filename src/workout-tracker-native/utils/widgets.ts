import { Platform } from 'react-native';
import type { WidgetSnapshot } from './widgetSnapshot';
import {
  greekRankProps, weeklyGoalProps, widgetTimelineDates,
  type GreekRankProps, type WeeklyGoalProps, type WidgetImages,
} from './widgetProps';
import { prepareWidgetImages } from './widgetImages';

// Lazy-load both widget libraries: each touches its native module on import
// (expo-widgets builds its native objects, react-native-android-widget calls
// TurboModuleRegistry.getEnforcing), and neither module exists in Expo Go or a
// binary built before the widgets were added. A static import would crash the
// app there.
type IosWidget<P> = { updateTimeline(entries: { date: Date; props: P }[]): void };
let ios: {
  weeklyGoal: IosWidget<WeeklyGoalProps>;
  greekRank: IosWidget<GreekRankProps>;
  directory: string | null;
} | null = null;
let androidWidget: typeof import('react-native-android-widget') | null = null;
if (Platform.OS === 'ios') {
  try {
    ios = {
      weeklyGoal: require('../widgets/WeeklyGoalWidget').default,
      greekRank: require('../widgets/GreekRankWidget').default,
      directory: require('expo-widgets').widgetsDirectory || null,
    };
  } catch {}
} else if (Platform.OS === 'android') {
  try { androidWidget = require('react-native-android-widget'); } catch {}
}

// Copied into the App Group once per launch at most
let images: Promise<WidgetImages> | null = null;

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
 * iOS gets one timeline entry per moment its picture changes without new data
 * (now, midnight next Monday, the moment it turns stale), each with the props
 * for that moment, so the week rolls over and the stale note appears with the
 * app closed. Android redraws on its own; its task handler reads the snapshot.
 */
export function renderWidgets(snapshot: WidgetSnapshot | null) {
  if (ios) {
    const widgets = ios;
    (images ??= prepareWidgetImages(widgets.directory)).then(imgs => {
      const dates = widgetTimelineDates(snapshot, new Date());
      try { widgets.weeklyGoal.updateTimeline(dates.map(date => ({ date, props: weeklyGoalProps(snapshot, date, imgs) }))); } catch {}
      try { widgets.greekRank.updateTimeline(dates.map(date => ({ date, props: greekRankProps(snapshot, date, imgs) }))); } catch {}
    });
  }
  if (androidWidget) {
    const { ANDROID_WIDGETS } = require('../widgets/androidWidgets');
    for (const widgetName of Object.keys(ANDROID_WIDGETS)) {
      // Once per placed widget, with its own size
      androidWidget.requestWidgetUpdate({
        widgetName,
        renderWidget: info => ANDROID_WIDGETS[widgetName](snapshot, info),
      }).catch(() => {});
    }
  }
}
