import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { spacing } from '../theme/spacing';

// Mirrors the native splash (app.config.js → Arete_splash.png, contain,
// #141416) so the handoff from the OS splash into in-app loading screens is
// seamless. The background must match the splash config exactly, which is
// theme-independent — hence the fixed color instead of theme tokens.
const SPLASH_BG = '#141416';

export default function SplashView({ children }: { children?: React.ReactNode }) {
  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/Arete_splash.png')}
        style={styles.image}
        resizeMode="contain"
      />
      <View style={styles.footer}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_BG,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  footer: {
    position: 'absolute',
    bottom: spacing.xl * 3,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
