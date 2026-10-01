import { Circle, HStack, Image, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  aspectRatio, background, containerBackground, cornerRadius, font, foregroundStyle, frame, kerning,
  lineLimit, minimumScaleFactor, padding, resizable, widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { UpNextProps } from '../utils/widgetProps';

// iOS Up Next widget: small and medium. Like the other layouts this runs in
// the extension's own runtime with only its props and the @expo/ui globals;
// upNextProps in utils/widgetProps.ts decides the day and the wording, and the
// muscle diagram arrives as a PNG the app rendered into the App Group. The
// whole widget is the tap target: Start's link opens a new workout for the day.
const UpNextWidget = (p: UpNextProps, env: WidgetEnvironment) => {
  'widget';
  const dark = env.colorScheme === 'dark';
  const accent = dark ? p.accentDark : p.accentLight;
  const onAccent = dark ? p.onAccentDark : p.onAccentLight;
  const logo = dark ? p.logoDark : p.logoLight;
  const diagram = dark ? p.diagramDark : p.diagramLight;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  const medium = env.widgetFamily === 'systemMedium';
  const surface = [containerBackground(dark ? '#1C1C1E' : '#FFFFFF', 'widget'), widgetURL(p.url)];

  const Header = () => (
    <HStack spacing={5}>
      {logo ? <Image uiImage={logo} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 18, height: 18 })]} /> : null}
      <Text modifiers={[font({ size: 10, weight: 'bold' }), kerning(0.8), foregroundStyle(p.stale ? secondary : accent)]}>UP NEXT</Text>
    </HStack>
  );

  const Diagram = ({ size }: { size: number }) => (diagram
    ? <Image uiImage={diagram} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: size, height: size })]} />
    : null);

  const Start = ({ small }: { small: boolean }) => (p.stale ? (
    <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(2)]}>{small ? 'Open Aretē to update' : p.staleLabel}</Text>
  ) : (
    <HStack spacing={6} modifiers={[
      padding({ top: small ? 8 : 10, bottom: small ? 8 : 10, leading: 16, trailing: 16 }),
      ...(small ? [frame({ maxWidth: 999 })] : []),
      background(accent), cornerRadius(20),
    ]}>
      <Image systemName="play.fill" size={small ? 11 : 12} color={onAccent} />
      <Text modifiers={[font({ size: small ? 13 : 14, weight: 'bold' }), foregroundStyle(onAccent)]}>Start</Text>
    </HStack>
  ));

  const Check = ({ size }: { size: number }) => (
    <ZStack modifiers={[frame({ width: size, height: size })]}>
      <Circle modifiers={[foregroundStyle(accent)]} />
      <Image systemName="checkmark" size={size * 0.45} color={onAccent} />
    </ZStack>
  );

  if (!p.loggedIn) {
    return (
      <VStack alignment="leading" spacing={4} modifiers={surface}>
        {logo ? <Image uiImage={logo} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 36, height: 36 })]} /> : null}
        <Spacer />
        <Text modifiers={[font({ size: 16, weight: 'heavy' }), lineLimit(1)]}>Log in to Aretē</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(3)]}>Your next routine day shows here once you do.</Text>
      </VStack>
    );
  }

  if (p.state === 'noRoutine') {
    return (
      <VStack alignment="leading" spacing={4} modifiers={surface}>
        <Header />
        <Spacer />
        <Text modifiers={[font({ size: medium ? 20 : 17, weight: 'heavy' })]}>Pick a routine</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(3)]}>
          {medium ? 'Choose one on the Coach tab and your next day shows up here.' : 'Choose one on the Coach tab.'}
        </Text>
      </VStack>
    );
  }

  if (p.state === 'allDone') {
    return medium ? (
      <VStack alignment="leading" spacing={0} modifiers={surface}>
        <Header />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(secondary), lineLimit(1)]}>{p.routineName}</Text>
        <Spacer />
        <HStack spacing={10}>
          <Check size={36} />
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 17, weight: 'heavy' }), lineLimit(1), minimumScaleFactor(0.8)]}>{`Great Job! ${p.doneLine}`}</Text>
            <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(1)]}>{p.mondayLine}</Text>
          </VStack>
        </HStack>
        <Spacer />
      </VStack>
    ) : (
      <VStack alignment="leading" spacing={0} modifiers={surface}>
        <Header />
        <Spacer />
        <Check size={34} />
        <Spacer />
        <Text modifiers={[font({ size: 17, weight: 'heavy' })]}>Great Job!</Text>
        <Text modifiers={[font({ size: 13, weight: 'bold' }), lineLimit(1), minimumScaleFactor(0.8)]}>{p.doneLine}</Text>
      </VStack>
    );
  }

  if (medium) {
    return (
      <HStack spacing={12} modifiers={surface}>
        <VStack alignment="leading" spacing={0}>
          <Header />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(secondary), lineLimit(1)]}>{p.routineName}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 22, weight: 'heavy' }), lineLimit(1), minimumScaleFactor(0.7)]}>{p.dayTitle}</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(2)]}>{p.exercisesLine}</Text>
        </VStack>
        <Spacer />
        <VStack spacing={0}>
          <Diagram size={84} />
          <Spacer />
          <Start small={false} />
        </VStack>
      </HStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={0} modifiers={surface}>
      {/* The header gets the full width: beside the diagram, the logo and
          "UP NEXT" were squeezed into about 75pt and cut off */}
      <Header />
      <Spacer />
      <HStack spacing={6}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondary), lineLimit(1)]}>{p.routineName}</Text>
          <Text modifiers={[font({ size: 17, weight: 'heavy' }), lineLimit(2), minimumScaleFactor(0.7)]}>{p.dayTitle}</Text>
        </VStack>
        <Spacer />
        <Diagram size={46} />
      </HStack>
      <Spacer />
      <Start small />
    </VStack>
  );
};

// The name must match this widget's `name` in app.config.js.
export default createWidget<UpNextProps>('UpNextWidget', UpNextWidget);
