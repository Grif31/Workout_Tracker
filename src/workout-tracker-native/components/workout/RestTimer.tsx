import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Easing,
  PanResponder, Dimensions,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { fmtCountdown } from './types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_CIRCUMFERENCE = 2 * Math.PI * 85;

// Minimized floating bubble
const BUBBLE_SIZE = 72;
const BUBBLE_RING_R = 31; // (72 - strokeWidth 5) / 2 - inset
const BUBBLE_CIRCUMFERENCE = 2 * Math.PI * BUBBLE_RING_R;
const EDGE_MARGIN = 8;
const TOP_BOUND = 70;      // stay below the header
const BOTTOM_BOUND = 120;  // stay above the save bar / keyboard toolbar
const TAP_SLOP = 6;

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

  // Glide the ring between values instead of stepping once a second. Normal
  // ticks arrive every 1000ms, so a 1000ms linear glide makes the drain
  // continuous; ±30s adjustments ride the same tween.
  const progressAnim = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: restPaused ? 250 : 1000,
      easing: Easing.linear,
      useNativeDriver: false, // SVG stroke props can't use the native driver
    }).start();
  }, [progress, restPaused]);

  // ── Draggable bubble position ────────────────────────────────
  const { width: W, height: H } = Dimensions.get('window');
  const clampX = (x: number) => Math.max(EDGE_MARGIN, Math.min(W - BUBBLE_SIZE - EDGE_MARGIN, x));
  const clampY = (y: number) => Math.max(TOP_BOUND, Math.min(H - BUBBLE_SIZE - BOTTOM_BOUND, y));
  const posRef = useRef({ x: W - BUBBLE_SIZE - spacing.md, y: H - BUBBLE_SIZE - 220 });
  const pan = useRef(new Animated.ValueXY(posRef.current)).current;
  const minimizedRef = useRef(false);
  minimizedRef.current = minimized;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        pan.setValue({
          x: clampX(posRef.current.x + g.dx),
          y: clampY(posRef.current.y + g.dy),
        });
      },
      onPanResponderRelease: (_, g) => {
        posRef.current = {
          x: clampX(posRef.current.x + g.dx),
          y: clampY(posRef.current.y + g.dy),
        };
        // Barely moved = tap → expand back to the full overlay
        if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) {
          setMinimized(false);
        }
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const ringColor = restPaused ? colors.textSecondary : colors.accent;

  if (minimized) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.bubble,
            { backgroundColor: colors.surface, borderColor: colors.border },
            { transform: pan.getTranslateTransform() },
          ]}
        >
          <Svg width={BUBBLE_SIZE} height={BUBBLE_SIZE} viewBox={`0 0 ${BUBBLE_SIZE} ${BUBBLE_SIZE}`} style={StyleSheet.absoluteFill}>
            <Circle
              cx={BUBBLE_SIZE / 2} cy={BUBBLE_SIZE / 2} r={BUBBLE_RING_R}
              stroke={colors.border}
              strokeWidth={5}
              fill="none"
            />
            <AnimatedCircle
              cx={BUBBLE_SIZE / 2} cy={BUBBLE_SIZE / 2} r={BUBBLE_RING_R}
              stroke={ringColor}
              strokeWidth={5}
              fill="none"
              strokeDasharray={`${BUBBLE_CIRCUMFERENCE}`}
              strokeDashoffset={progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [BUBBLE_CIRCUMFERENCE, 0],
              })}
              strokeLinecap="round"
              transform={`rotate(-90 ${BUBBLE_SIZE / 2} ${BUBBLE_SIZE / 2})`}
            />
          </Svg>
          <Text style={[styles.bubbleTime, { color: colors.textPrimary }]}>
            {fmtCountdown(restRemaining)}
          </Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.restOverlay}>
      <View style={styles.restBackdrop} />
      <View style={[styles.restModal, { backgroundColor: colors.surface }]}>
        <TouchableOpacity style={styles.restMinimizeBtn} onPress={() => setMinimized(true)} hitSlop={8}>
          <Ionicons name="chevron-down" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.restCloseBtn} onPress={onStop} hitSlop={8}>
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
            <AnimatedCircle
              cx={100} cy={100} r={85}
              stroke={ringColor}
              strokeWidth={10}
              fill="none"
              strokeDasharray={`${RING_CIRCUMFERENCE}`}
              strokeDashoffset={progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [RING_CIRCUMFERENCE, 0],
              })}
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
          >
            <Text style={[styles.restAdjText, { color: colors.textPrimary }]}>−30s</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.restPauseBtn, { backgroundColor: colors.accent }]}
            onPress={restPaused ? onResume : onPause}
          >
            <Ionicons name={restPaused ? 'play' : 'pause'} size={26} color={colors.accentText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.restAdjBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => onAdjust(30)}
          >
            <Text style={[styles.restAdjText, { color: colors.textPrimary }]}>+30s</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
    paddingVertical: spacing.xs + 2,
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
