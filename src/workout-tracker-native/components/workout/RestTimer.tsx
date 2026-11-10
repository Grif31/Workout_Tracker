import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, type SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { fmtCountdown } from './types';
import { BUBBLE_SIZE, bubbleBounds, bubbleRestPoint, rubberBand } from './restBubble';

const RING_CIRCUMFERENCE = 2 * Math.PI * 85;

// Minimized floating bubble
const BUBBLE_RING_R = 31; // (72 - strokeWidth 5) / 2 - inset
const BUBBLE_CIRCUMFERENCE = 2 * Math.PI * BUBBLE_RING_R;
const TAP_SLOP = 6;
const lightImpact = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

type Props = {
  restRemaining: number;
  restTotal: number;
  restPaused: boolean;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onAdjust: (delta: number) => void;
};

export default function RestTimer({
  restRemaining,
  restTotal,
  restPaused,
  onStop,
  onPause,
  onResume,
  onAdjust,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const progress = restTotal > 0 ? Math.min(1, restRemaining / restTotal) : 0;

  const [minimized, setMinimized] = useState(false);

  // The ring steps once a second with restRemaining rather than gliding. A
  // glide has to be a JS-driven Animated (SVG stroke can't use the native
  // driver), and on Fabric every JS-driven frame commits and lays out the
  // whole WorkoutLog tree. That ran ~60 commits a second for the length of
  // every rest: 57% CPU on an iPhone 13 in 1.1.8, and a main thread too busy
  // mounting to exit within 5s once backgrounded, so iOS killed it (0x8badf00d).

  // Bubble position lives here, not in RestBubble, so it survives expanding
  // and minimizing again during the same rest.
  const [bounds] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return bubbleBounds(width, height);
  });
  const bubbleX = useSharedValue(bounds.maxX);
  const bubbleY = useSharedValue(Math.max(bounds.minY, bounds.maxY - 100));
  const expand = useCallback(() => setMinimized(false), []);

  const ringColor = restPaused ? colors.textSecondary : colors.accent;

  if (minimized) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <RestBubble
          x={bubbleX}
          y={bubbleY}
          bounds={bounds}
          onExpand={expand}
          accessibilityLabel={`Rest timer, ${fmtCountdown(restRemaining)} left${restPaused ? ', paused' : ''}. Expand`}
          style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Svg width={BUBBLE_SIZE} height={BUBBLE_SIZE} viewBox={`0 0 ${BUBBLE_SIZE} ${BUBBLE_SIZE}`} style={StyleSheet.absoluteFill}>
            <Circle
              cx={BUBBLE_SIZE / 2} cy={BUBBLE_SIZE / 2} r={BUBBLE_RING_R}
              stroke={colors.border}
              strokeWidth={5}
              fill="none"
            />
            <Circle
              cx={BUBBLE_SIZE / 2} cy={BUBBLE_SIZE / 2} r={BUBBLE_RING_R}
              stroke={ringColor}
              strokeWidth={5}
              fill="none"
              strokeDasharray={`${BUBBLE_CIRCUMFERENCE}`}
              strokeDashoffset={BUBBLE_CIRCUMFERENCE * (1 - progress)}
              strokeLinecap="round"
              transform={`rotate(-90 ${BUBBLE_SIZE / 2} ${BUBBLE_SIZE / 2})`}
            />
          </Svg>
          <Text style={[styles.bubbleTime, { color: colors.textPrimary }]}>
            {fmtCountdown(restRemaining)}
          </Text>
        </RestBubble>
      </View>
    );
  }

  return (
    <View style={styles.restOverlay}>
      <View style={styles.restBackdrop} />
      <View style={[styles.restModal, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={styles.restMinimizeBtn}
          onPress={() => setMinimized(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Minimize rest timer"
        >
          <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.restCloseBtn}
          onPress={onStop}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Stop rest timer"
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={[styles.restLabel, { color: colors.textSecondary }]}>Rest</Text>

        <View style={styles.restCircleContainer}>
          <Svg width={200} height={200} viewBox="0 0 200 200">
            <Circle
              cx={100} cy={100} r={85}
              stroke={colors.border}
              strokeWidth={10}
              fill="none"
            />
            <Circle
              cx={100} cy={100} r={85}
              stroke={ringColor}
              strokeWidth={10}
              fill="none"
              strokeDasharray={`${RING_CIRCUMFERENCE}`}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
              strokeLinecap="round"
              transform="rotate(-90 100 100)"
            />
          </Svg>
          <View style={styles.restTimeCenter}>
            <Text style={[styles.restCountdown, { color: colors.textPrimary }]}>
              {fmtCountdown(restRemaining)}
            </Text>
          </View>
        </View>

        <View style={styles.restControls}>
          <TouchableOpacity
            style={[styles.restAdjBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => onAdjust(-30)}
            accessibilityRole="button"
            accessibilityLabel="Subtract 30 seconds"
          >
            <Text style={[styles.restAdjText, { color: colors.textPrimary }]}>−30s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.restPauseBtn, { backgroundColor: colors.accent }]}
            onPress={restPaused ? onResume : onPause}
            accessibilityRole="button"
            accessibilityLabel={restPaused ? 'Resume rest timer' : 'Pause rest timer'}
          >
            <Ionicons name={restPaused ? 'play' : 'pause'} size={26} color={colors.accentText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.restAdjBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => onAdjust(30)}
            accessibilityRole="button"
            accessibilityLabel="Add 30 seconds"
          >
            <Text style={[styles.restAdjText, { color: colors.textPrimary }]}>+30s</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// The minimized bubble. Drag runs on the UI thread, so it stays smooth while
// WorkoutLog re-renders every second for its clock. On release it springs to
// the side the flick was heading for, carrying the flick's speed; a tap
// expands it. withSpring follows the system Reduce Motion setting by default.
function RestBubble({ x, y, bounds, onExpand, accessibilityLabel, style, children }: {
  x: SharedValue<number>;
  y: SharedValue<number>;
  bounds: ReturnType<typeof bubbleBounds>;
  onExpand: () => void;
  accessibilityLabel: string;
  style: React.ComponentProps<typeof View>['style'];
  children: React.ReactNode;
}) {
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Memoized: the bubble re-renders every second as the countdown changes, and
  // a rebuilt gesture mid-drag would reattach its handlers.
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(TAP_SLOP)
      .onStart(() => {
        startX.set(x.get());
        startY.set(y.get());
      })
      .onUpdate(e => {
        x.set(rubberBand(startX.get() + e.translationX, bounds.minX, bounds.maxX));
        y.set(rubberBand(startY.get() + e.translationY, bounds.minY, bounds.maxY));
      })
      .onEnd(e => {
        const to = bubbleRestPoint(x.get(), y.get(), e.velocityX, e.velocityY, bounds);
        x.set(withSpring(to.x, { duration: 400, dampingRatio: 0.8, velocity: e.velocityX }));
        y.set(withSpring(to.y, { duration: 400, dampingRatio: 0.8, velocity: e.velocityY }));
        scheduleOnRN(lightImpact);
      });
    const tap = Gesture.Tap()
      .maxDistance(TAP_SLOP)
      .onEnd((_e, success) => {
        if (success) scheduleOnRN(onExpand);
      });
    return Gesture.Race(pan, tap);
  }, [x, y, startX, startY, bounds, onExpand]);

  const position = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Reanimated.View
        style={[style, position]}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onAccessibilityTap={onExpand}
      >
        {children}
      </Reanimated.View>
    </GestureDetector>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  restOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restBackdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  restModal: {
    borderRadius: 24,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    width: 280,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  restMinimizeBtn: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    padding: spacing.xs,
    zIndex: 1,
  },
  restCloseBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.xs,
  },
  restLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
  restCircleContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  restTimeCenter: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  restCountdown: {
    fontSize: 48,
    fontWeight: '700',
  },
  restControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  restPauseBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restAdjBtn: {
    paddingHorizontal: spacing.sm,
    minWidth: 64,
    minHeight: 44,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restAdjText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },

  bubble: {
    position: 'absolute',
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  bubbleTime: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
  },
});
