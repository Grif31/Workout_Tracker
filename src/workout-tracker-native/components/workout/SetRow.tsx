import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { PR_GOLD_TEXT } from '../../constants/prColors';
import { type WorkoutSet, type PreviousSet, type SetType, colStyles } from './types';

// Resting width of the revealed Delete button. Swipeable measures the actions
// container to set the row's drag range, so this has to be a real width.
const ACTION_WIDTH = 96;
// Drag distance past which releasing deletes outright, instead of just snapping
// the row open to reveal the button. Expressed against the button width so the
// two stay in proportion; with friction at 1 this is also the actual finger
// travel required. A release flick counts for extra via Swipeable's DRAG_TOSS.
const FULL_SWIPE_DISTANCE = Math.round(ACTION_WIDTH * 1.6);
// Drag distance over which the trash icon grows into its committed size. The
// crossing itself can't be detected (listeners never fire on Swipeable's drag
// interpolation), so the size is interpolated from the drag and simply peaks at
// the threshold.
const ICON_GROW_RANGE = 28;

type Props = {
  set: WorkoutSet;
  setIndex: number;
  prevSet?: PreviousSet;
  showRpe: boolean;
  bodyweight?: boolean;
  typeColor: string;
  setType: SetType;
  onOpenTypePicker: () => void;
  onChangeReps: (val: string) => void;
  onChangeWeight: (val: string) => void;
  onFocusReps: () => void;
  onFocusWeight: () => void;
  onBlur: () => void;
  onToggleDone: () => void;
  onOpenRpePicker: () => void;
  onDelete: () => void;
  /** Lets the keyboard toolbar's Next button focus specific inputs */
  registerInputRef?: (field: 'reps' | 'weight', ref: TextInput | null) => void;
  /** Near-PR hint shown under the row while this set is focused */
  prHint?: string | null;
};

function SetRow({
  set,
  setIndex,
  prevSet,
  showRpe,
  bodyweight,
  typeColor,
  setType,
  onOpenTypePicker,
  onChangeReps,
  onChangeWeight,
  onFocusReps,
  onFocusWeight,
  onBlur,
  onToggleDone,
  onOpenRpePicker,
  onDelete,
  registerInputRef,
  prHint,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDone = set.done ?? false;
  // Swipeable only exposes its drag node through renderRightActions, so stash it
  // for onSwipeableWillOpen to read on release.
  const dragNode = useRef<{ __getValue?: () => number } | null>(null);

  // A full swipe collapses the row itself rather than leaning on the
  // LayoutAnimation that the button path uses. Deleting inline there doesn't
  // animate: useNativeAnimations={false} (needed so `width` can interpolate and
  // the drag value stays readable from JS) puts Swipeable's release spring on
  // the JS thread, where its per-frame setNativeProps writes override the native
  // animation block LayoutAnimation opens. Waiting for that spring to finish
  // does animate, but leaves the row sitting open for ~300ms first. Driving the
  // collapse here avoids both: it starts immediately, and the rows below slide
  // up on their own because this row's height is genuinely shrinking.
  const collapseAnim = useRef(new Animated.Value(1)).current;
  const [rowHeight, setRowHeight] = useState(0);
  const [collapsing, setCollapsing] = useState(false);

  const collapseAndDelete = () => {
    // Nothing measured yet (shouldn't happen for a visible row) — just remove it
    if (rowHeight <= 0) { onDelete(); return; }
    setCollapsing(true);
    Animated.timing(collapseAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // height
    }).start(({ finished }) => {
      // By now the row occupies no space, so removing it from state is invisible
      if (finished) onDelete();
    });
  };
  const prevText = prevSet
    ? bodyweight ? `${prevSet.reps} reps` : `${prevSet.reps} x ${prevSet.weight}`
    : '—';

  return (
    <Swipeable
      // Friction stays at its default of 1: Swipeable divides gesture travel by
      // it, so friction={2} put the full-swipe threshold beyond screen width.
      rightThreshold={40}
      // Defaults to true, and the native driver breaks this row two ways: it
      // only supports transform/opacity, so interpolating `width` throws, and
      // the JS-side drag value it leaves behind is stale, so the release
      // distance read below would be wrong.
      useNativeAnimations={false}
      // Releasing past FULL_SWIPE_DISTANCE deletes; short of it the row snaps
      // open and the button is there to tap. Deciding on release rather than on
      // crossing the threshold means an overshot swipe can still be walked back.
      //
      // Read synchronously, not via addListener: renderRightActions receives an
      // AnimatedInterpolation, and the JS driver's flushValue only updates
      // attached style leaves, never listeners on intermediate nodes, so a
      // listener never fires. By the time this runs, animateRow has zeroed dragX
      // and set rowTranslation to the release offset.
      onSwipeableWillOpen={() => {
        const released = dragNode.current?.__getValue?.() ?? 0;
        if (released > -FULL_SWIPE_DISTANCE) return;
        collapseAndDelete();
      }}
      renderRightActions={(progress, dragX) => {
        dragNode.current = dragX as unknown as { __getValue?: () => number };
        // Slides in from the right edge as the row opens.
        const translateX = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [ACTION_WIDTH, 0],
          extrapolate: 'clamp',
        });
        // Then keeps growing leftward as the swipe continues past the button's
        // resting width, so the red area swallows the row on the way to a full
        // swipe instead of sitting at a fixed size.
        const width = dragX.interpolate({
          inputRange: [-FULL_SWIPE_DISTANCE * 2, -ACTION_WIDTH, 0],
          outputRange: [FULL_SWIPE_DISTANCE * 2, ACTION_WIDTH, ACTION_WIDTH],
          extrapolate: 'clamp',
        });
        // Muted until the commit point, full strength past it, so the release
        // threshold is visible before you let go.
        const opacity = dragX.interpolate({
          inputRange: [-FULL_SWIPE_DISTANCE, -FULL_SWIPE_DISTANCE + 1, 0],
          outputRange: [1, 0.82, 0.82],
          extrapolate: 'clamp',
        });
        // Ramps up over the last stretch before the threshold so the icon is at
        // full size exactly when releasing would delete.
        const iconScale = dragX.interpolate({
          inputRange: [-FULL_SWIPE_DISTANCE, -FULL_SWIPE_DISTANCE + ICON_GROW_RANGE, 0],
          outputRange: [1.45, 1, 1],
          extrapolate: 'clamp',
        });
        return (
          // Fixed width: Swipeable measures this to decide how far the row can
          // drag. A flex-sized action measures ~0 and pins the drag range shut.
          <View style={styles.swipeActionSlot}>
            <Animated.View
              style={[styles.swipeDelete, { width, opacity, transform: [{ translateX }] }]}
            >
              <TouchableOpacity
                style={styles.swipeDeleteHit}
                activeOpacity={1}
                onPress={onDelete}
              >
                <Animated.View style={{ transform: [{ scale: iconScale }] }}>
                  <Ionicons name="trash" size={20} color="#fff" />
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>
          </View>
        );
      }}
    >
      <Animated.View
        // Height is only pinned while collapsing; the rest of the time the row
        // sizes naturally so onLayout reports its true height to collapse from.
        style={collapsing && {
          height: collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, rowHeight] }),
          opacity: collapseAnim,
          overflow: 'hidden',
        }}
        onLayout={e => {
          if (collapsing) return; // mid-collapse heights aren't the resting height
          const h = e.nativeEvent.layout.height;
          if (h > 0 && h !== rowHeight) setRowHeight(h);
        }}
      >
      <View style={[styles.setRow, isDone && styles.setRowDone]}>
        <TouchableOpacity
          style={[styles.setTypeBadge, colStyles.setType, { borderColor: typeColor }]}
          onPress={() => !isDone && onOpenTypePicker()}
        >
          <Text style={[styles.setTypeBadgeNum, { color: typeColor }]}>{setIndex + 1}</Text>
          {setType !== 'N' && <Text style={[styles.setTypeBadgeLabel, { color: typeColor }]}>{setType}</Text>}
        </TouchableOpacity>

        <Text style={[styles.prevCellText, colStyles.prev]}>{prevText}</Text>

        <TextInput
          ref={r => registerInputRef?.('reps', r)}
          style={[styles.setInput, colStyles.input, isDone && styles.setInputDone]}
          placeholder="—"
          placeholderTextColor={colors.placeholder}
          // number-pad, not numeric: reps are whole numbers, and numeric's iOS
          // keypad offers a decimal point. Weight below stays numeric — it is
          // legitimately fractional.
          keyboardType="number-pad"
          editable={!isDone}
          value={set.reps}
          onChangeText={onChangeReps}
          onFocus={onFocusReps}
          onBlur={onBlur}
        />

        {!bodyweight && (
          <TextInput
            ref={r => registerInputRef?.('weight', r)}
            style={[styles.setInput, colStyles.input, isDone && styles.setInputDone]}
            placeholder="—"
            placeholderTextColor={colors.placeholder}
            keyboardType="numeric"
            editable={!isDone}
            value={set.weight}
            onChangeText={onChangeWeight}
            onFocus={onFocusWeight}
            onBlur={onBlur}
          />
        )}

        {showRpe && (
          <TouchableOpacity
            style={[styles.setInput, colStyles.rpe, styles.rpeTouchable, isDone && styles.setInputDone]}
            onPress={() => !isDone && onOpenRpePicker()}
            disabled={isDone}
            activeOpacity={0.7}
          >
            <Text style={[styles.rpeValueText, !set.rpe && { color: colors.placeholder }]}>
              {set.rpe || '—'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[colStyles.check, { alignItems: 'center' }]}
          onPress={onToggleDone}
        >
          <Ionicons
            name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
            size={30}
            color={isDone ? colors.save : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
      {!!prHint && (
        <View style={styles.prHintRow}>
          <Ionicons name="trophy-outline" size={12} color={PR_GOLD_TEXT} />
          <Text style={styles.prHintText}>{prHint}</Text>
        </View>
      )}
      </Animated.View>
    </Swipeable>
  );
}

export default React.memo(SetRow);

const createStyles = (colors: Colors) => StyleSheet.create({
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
    borderRadius: spacing.xs,
  },
  setRowDone: { backgroundColor: 'rgba(52,199,89,0.08)' },

  setTypeBadge: {
    borderWidth: 1,
    borderRadius: 4,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  setTypeBadgeNum: { fontSize: 12, fontWeight: '700', lineHeight: 14 },
  setTypeBadgeLabel: { fontSize: 10, fontWeight: '600', lineHeight: 12 },

  prevCellText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginHorizontal: spacing.xs,
  },

  setInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    textAlign: 'center',
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    backgroundColor: colors.background,
    height: 44,
  },
  setInputDone: { opacity: 0.5 },

  rpeTouchable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  rpeValueText: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  prHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  prHintText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: PR_GOLD_TEXT,
  },

  // Anchored right so the animated width grows leftward, over the row, rather
  // than pushing the button off the screen edge.
  swipeActionSlot: {
    width: ACTION_WIDTH,
    alignItems: 'flex-end',
  },
  swipeDelete: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    // Square corners so the red sits flush against the set row
    marginBottom: spacing.sm,
    overflow: 'hidden',
    alignSelf: 'flex-end',
    height: '100%',
  },
  // Fills the action so the whole red area stays tappable as it grows, with the
  // icon pinned right: it then sits under the thumb through the swipe instead
  // of drifting toward the middle of an ever-wider button.
  swipeDeleteHit: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
  },
});
