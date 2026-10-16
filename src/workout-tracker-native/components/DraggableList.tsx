import React, { useLayoutEffect, useRef, useState } from 'react';
import { unstable_batchedUpdates, Animated, PanResponder, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

// Long-press-drag reorder list for short, fixed-height rows.
// Built on RN Animated + PanResponder (like CoachScreen's tab swipe) —
// deliberately avoids Reanimated worklets, which crash in this app
// ("non-worklet function on the UI thread"; react-native-draggable-flatlist
// died the same way). Rows must all be `rowHeight` tall. No autoscroll —
// intended for lists that fit on screen.
//
// Every row owns an Animated.Value offset (kept per key). The dragged row
// follows the finger; as it crosses a neighbor, that neighbor eases one step
// out of the way. On drop the dragged row eases into its slot, then in one
// update the array reorders, the active flag clears and a layout effect zeroes
// every offset before paint, so the final positions match what was animated
// and nothing visibly jumps. A short timeout re-zeroes in case the parent
// declines the reorder (keys unchanged, so the layout effect never fires).

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

  const offsets = useRef<Record<string, Animated.Value>>({});
  const offsetFor = (key: string) => (offsets.current[key] ??= new Animated.Value(0));
  const dragYRef = useRef(0);
  const targetRef = useRef(-1);

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const resetOffsets = () => {
    Object.values(offsets.current).forEach(v => { v.stopAnimation(); v.setValue(0); });
  };

  // Runs after the reordered rows commit and before paint.
  const keyOrder = keys.join('|');
  useLayoutEffect(() => {
    resetOffsets();
    const live = new Set(keys);
    Object.keys(offsets.current).forEach(k => { if (!live.has(k)) delete offsets.current[k]; });
  }, [keyOrder]);

  const slide = (value: Animated.Value, toValue: number) => {
    Animated.timing(value, { toValue, duration: 160, useNativeDriver: false }).start();
  };

  // Sets each neighbor's resting offset for the slot the dragged row hovers over.
  const shiftNeighbors = (from: number, target: number) => {
    keys.forEach((k, i) => {
      if (i === from) return;
      let off = 0;
      if (from < target && i > from && i <= target) off = -step;
      else if (target < from && i >= target && i < from) off = step;
      slide(offsetFor(k), off);
    });
  };

  const startDrag = (index: number) => {
    draggingRef.current = true;
    activeIndexRef.current = index;
    targetRef.current = index;
    dragYRef.current = 0;
    resetOffsets();
    setActiveIndex(index);
    onDragActiveChange?.(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const from = activeIndexRef.current;
    const to = targetRef.current;
    onDragActiveChange?.(false);
    const finish = () => {
      activeIndexRef.current = -1;
      targetRef.current = -1;
      dragYRef.current = 0;
      unstable_batchedUpdates(() => {
        setActiveIndex(-1);
        if (from >= 0 && from !== to) onReorder(from, to);
      });
      setTimeout(resetOffsets, 80);
    };
    Animated.timing(offsetFor(keys[from]), {
      toValue: (to - from) * step, duration: 160, useNativeDriver: false,
    }).start(finish);
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
      offsetFor(keys[active]).setValue(clamped);
      const target = Math.max(0, Math.min(count - 1, active + Math.round(clamped / step)));
      if (target !== targetRef.current) {
        targetRef.current = target;
        shiftNeighbors(active, target);
        Haptics.selectionAsync();
      }
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
              { transform: [{ translateY: offsetFor(key) }, { scale: isActive ? 1.02 : 1 }] },
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
