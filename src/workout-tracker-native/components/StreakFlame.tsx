import React from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { FLAME_TOP, FLAME_MID, FLAME_BOTTOM, FLAME_CORE } from '../constants/streakColors';

type Props = {
  size?: number;
  /** A broken streak burns out: same shape, drawn flat in the given color. */
  active?: boolean;
  inactiveColor?: string;
  testID?: string;
};

// Drawn rather than an emoji or an Ionicon: the emoji rendered at the mercy of
// each platform's font and couldn't be dimmed for a zero streak.
export default function StreakFlame({ size = 20, active = true, inactiveColor, testID }: Props) {
  // Unique-ish id so two flames on one screen can't share a gradient def
  const gradientId = `flameGradient${active ? 'On' : 'Off'}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" testID={testID}>
      <Defs>
        {/* Three stops over the flame's full height: two alone banded across
            a shape this small */}
        <LinearGradient id={gradientId} x1="0" y1="0.05" x2="0" y2="0.95">
          <Stop offset="0" stopColor={active ? FLAME_TOP : (inactiveColor ?? FLAME_TOP)} />
          <Stop offset="0.5" stopColor={active ? FLAME_MID : (inactiveColor ?? FLAME_MID)} />
          <Stop offset="1" stopColor={active ? FLAME_BOTTOM : (inactiveColor ?? FLAME_BOTTOM)} />
        </LinearGradient>
        <LinearGradient id={`${gradientId}Core`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={active ? FLAME_CORE : (inactiveColor ?? FLAME_CORE)} />
          <Stop offset="1" stopColor={active ? FLAME_TOP : (inactiveColor ?? FLAME_TOP)} />
        </LinearGradient>
      </Defs>

      {/* Outer flame: a teardrop with a licked-up tip and a notch on the left */}
      <Path
        d="M12 2C13.1 5.8 17.2 7.3 17.2 11.6C17.2 15.6 14.9 18.4 12 18.4C9.1 18.4 6.8 15.6 6.8 11.6C6.8 9 8.1 7.2 9.5 5.8C9.7 7.9 10.5 8.9 11.2 9.4C11 6.8 11.3 4.3 12 2Z"
        fill={`url(#${gradientId})`}
      />

      {/* Inner core, brighter and smaller, sitting low in the flame */}
      <Path
        d="M12 9.2C12.8 11.1 14.4 12.2 14.4 14.1C14.4 16 13.3 17.3 12 17.3C10.7 17.3 9.6 16 9.6 14.1C9.6 12.6 10.7 11.2 12 9.2Z"
        fill={`url(#${gradientId}Core)`}
        opacity={active ? 1 : 0.6}
      />
    </Svg>
  );
}
