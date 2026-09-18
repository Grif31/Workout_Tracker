import React from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { FLAME_TOP, FLAME_BOTTOM, FLAME_CORE } from '../constants/streakColors';

type Props = {
  size?: number;
  /** A broken streak burns out: same shape, drawn flat in the given color. */
  active?: boolean;
  inactiveColor?: string;
  testID?: string;
};

// Drawn rather than an emoji or an Ionicon: the emoji rendered at the mercy of
// each platform's font and couldn't be dimmed for a zero streak.
export default function StreakFlame({ size = 18, active = true, inactiveColor, testID }: Props) {
  // Unique-ish id so two flames on one screen can't share a gradient def
  const gradientId = `flameGradient${active ? 'On' : 'Off'}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" testID={testID}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={active ? FLAME_TOP : (inactiveColor ?? FLAME_TOP)} />
          <Stop offset="1" stopColor={active ? FLAME_BOTTOM : (inactiveColor ?? FLAME_BOTTOM)} />
        </LinearGradient>
      </Defs>

      {/* Outer flame: a teardrop with a licked-up tip and a notch on the left */}
      <Path
        d="M12 2.2C12.9 5.6 16.5 7.2 16.5 11.4C16.5 15.1 14.4 17.8 12 17.8C9.6 17.8 7.5 15.1 7.5 11.4C7.5 9.1 8.6 7.6 9.8 6.3C10 8 10.6 8.9 11.2 9.3C11.1 6.9 11.4 4.5 12 2.2Z"
        fill={`url(#${gradientId})`}
      />

      {/* Inner core, brighter and smaller, sitting low in the flame */}
      <Path
        d="M12 9.6C12.6 11.2 14 12.2 14 13.9C14 15.6 13.1 16.8 12 16.8C10.9 16.8 10 15.6 10 13.9C10 12.6 10.9 11.4 12 9.6Z"
        fill={active ? FLAME_CORE : (inactiveColor ?? FLAME_CORE)}
        opacity={active ? 1 : 0.6}
      />
    </Svg>
  );
}
