import { Platform } from 'react-native';
import type { StreakWidgetProps } from '../widgets/StreakWidget';

// Lazy-load: the widget's module creates its native object on import, and the
// ExpoWidgets native module only exists in EAS builds made since the widget
// was added. A static import would crash Home in Expo Go or an older binary.
let streakWidget: { updateSnapshot(props: StreakWidgetProps): void } | null = null;
if (Platform.OS === 'ios') {
  try { streakWidget = require('../widgets/StreakWidget').default; } catch {}
}

// The widget can't call the API (it has no JWT), so it only ever shows what
// the app last handed it. updateSnapshot writes the props to the App Group
// and reloads the widget's timeline.
export function updateStreakWidget(weeks: number) {
  try { streakWidget?.updateSnapshot({ weeks }); } catch {}
}
