import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Drives a collapse from a single Animated.Value so height and opacity can
 * never desync — the failure mode of LayoutAnimation, which animates the
 * container's height and the children's fade on separate timelines and leaves
 * text hanging over an already-shrunk box.
 *
 * Owned by the caller (rather than by <Collapsible>) so the same value can also
 * drive a chevron rotation next to the toggle.
 */
export function useCollapseAnim(expanded: boolean, duration = 240) {
  const anim = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const firstRef = useRef(true);

  useEffect(() => {
    // Jump straight to the resting value on mount rather than animating to it
    if (firstRef.current) {
      firstRef.current = false;
      anim.setValue(expanded ? 1 : 0);
      return;
    }
    Animated.timing(anim, {
      toValue: expanded ? 1 : 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // height can't use the native driver
    }).start();
  }, [expanded, duration]);

  return anim;
}

type Props = {
  /** 0 = collapsed, 1 = expanded. From useCollapseAnim. */
  progress: Animated.Value;
  expanded: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function Collapsible({ progress, expanded, children, style }: Props) {
  const [contentH, setContentH] = useState(0);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, contentH] }),
          // Held at 0 through the last 30% of the collapse so the content is
          // gone before the container finishes closing, instead of lingering
          // over a shrinking box.
          opacity: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0, 1] }),
        },
        style,
      ]}
      pointerEvents={expanded ? 'auto' : 'none'}
    >
      {/* Absolutely positioned so the wrapper's animated height can never
          constrain how the content measures. Yoga measures an in-flow child of
          a fixed-height, non-scroll container at most that height, so a
          collapsed (0px) wrapper squeezed text to 0 while padding and margins
          stayed, and that too-small reading replaced the real one. An absolute
          child with no height or bottom offset always measures at its natural
          height. */}
      <View
        style={styles.content}
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          if (h !== contentH) setContentH(h);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: 'hidden' },
  content: { position: 'absolute', top: 0, left: 0, right: 0 },
});
