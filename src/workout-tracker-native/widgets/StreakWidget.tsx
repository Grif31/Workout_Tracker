import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

// Phase 0 spike (TODO.md section 19): proves the app can hand the widget a
// number. The 'widget' directive makes babel ship this function as a string
// that the widget extension evaluates on its own, so it can't close over
// anything in this file: the SwiftUI components are globals in that runtime,
// and the imports above are only here for types.
export type StreakWidgetProps = { weeks: number };

const StreakWidget = (props: StreakWidgetProps, _env: WidgetEnvironment) => {
  'widget';
  return (
    <VStack spacing={4}>
      <Text modifiers={[font({ size: 44, weight: 'bold', design: 'rounded' })]}>{String(props.weeks)}</Text>
      <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
        week streak
      </Text>
    </VStack>
  );
};

// The name must match the widget's `name` in app.config.js.
export default createWidget<StreakWidgetProps>('StreakWidget', StreakWidget);
