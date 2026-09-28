import { AccessoryWidgetBackground, Circle, Gauge, HStack, Image, ProgressView, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  aspectRatio, containerBackground, font, foregroundStyle, frame, gaugeStyle, kerning, lineLimit,
  opacity, progressViewStyle, resizable, scaleEffect, tint, widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { WeeklyGoalProps } from '../utils/widgetProps';

// iOS Weekly Goal widget: small, medium, and the lock screen circle and inline
// line. The 'widget' directive ships this function as a string that the
// extension evaluates on its own (CLAUDE.md, Home screen widgets): only its
// props, its environment and the @expo/ui globals exist in there. Every label
// and count comes from weeklyGoalProps in utils/widgetProps.ts; this picks the
// light or dark value and lays it out for the size.
const WeeklyGoalWidget = (p: WeeklyGoalProps, env: WidgetEnvironment) => {
  'widget';
  const dark = env.colorScheme === 'dark';
  const accent = dark ? p.accentDark : p.accentLight;
  const primary = dark ? '#FFFFFF' : '#000000';
  const faint = dark ? '#38383A' : '#E5E5EA';
  const flame = dark ? '#FF9F0A' : '#C93400';
  const logo = dark ? p.logoDark : p.logoLight;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  const family = env.widgetFamily;

  if (family === 'accessoryInline') {
    return <Text modifiers={[widgetURL(p.url)]}>{p.inlineLabel}</Text>;
  }

  if (family === 'accessoryCircular') {
    return (
      <ZStack modifiers={[containerBackground('clear', 'widget'), widgetURL(p.url)]}>
        <AccessoryWidgetBackground />
        <Gauge
          value={Math.min(p.done, p.goal)}
          min={0}
          max={p.goal}
          currentValueLabel={<Text modifiers={[font({ size: 15, weight: 'heavy', design: 'rounded' })]}>{`${p.done}/${p.goal}`}</Text>}
          modifiers={[gaugeStyle('circularCapacity')]}
        />
      </ZStack>
    );
  }

  const surface = [containerBackground(dark ? '#1C1C1E' : '#FFFFFF', 'widget'), widgetURL(p.url)];

  const Header = () => (
    <HStack spacing={5}>
      {logo ? <Image uiImage={logo} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 14, height: 14 })]} /> : null}
      <Text modifiers={[font({ size: 10, weight: 'bold' }), kerning(0.8), foregroundStyle(p.stale ? secondary : accent)]}>
        {p.goalMet ? 'GOAL MET' : 'WEEKLY GOAL'}
      </Text>
    </HStack>
  );

  const Streak = ({ long }: { long: boolean }) => (
    <HStack spacing={2}>
      <Image systemName="flame.fill" size={11} color={flame} />
      <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(flame)]}>
        {long ? `${p.streakWeeks} week streak` : String(p.streakWeeks)}
      </Text>
    </HStack>
  );

  // The system gauge is about 58pt across; scaled rather than framed, since
  // a capacity gauge ignores a frame larger than its own size.
  const Ring = ({ size }: { size: number }) => (
    <Gauge
      value={Math.min(p.done, p.goal)}
      min={0}
      max={p.goal}
      currentValueLabel={<Text modifiers={[font({ size: 17, weight: 'heavy', design: 'rounded' })]}>{`${p.done}/${p.goal}`}</Text>}
      modifiers={[gaugeStyle('circularCapacity'), tint(accent), scaleEffect(size / 58), frame({ width: size, height: size }), opacity(p.stale ? 0.45 : 1)]}
    />
  );

  const Days = ({ dot, letter }: { dot: number; letter: number }) => (
    <HStack spacing={0} modifiers={[opacity(p.stale ? 0.45 : 1)]}>
      {p.days.map((d, i) => (
        <VStack key={i} spacing={3} modifiers={[frame({ maxWidth: 999 })]}>
          <Text modifiers={[font({ size: letter, weight: d.today ? 'bold' : 'semibold' }), foregroundStyle(d.today ? primary : secondary)]}>{d.letter}</Text>
          <Circle modifiers={[foregroundStyle(d.trained ? accent : faint), frame({ width: dot, height: dot })]} />
        </VStack>
      ))}
    </HStack>
  );

  const Distance = () => (p.distance ? (
    <VStack alignment="leading" spacing={5}>
      <HStack>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(secondary)]}>Distance</Text>
        <Spacer />
        <Text modifiers={[font({ size: 12, weight: 'bold' })]}>{p.distance.label}</Text>
      </HStack>
      <ProgressView value={p.distance.fill} modifiers={[progressViewStyle('linear'), tint(accent)]} />
    </VStack>
  ) : null);

  if (!p.loggedIn || !p.hasWeek) {
    return (
      <VStack alignment="leading" spacing={4} modifiers={surface}>
        {logo ? <Image uiImage={logo} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 36, height: 36 })]} /> : null}
        <Spacer />
        <Text modifiers={[font({ size: 16, weight: 'heavy' }), lineLimit(1)]}>{p.loggedIn ? 'Open Aretē' : 'Log in to Aretē'}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(3)]}>Your weekly goal shows here once you do.</Text>
      </VStack>
    );
  }

  if (family === 'systemMedium') {
    return (
      <HStack spacing={18} modifiers={surface}>
        <VStack spacing={8}>
          <Header />
          <Ring size={84} />
        </VStack>
        <VStack alignment="leading" spacing={10}>
          <HStack>
            <Text modifiers={[font({ size: 17, weight: 'heavy' })]}>{p.remainingLabel}</Text>
            <Spacer />
            <Streak long />
          </HStack>
          <Days dot={8} letter={10} />
          {p.stale
            ? <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(2)]}>{p.staleLabel}</Text>
            : <Distance />}
        </VStack>
      </HStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={0} modifiers={surface}>
      <HStack>
        <Header />
        <Spacer />
        <Streak long={false} />
      </HStack>
      <Spacer />
      <HStack>
        <Spacer />
        <Ring size={64} />
        <Spacer />
      </HStack>
      <Spacer />
      {p.stale
        ? <Text modifiers={[font({ size: 12, weight: 'semibold' }), frame({ maxWidth: 999 })]}>Open Aretē to update</Text>
        : <Days dot={6} letter={9} />}
      {p.distance && !p.stale
        ? <ProgressView value={p.distance.fill} modifiers={[progressViewStyle('linear'), tint(accent), frame({ height: 4 })]} />
        : null}
    </VStack>
  );
};

// The name must match this widget's `name` in app.config.js.
export default createWidget<WeeklyGoalProps>('WeeklyGoalWidget', WeeklyGoalWidget);
