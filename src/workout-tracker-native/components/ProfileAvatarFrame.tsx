import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';
import { GREEK_RANK_COLORS } from '../constants/greekRanks';
import { LaurelRing } from './LaurelWreath';

export { GREEK_RANK_COLORS };

const RANK_FRAMES: Record<string, {
  strokeWidth: number;
  animated: boolean;
  dashed?: boolean;
  wreath?: boolean;
}> = {
  Neophyte: { strokeWidth: 3,  animated: false },
  Athlete:  { strokeWidth: 4,  animated: false },
  Hero:     { strokeWidth: 5,  animated: false },
  Demigod:  { strokeWidth: 5,  animated: false, dashed: true },
  Olympian: { strokeWidth: 6,  animated: true  },
  Titan:    { strokeWidth: 7,  animated: true  },
  'Aretē':  { strokeWidth: 7,  animated: true, wreath: true },
};

// The wreath sits outside the ring, so its SVG is drawn larger than `size` and
// pulled back by the same amount — the ring stays exactly where it was.
const WREATH_BLEED = 0.13;

/** How far a rank's frame draws outside `size`, so callers can leave room for
 *  it. Only the wreathed frame overflows; every other rank returns 0. */
export function frameOverflow(rankName: string, size: number): number {
  return RANK_FRAMES[rankName]?.wreath ? Math.round(size * WREATH_BLEED) : 0;
}

interface Props {
  rankName: string;
  size: number;    // outer size of the SVG container (avatar size + frame space)
  avatarSize: number; // actual image/circle inner size
}

export default function ProfileAvatarFrame({ rankName, size, avatarSize }: Props) {
  const frame = RANK_FRAMES[rankName] ?? RANK_FRAMES['Neophyte'];
  const color = GREEK_RANK_COLORS[rankName] ?? GREEK_RANK_COLORS.Neophyte;

  const animRef = useRef(new Animated.Value(0)).current;

  // Native driver on a wrapping view, not SVG props: a JS-driven loop here
  // re-laid out Home every frame for as long as it stayed mounted, including
  // under a GPS run with the phone locked, until iOS's watchdog killed the app.
  useEffect(() => {
    if (!frame.animated) return;
    const loop = Animated.loop(
      Animated.timing(animRef, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => { loop.stop(); animRef.setValue(0); };
  }, [frame.animated]);

  const bleed  = frameOverflow(rankName, size);
  const box    = size + bleed * 2;
  const radius = size / 2 - frame.strokeWidth / 2;
  const cx = box / 2;
  const cy = box / 2;

  const opacity = frame.animated
    ? animRef.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.4, 1] })
    : 1;

  const dashArray = frame.dashed
    ? `${Math.PI * radius * 0.15} ${Math.PI * radius * 0.05}`
    : undefined;

  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top: -bleed, left: -bleed, width: box, height: box, opacity }}
    >
      <Svg width={box} height={box}>
        {rankName === 'Aretē' && (
          <Defs>
            <LinearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={GREEK_RANK_COLORS['Aretē']} />
              <Stop offset="0.5" stopColor="#FFF3C4" />
              <Stop offset="1" stopColor={GREEK_RANK_COLORS['Aretē']} />
            </LinearGradient>
          </Defs>
        )}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={rankName === 'Aretē' ? 'url(#goldGrad)' : color}
          strokeWidth={frame.strokeWidth}
          fill="none"
          strokeDasharray={dashArray}
        />
        {frame.wreath && (
          <G>
            <LaurelRing
              cx={cx}
              cy={cy}
              radius={radius + frame.strokeWidth / 2 + size * 0.02}
              leafLength={size * 0.115}
              color={color}
            />
          </G>
        )}
      </Svg>
    </Animated.View>
  );
}
