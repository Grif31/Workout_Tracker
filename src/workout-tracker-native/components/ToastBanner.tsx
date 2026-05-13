import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerToastCallback } from '../utils/toast';

const SLIDE_DURATION = 250;
const DISPLAY_DURATION = 3000;

export function ToastBanner() {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const translateY = useRef(new Animated.Value(-80)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    registerToastCallback((msg) => {
      if (timer.current) clearTimeout(timer.current);

      setMessage(msg);
      setVisible(true);
      translateY.setValue(-80);

      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }).start();

      timer.current = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: -80,
          duration: SLIDE_DURATION,
          useNativeDriver: true,
        }).start(() => setVisible(false));
      }, DISPLAY_DURATION);
    });

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        { top: insets.top + 8, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: '#FF453A',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },
});
