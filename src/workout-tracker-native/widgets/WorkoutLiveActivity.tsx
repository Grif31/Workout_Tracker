import { HStack, Image, ProgressView, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  aspectRatio, background, cornerRadius, font, foregroundStyle, frame, lineLimit, monospacedDigit, padding, progressViewStyle, resizable, tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type WorkoutLiveActivityProps = {
  name: string;
  exercise: string;
  sets: string;
  // Sets done over sets in the workout, 0 to 1
  progress: number;
  // "Next set  ·  3 of 4" and the target for it ("8 × 185 lb"); absent once every set is done and for cardio
  setLine?: string;
  next?: string;
  // Epoch ms. The native timers count from these, so they tick with the app suspended.
  startedAt: number;
  // Set while the workout is paused: freezes the elapsed timer at this moment.
  pausedAt?: number;
  // Set while resting; restPausedLeft instead when the rest timer is paused.
  restEndsAt?: number;
  restPausedLeft?: number;
  accent: string;
  // The white Aretē logo, copied into the App Group by the app; absent until the copy is done
  logo?: string;
};

// Runs in the extension's own runtime with only its props and the @expo/ui
// globals, like the widgets. No "Rest over" state: iOS doesn't re-draw the
// layout at the stale date (isStale stayed false on a device), so the countdown
// just stops at 0:00 and the rest alert notification does the signalling.
const WorkoutLiveActivity = (p: WorkoutLiveActivityProps, _env: LiveActivityEnvironment) => {
  'widget';
  const DAY = 86400000;
  const resting = p.restEndsAt != null || p.restPausedLeft != null;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;

  const Elapsed = ({ size }: { size: number }) => (
    <Text
      timerInterval={{ lower: new Date(p.startedAt), upper: new Date(p.startedAt + DAY) }}
      countsDown={false}
      pauseTime={p.pausedAt != null ? new Date(p.pausedAt) : undefined}
      modifiers={[font({ size, weight: 'bold' }), monospacedDigit(), foregroundStyle(p.accent)]}
    />
  );

  const Rest = ({ size }: { size: number }) => {
    if (p.restPausedLeft != null) {
      const left = Math.max(0, Math.round(p.restPausedLeft));
      return <Text modifiers={[font({ size, weight: 'bold' }), monospacedDigit()]}>{`Rest ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</Text>;
    }
    return (
      <Text
        timerInterval={{ lower: new Date(), upper: new Date(p.restEndsAt as number) }}
        countsDown
        modifiers={[font({ size, weight: 'bold' }), monospacedDigit()]}
      />
    );
  };

  // "Set 3 of 4 · 8 × 185 lb"
  const target = [p.setLine, p.next].filter(Boolean).join('  ·  ');

  return {
    banner: (
      <VStack alignment="leading" spacing={5} modifiers={[padding({ all: 14 })]}>
        <HStack spacing={6}>
          {/* On a fixed dark tile: the lock screen's tint doesn't follow the color scheme, so a bare white or black mark can vanish */}
          {p.logo ? (
            <ZStack modifiers={[frame({ width: 26, height: 26 }), background('#1C1C1E'), cornerRadius(7)]}>
              <Image uiImage={p.logo} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 18, height: 18 })]} />
            </ZStack>
          ) : null}
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(1)]}>{p.name}</Text>
          <Spacer />
          <Elapsed size={22} />
        </HStack>
        <HStack>
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), lineLimit(1)]}>{p.exercise}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>{p.sets}</Text>
        </HStack>
        {target ? <Text modifiers={[font({ size: 14 }), foregroundStyle(secondary), lineLimit(1)]}>{target}</Text> : null}
        {resting ? <Rest size={18} /> : null}
        <ProgressView value={p.progress} modifiers={[progressViewStyle('linear'), tint(p.accent)]} />
      </VStack>
    ),
    compactLeading: <Image systemName="dumbbell.fill" size={14} color={p.accent} />,
    compactTrailing: resting ? <Rest size={14} /> : <Elapsed size={14} />,
    minimal: <Image systemName="dumbbell.fill" size={14} color={p.accent} />,
    expandedLeading: <Elapsed size={20} />,
    expandedTrailing: <Text modifiers={[font({ size: 14 })]}>{p.sets}</Text>,
    expandedCenter: <Text modifiers={[font({ size: 15, weight: 'semibold' }), lineLimit(1)]}>{p.exercise}</Text>,
    expandedBottom: resting ? <Rest size={16} /> : <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>{target || p.name}</Text>,
  };
};

export default createLiveActivity<WorkoutLiveActivityProps>('WorkoutLiveActivity', WorkoutLiveActivity);
