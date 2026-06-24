import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { GREEK_RANK_COLORS } from '../constants/greekRanks';

export { GREEK_RANK_COLORS };

const RANK_FRAMES: Record<string, {
  strokeWidth: number;
  animated: boolean;
  dashed?: boolean;
}> = {
  Neophyte: { strokeWidth: 3,  animated: false },
  Athlete:  { strokeWidth: 4,  animated: false },
  Hero:     { strokeWidth: 5,  animated: false },
  Demigod:  { strokeWidth: 5,  animated: false, dashed: true },
  Olympian: { strokeWidth: 6,  animated: true  },
  Titan:    { strokeWidth: 7,  animated: true  },
  'Aretē':  { strokeWidth: 7,  animated: true  },
};

interface Props {
  rankName: string;
  size: number;    // outer size of the SVG container (avatar size + frame space)
  avatarSize: number; // actual image/circle inner size
}

export default function ProfileAvatarFrame({ rankName, size, avatarSize }: Props) {
  const frame = RANK_FRAMES[rankName] ?? RANK_FRAMES['Neophyte'];
  const color = GREEK_RANK_COLORS[rankName] ?? '#888888';

  const animRef = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!frame.animated) return;
    Animated.loop(
      Animated.timing(animRef, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ).start();
  }, [frame.animated]);

  const radius = size / 2 - frame.strokeWidth / 2;
  const cx = size / 2;
  const cy = size / 2;

  const AnimatedCircle = Animated.createAnimatedComponent(Circle);

  const opacity = frame.animated
    ? animRef.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.4, 1] })
    : 1;

  const dashArray = frame.dashed
    ? `${Math.PI * radius * 0.15} ${Math.PI * radius * 0.05}`
    : undefined;

  return (
    <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
      {rankName === 'Aretē' && (
        <Defs>
          <LinearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFD700" />
            <Stop offset="0.5" stopColor="#FFF3C4" />
            <Stop offset="1" stopColor="#FFD700" />
          </LinearGradient>
        </Defs>
      )}
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={radius}
        stroke={rankName === 'Aretē' ? 'url(#goldGrad)' : color}
        strokeWidth={frame.strokeWidth}
        fill="none"
        strokeDasharray={dashArray}
        opacity={opacity as any}
      />
    </Svg>
  );
}
