import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';

// Long-press-drag reorder list for short, fixed-height rows.
// Built on RN Animated + PanResponder (like CoachScreen's tab swipe) —
// deliberately avoids Reanimated worklets, which crash in this app
// ("non-worklet function on the UI thread"; react-native-draggable-flatlist
// died the same way). Rows must all be `rowHeight` tall. No autoscroll —
// intended for lists that fit on screen.
//
// Each item owns one Animated.Value for its whole life (keyed by item, not
// index) so a view's native transform binding never changes across reorders —
// re-binding natively-driven values across views leaves stale transforms.

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

export default function DraggableList<T>({
  data, keyExtractor, renderItem, onReorder, rowHeight, gap = 0, onDragActiveChange,
}: Props<T>) {
  const step = rowHeight + gap;
  const count = data.length;
  const keys = data.map(keyExtractor);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeIndexRef = useRef(-1);
  const slotRef = useRef(-1);
  const draggingRef = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef({ x: 0, y: 0 });

  // One Animated.Value per item, stable for the item's lifetime
  const valuesByKey = useRef(new Map<string, Animated.Value>());
  const getValue = (key: string): Animated.Value => {
    let v = valuesByKey.current.get(key);
    if (!v) {
      v = new Animated.Value(0);
      valuesByKey.current.set(key, v);
    }
    return v;
  };
  // Keep a live snapshot of the current key order for handlers
  const keysRef = useRef<string[]>(keys);
  keysRef.current = keys;

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const resetAllValues = () => {
    valuesByKey.current.forEach(v => {
      v.stopAnimation();
      v.setValue(0);
    });
  };

  // After a reorder commits, zero the transforms in the same frame the new
  // layout lands — zeroing before the commit paints one frame of the old
  // layout (rows flash back to their pre-drag spots)
  const pendingResetRef = useRef(false);
  useLayoutEffect(() => {
    if (pendingResetRef.current) {
      pendingResetRef.current = false;
      resetAllValues();
    }
  }, [data]);

  const startDrag = (index: number) => {
    draggingRef.current = true;
    activeIndexRef.current = index;
    slotRef.current = index;
    resetAllValues();
    setActiveKey(keysRef.current[index]);
    onDragActiveChange?.(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const updateSlot = (dy: number) => {
    const active = activeIndexRef.current;
    const raw = Math.round((active * step + dy) / step);
    const slot = Math.max(0, Math.min(count - 1, raw));
    if (slot === slotRef.current) return;
    slotRef.current = slot;
    keysRef.current.forEach((key, i) => {
      if (i === active) return;
      let target = 0;
      if (i > active && i <= slot) target = -step;
      else if (i < active && i >= slot) target = step;
      Animated.timing(getValue(key), { toValue: target, duration: 150, useNativeDriver: true }).start();
    });
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    const from = activeIndexRef.current;
    const to = slotRef.current;
    draggingRef.current = false;
    activeIndexRef.current = -1;
    slotRef.current = -1;
    setActiveKey(null);
    onDragActiveChange?.(false);

    if (from === to || from < 0 || to < 0) {
      // No reorder — glide everything back to resting positions
      valuesByKey.current.forEach(v => {
        v.stopAnimation();
        Animated.timing(v, { toValue: 0, duration: 120, useNativeDriver: true }).start();
      });
      return;
    }

    // Keep current transforms; the layout effect zeroes them in the same
    // frame the reordered layout commits, so nothing flashes
    pendingResetRef.current = true;
    onReorder(from, to);
  };

  const makeResponder = (index: number) => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: () => draggingRef.current && activeIndexRef.current === index,
    onMoveShouldSetPanResponderCapture: () => draggingRef.current && activeIndexRef.current === index,
    onPanResponderMove: (_, g) => {
      const active = activeIndexRef.current;
      const maxUp = -active * step;
      const maxDown = (count - 1 - active) * step;
      getValue(keysRef.current[active]).setValue(Math.max(maxUp, Math.min(maxDown, g.dy)));
      updateSlot(g.dy);
    },
    onPanResponderRelease: endDrag,
    onPanResponderTerminate: endDrag,
    onPanResponderTerminationRequest: () => false,
  });

  return (
    <View>
      {data.map((item, index) => {
        const key = keys[index];
        const isActive = key === activeKey;
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
              { transform: [{ translateY: getValue(key) }, { scale: isActive ? 1.02 : 1 }] },
            ]}
          >
            {renderItem(item, index)}
          </Animated.View>
        );
      })}
    </View>
  );
}

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
