import React, { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

// Long-press-drag reorder list for short, fixed-height rows.
// Built on RN Animated + PanResponder (like CoachScreen's tab swipe) —
// deliberately avoids Reanimated worklets, which crash in this app
// ("non-worklet function on the UI thread"; react-native-draggable-flatlist
// died the same way). Rows must all be `rowHeight` tall. No autoscroll —
// intended for lists that fit on screen.
//
// Only the actively-dragged row is ever transformed — it floats above the
// list (elevated shadow/zIndex) and follows the finger; every other row
// stays put in normal flex flow the whole time and simply appears in its
// new spot once the array reorders on drop. An earlier version animated
// every row's position live during the drag (a continuous "neighbors slide
// out of the way" preview) via a persistent Animated.Value per item, reset
// through a layout effect once the reorder committed — that reset proved
// unreliable in practice (rows could end up visually stuck mid-transform,
// overlapping a neighbor). This design has nothing to reset: at most one
// row ever has a transform applied, and it's torn down the instant the drag
// ends, in the same state update that clears "active".

type Props<T> = {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  onReorder: (from: number, to: number) => void;
  rowHeight: number;
  gap?: number;
  /** Fires with true while a row is being dragged — use to disable outer scroll. */
  onDragActiveChange?: (active: boolean) => void;
};

const LONG_PRESS_MS = 300;
const MOVE_CANCEL_THRESHOLD = 8;

function DraggableList<T>({
  data, keyExtractor, renderItem, onReorder, rowHeight, gap = 0, onDragActiveChange,
}: Props<T>) {
  const step = rowHeight + gap;
  const count = data.length;
  const keys = data.map(keyExtractor);

  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);
  const draggingRef = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef({ x: 0, y: 0 });

  // Single shared value, reused for whichever row is currently active — only
  // one row is ever transformed at a time, so there's no per-item lifecycle
  // to manage. dragYRef mirrors it synchronously for endDrag's slot math
  // (Animated.Value has no synchronous getter).
  const dragY = useRef(new Animated.Value(0)).current;
  const dragYRef = useRef(0);

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startDrag = (index: number) => {
    draggingRef.current = true;
    activeIndexRef.current = index;
    dragYRef.current = 0;
    dragY.setValue(0);
    setActiveIndex(index);
    onDragActiveChange?.(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const from = activeIndexRef.current;
    const delta = Math.round(dragYRef.current / step);
    const to = Math.max(0, Math.min(count - 1, from + delta));
    activeIndexRef.current = -1;
    dragY.stopAnimation();
    dragY.setValue(0);
    dragYRef.current = 0;
    setActiveIndex(-1);
    onDragActiveChange?.(false);
    if (from >= 0 && from !== to) onReorder(from, to);
  };

  const makeResponder = (index: number) => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: () => draggingRef.current && activeIndexRef.current === index,
    onMoveShouldSetPanResponderCapture: () => draggingRef.current && activeIndexRef.current === index,
    onPanResponderMove: (_, g) => {
      const active = activeIndexRef.current;
      const maxUp = -active * step;
      const maxDown = (count - 1 - active) * step;
      const clamped = Math.max(maxUp, Math.min(maxDown, g.dy));
      dragYRef.current = clamped;
      dragY.setValue(clamped);
    },
    onPanResponderRelease: endDrag,
    onPanResponderTerminate: endDrag,
    onPanResponderTerminationRequest: () => false,
  });

  return (
    <View>
      {data.map((item, index) => {
        const key = keys[index];
        const isActive = index === activeIndex;
        const responder = makeResponder(index);
        return (
          <Animated.View
            key={key}
            {...responder.panHandlers}
            onTouchStart={e => {
              touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
              clearTimer();
              longPressTimer.current = setTimeout(() => startDrag(index), LONG_PRESS_MS);
            }}
            onTouchMove={e => {
              if (draggingRef.current) return;
              const dx = Math.abs(e.nativeEvent.pageX - touchStart.current.x);
              const dyMoved = Math.abs(e.nativeEvent.pageY - touchStart.current.y);
              // Finger is scrolling or swiping, not holding — abort the long press
              if (dx > MOVE_CANCEL_THRESHOLD || dyMoved > MOVE_CANCEL_THRESHOLD) clearTimer();
            }}
            onTouchEnd={() => { clearTimer(); endDrag(); }}
            onTouchCancel={() => { clearTimer(); endDrag(); }}
            style={[
              styles.rowWrap,
              { height: rowHeight, marginBottom: index < count - 1 ? gap : 0 },
              isActive && styles.rowActive,
              isActive && { transform: [{ translateY: dragY }, { scale: 1.02 }] },
            ]}
          >
            {renderItem(item, index)}
          </Animated.View>
        );
      })}
    </View>
  );
}

// A parent re-rendering for unrelated reasons (e.g. a live ticking timer)
// must not tear down and recreate every row's PanResponder mid-drag — that
// corrupts whichever gesture is in flight. Memoized so DraggableList only
// re-renders when its own props actually change; callers must pass stable
// (useCallback'd) keyExtractor/renderItem/onReorder for this to help — see
// WorkoutLog.tsx for why that mattered.
export default React.memo(DraggableList) as <T>(props: Props<T>) => React.ReactElement | null;

const styles = StyleSheet.create({
  rowWrap: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  rowActive: {
    zIndex: 100,
    elevation: 8,
    shadowOpacity: 0.25,
  },
});
