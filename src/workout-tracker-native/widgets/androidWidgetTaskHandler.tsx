import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { readWidgetSnapshot } from '../utils/widgetData';
import { ANDROID_WIDGETS } from './androidWidgets';

// Android asks for a drawing when a widget is added, resized or on its update
// period, often with the app closed. The widget runs in the app's own process,
// so it reads the snapshot the app last saved and draws it for the current
// date, which is how the week rolls over on Monday without the app. Nothing
// to draw on delete, and a tap is the widget's own OPEN_URI deep link.
export async function androidWidgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  const draw = ANDROID_WIDGETS[widgetInfo.widgetName];
  if (draw) renderWidget(draw(await readWidgetSnapshot(), widgetInfo));
}
