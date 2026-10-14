import { HStack, Image, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  aspectRatio, background, cornerRadius, font, foregroundStyle, frame, lineLimit, monospacedDigit, padding, resizable,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

/** The SF Symbol for each GPS activity (Run, Cycle, Walk, Hike) */
export type ActivityIcon = 'figure.run' | 'figure.outdoor.cycle' | 'figure.walk' | 'figure.hiking';

export type GpsLiveActivityProps = {
  /** "Run", "Cycle", "Walk", "Hike" */
  activity: string;
  icon: ActivityIcon;
  // Epoch ms. The elapsed timer counts natively from this, so it ticks with the app suspended.
  startedAt: number;
  // Set while paused (or stopped and waiting to be saved): freezes the timer at this moment
  pausedAt?: number;
  /** "2.31", in `unit` */
  distance: string;
  unit: string;
  /** Average pace ("8:42") or, for a ride, speed ("18.4") */
  avgRate: string;
  /** "/mi", "/km", "mph", "km/h" */
  rateUnit: string;
  /** Pace or speed over roughly the last 30 seconds; absent until there is enough of it, and while paused */
  nowRate?: string;
  accent: string;
  logo?: string;
};

// Same rules as WorkoutLiveActivity: the extension's own runtime, only props
// and @expo/ui globals. Distance and pace can't tick natively, so the app
// pushes them (utils/gpsLiveActivityProps.ts, throttled in GpsRunProvider);
// only the elapsed time runs on its own.
const GpsLiveActivity = (p: GpsLiveActivityProps, _env: LiveActivityEnvironment) => {
  'widget';
  const DAY = 86400000;
  const paused = p.pausedAt != null;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;

  const Elapsed = ({ size }: { size: number }) => (
    <Text
      timerInterval={{ lower: new Date(p.startedAt), upper: new Date(p.startedAt + DAY) }}
      countsDown={false}
      pauseTime={paused ? new Date(p.pausedAt as number) : undefined}
      modifiers={[font({ size, weight: 'bold' }), monospacedDigit(), foregroundStyle(p.accent)]}
    />
  );

  const Distance = ({ size }: { size: number }) => (
    <Text modifiers={[font({ size, weight: 'bold' }), monospacedDigit()]}>{`${p.distance} ${p.unit}`}</Text>
  );

  const avgLine = `${p.avgRate} ${p.rateUnit} avg`;

  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 14 })]}>
        <HStack spacing={6}>
          {/* On a fixed dark tile, as in the workout activity: the lock screen's tint doesn't follow the color scheme */}
          {p.logo ? (
            <ZStack modifiers={[frame({ width: 26, height: 26 }), background('#1C1C1E'), cornerRadius(7)]}>
              <Image uiImage={p.logo} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 18, height: 18 })]} />
            </ZStack>
          ) : null}
          <Image systemName={p.icon} size={14} color={p.accent} />
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>{paused ? `${p.activity} paused` : p.activity}</Text>
          <Spacer />
          <Elapsed size={22} />
        </HStack>
        <HStack alignment="lastTextBaseline">
          <Distance size={26} />
          <Spacer />
          <VStack alignment="trailing" spacing={2}>
            <Text modifiers={[font({ size: 15, weight: 'semibold' }), monospacedDigit()]}>{avgLine}</Text>
            {p.nowRate ? (
              <Text modifiers={[font({ size: 12 }), monospacedDigit(), foregroundStyle(secondary)]}>{`${p.nowRate} ${p.rateUnit} now`}</Text>
            ) : null}
          </VStack>
        </HStack>
      </VStack>
    ),
    compactLeading: <Image systemName={p.icon} size={14} color={p.accent} />,
    compactTrailing: <Elapsed size={14} />,
    minimal: <Image systemName={p.icon} size={14} color={p.accent} />,
    expandedLeading: <Distance size={20} />,
    expandedTrailing: <Elapsed size={20} />,
    expandedCenter: <Text modifiers={[font({ size: 15, weight: 'semibold' }), lineLimit(1)]}>{paused ? `${p.activity} paused` : p.activity}</Text>,
    expandedBottom: <Text modifiers={[font({ size: 13 }), monospacedDigit(), lineLimit(1)]}>{p.nowRate ? `${avgLine}  ·  ${p.nowRate} now` : avgLine}</Text>,
  };
};

export default createLiveActivity<GpsLiveActivityProps>('GpsLiveActivity', GpsLiveActivity);
