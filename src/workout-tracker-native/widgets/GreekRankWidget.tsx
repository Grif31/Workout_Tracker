import { HStack, Image, ProgressView, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  aspectRatio, background, containerBackground, cornerRadius, font, foregroundStyle, frame, kerning,
  lineLimit, minimumScaleFactor, opacity, padding, progressViewStyle, resizable, strokeBorder, tint, widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { GreekRankProps } from '../utils/widgetProps';

// iOS Greek Rank widget: small, medium and the lock screen rectangle. Like
// WeeklyGoalWidget, this runs in the extension's own runtime and can use only
// its props, its environment and the @expo/ui globals; greekRankProps in
// utils/widgetProps.ts decides the wording, this lays it out.
const GreekRankWidget = (p: GreekRankProps, env: WidgetEnvironment) => {
  'widget';
  const dark = env.colorScheme === 'dark';
  const accent = dark ? p.accentDark : p.accentLight;
  const rankText = dark ? p.textDark : p.textLight;
  const logo = dark ? p.logoDark : p.logoLight;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  const dim = opacity(p.stale ? 0.45 : 1);

  if (env.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={3} modifiers={[containerBackground('clear', 'widget'), widgetURL(p.url)]}>
        <Text modifiers={[font({ size: 15, weight: 'heavy' }), lineLimit(1)]}>{p.headline}</Text>
        {p.isTop ? null : <ProgressView value={p.progress} modifiers={[progressViewStyle('linear')]} />}
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1), minimumScaleFactor(0.8)]}>{p.smallCaption}</Text>
      </VStack>
    );
  }

  const surface = [containerBackground(dark ? '#1C1C1E' : '#FFFFFF', 'widget'), widgetURL(p.url)];

  const Header = () => (
    <HStack spacing={5}>
      {logo ? <Image uiImage={logo} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 18, height: 18 })]} /> : null}
      <Text modifiers={[font({ size: 10, weight: 'bold' }), kerning(0.8), foregroundStyle(p.stale ? secondary : accent)]}>GREEK RANK</Text>
    </HStack>
  );

  const Badge = ({ size }: { size: number }) => (
    <ZStack modifiers={[frame({ width: size, height: size }), strokeBorder({ content: p.color, style: { lineWidth: size / 17 }, shape: 'circle' })]}>
      <Text modifiers={[font({ size: size * 0.45, weight: 'heavy' }), foregroundStyle(rankText)]}>{p.letter}</Text>
    </ZStack>
  );

  const Identity = ({ badge, name }: { badge: number; name: number }) => (
    <HStack spacing={badge / 4} modifiers={[dim]}>
      <Badge size={badge} />
      <VStack alignment="leading" spacing={0}>
        <Text modifiers={[font({ size: name, weight: 'heavy' }), foregroundStyle(rankText), lineLimit(1), minimumScaleFactor(0.7)]}>{p.rank}</Text>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondary), lineLimit(1), minimumScaleFactor(0.8)]}>{p.pointsLabel}</Text>
      </VStack>
    </HStack>
  );

  const Lock = () => <Image systemName="lock.fill" size={11} color={dark ? '#8E8E93' : '#6C6C70'} />;

  if (!p.loggedIn || !p.hasRank) {
    return (
      <VStack alignment="leading" spacing={4} modifiers={surface}>
        {logo ? <Image uiImage={logo} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 36, height: 36 })]} /> : null}
        <Spacer />
        <Text modifiers={[font({ size: 16, weight: 'heavy' }), lineLimit(1)]}>{p.loggedIn ? 'Open Aretē' : 'Log in to Aretē'}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary), lineLimit(3)]}>Your Greek Rank shows here once you do.</Text>
      </VStack>
    );
  }

  // Below the name: a stale note, "Excellence" at the top rank, the gate when
  // one holds the rank back, otherwise the bar toward the next rank.
  const Footer = ({ medium }: { medium: boolean }) => {
    if (p.stale) {
      return <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(2)]}>{medium ? p.staleLabel : 'Open Aretē to update'}</Text>;
    }
    if (p.isTop) {
      return <Text modifiers={[font({ size: 13, weight: 'heavy' }), kerning(1.5), foregroundStyle(rankText)]}>EXCELLENCE</Text>;
    }
    if (p.heldByGate && medium && p.gateDetail) {
      return (
        <HStack spacing={6} modifiers={[padding({ top: 8, bottom: 8, leading: 10, trailing: 10 }), background(dark ? '#2C2C2E' : '#F2F2F7'), cornerRadius(10)]}>
          <Lock />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(2), minimumScaleFactor(0.85)]}>{p.gateDetail}</Text>
        </HStack>
      );
    }
    if (p.heldByGate) {
      return (
        <HStack alignment="top" spacing={5}>
          <Lock />
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondary), lineLimit(3)]}>{p.smallCaption}</Text>
        </HStack>
      );
    }
    return (
      <VStack alignment="leading" spacing={5}>
        <ProgressView value={p.progress} modifiers={[progressViewStyle('linear'), tint(p.color)]} />
        {medium ? (
          <HStack>
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondary)]}>{p.bandLowLabel}</Text>
            <Spacer />
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondary)]}>{p.bandHighLabel}</Text>
          </HStack>
        ) : (
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondary), lineLimit(2)]}>{p.smallCaption}</Text>
        )}
      </VStack>
    );
  };

  if (env.widgetFamily === 'systemMedium') {
    // The score's parts only when there's no gate text wanting the width
    const showParts = !p.heldByGate && !p.stale;
    return (
      <HStack spacing={18} modifiers={surface}>
        <VStack alignment="leading" spacing={0}>
          <Header />
          <Spacer />
          <Identity badge={52} name={24} />
          <Spacer />
          <Footer medium />
        </VStack>
        {showParts ? (
          <VStack alignment="leading" spacing={10} modifiers={[frame({ width: 128 })]}>
            {p.components.map(c => (
              <VStack key={c.label} alignment="leading" spacing={4}>
                <HStack>
                  <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(secondary)]}>{c.label}</Text>
                  <Spacer />
                  <Text modifiers={[font({ size: 11, weight: 'bold' })]}>{String(c.value)}</Text>
                </HStack>
                <ProgressView value={c.value / 100} modifiers={[progressViewStyle('linear'), tint(dark ? '#FFFFFF' : '#000000')]} />
              </VStack>
            ))}
          </VStack>
        ) : null}
      </HStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={0} modifiers={surface}>
      <Header />
      <Spacer />
      <Identity badge={44} name={20} />
      <Spacer />
      <Footer medium={false} />
    </VStack>
  );
};

// The name must match this widget's `name` in app.config.js.
export default createWidget<GreekRankProps>('GreekRankWidget', GreekRankWidget);
