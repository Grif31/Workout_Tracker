import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { GREEK_RANK_COLORS } from '../constants/greekRanks';
import { useTheme } from '../context/ThemeContext';
import { reduceMotion } from '../utils/motion';
import {
  FRAME_GLINT_STOPS, FRAME_OLIVE, FRAME_PANEL, PHOTO_R, SMALL_FRAME_PX,
  frameArt, frameReach, mix, type FrameLayer,
} from '../utils/frameArt';

export { GREEK_RANK_COLORS };

// The frame's own box in frame units: -10..110 around a photo of radius 36
const VIEW_UNITS = 120;
const VIEWBOX = '-10 -10 120 120';

/** How far a rank's frame draws outside `size`, so callers can leave room for
 *  it. Ornaments sit outside the ring so the photo keeps its size. */
export function frameOverflow(rankName: string, size: number, avatarSize: number): number {
  const reach = frameReach(rankName, size < SMALL_FRAME_PX) * (avatarSize / 2);
  return Math.max(0, Math.ceil(reach - size / 2));
}

interface Props {
  rankName: string;
  size: number;    // outer size of the container (avatar size + frame space)
  avatarSize: number; // actual image/circle inner size
}

/**
 * The rank frame around a profile photo (TODO §27): each rank keeps every
 * ornament below it and adds one, in a metal finish tinted by its colour.
 * Gradients and offset copies only, no SVG filters. Olympian and up carry a
 * glint that sweeps the rim, still under Reduce Motion.
 */
export default function ProfileAvatarFrame({ rankName, size, avatarSize }: Props) {
  const { mode } = useTheme();
  const color = GREEK_RANK_COLORS[rankName] ?? GREEK_RANK_COLORS.Neophyte;
  const small = size < SMALL_FRAME_PX;
  const art = frameArt(rankName, small);
  const light = mode === 'light';

  const spin = useRef(new Animated.Value(0)).current;
  const animated = !!art.glint;

  // Native driver on a wrapping view, not SVG props: a JS-driven loop here
  // re-laid out Home every frame for as long as it stayed mounted, including
  // under a GPS run with the phone locked, until iOS's watchdog killed the app.
  // The glint never stops, so with Reduce Motion on it doesn't start
  useEffect(() => {
    if (!animated || reduceMotion()) return;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 4800, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => { loop.stop(); spin.setValue(0); };
  }, [animated]);

  const paints = useMemo(() => ({
    hi: mix(color, '#ffffff', 0.6),
    lo: mix(color, '#000000', 0.5),
    groundIn: mix(color, FRAME_PANEL, 0.55),
    groundOut: mix(color, FRAME_PANEL, 0.85),
    ink: mix(color, '#ffffff', 0.35),
    edge: mix(color, '#000000', 0.45),
  }), [color]);

  const box = VIEW_UNITS * (avatarSize / (2 * PHOTO_R));
  const offset = (size - box) / 2;
  const boxStyle = { position: 'absolute' as const, top: offset, left: offset, width: box, height: box };
  // Black offsets read as heavy outlines on white, so they soften in light mode
  const ringShadow = `rgba(0,0,0,${light ? 0.2 : 0.55})`;
  const solidShadow = `rgba(0,0,0,${light ? 0.18 : 0.5})`;

  const fillFor = (paint: string) => (paint === 'ink' ? paints.ink : paint === 'olive' ? 'url(#olive)' : 'url(#rim)');

  const layer = (l: FrameLayer, k: number) => {
    switch (l.kind) {
      case 'ring':
        return (
          <G key={k}>
            <Path d={l.d} fill="none" stroke={ringShadow} strokeWidth={l.width + 1.2} transform="translate(0.4 0.8)" />
            <Path d={l.d} fill="none" stroke="url(#rim)" strokeWidth={l.width} />
          </G>
        );
      case 'ground':
        return <Path key={k} d={l.d} fill="none" stroke="url(#ground)" strokeWidth={l.width} />;
      case 'solid':
        return (
          <G key={k}>
            <Path d={l.d} fill={solidShadow} transform="translate(0.5 0.9)" />
            <Path d={l.d} fill={fillFor(l.paint)} />
          </G>
        );
      case 'line':
        return <Path key={k} d={l.d} fill="none" stroke={l.paint === 'stem' ? FRAME_OLIVE.stem : 'url(#rim)'} strokeWidth={l.width} />;
      case 'key':
        return (
          <G key={k}>
            <Path d={l.d} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={1} strokeLinejoin="miter" transform="translate(0.3 0.5)" />
            <Path d={l.d} fill="none" stroke={paints.ink} strokeWidth={1} strokeLinejoin="miter" />
          </G>
        );
    }
  };

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View pointerEvents="none" style={boxStyle}>
      <Svg width={box} height={box} viewBox={VIEWBOX}>
        <Defs>
          <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={paints.hi} />
            <Stop offset="0.42" stopColor={color} />
            <Stop offset="0.78" stopColor={paints.lo} />
            <Stop offset="1" stopColor={color} />
          </LinearGradient>
          <RadialGradient id="ground" cx="0.38" cy="0.3" r="0.8">
            <Stop offset="0" stopColor={paints.groundIn} />
            <Stop offset="1" stopColor={paints.groundOut} />
          </RadialGradient>
          <RadialGradient id="olive" cx="0.5" cy="0.4" r="0.7">
            <Stop offset="0" stopColor={FRAME_OLIVE.light} />
            <Stop offset="1" stopColor={FRAME_OLIVE.stem} />
          </RadialGradient>
        </Defs>
        {art.layers.map(layer)}
        {/* Keeps a pale frame (Aretē's gold, the yellow-green olive) clear of a white page */}
        {light && <Path d={art.edge} fill="none" stroke={paints.edge} strokeWidth={0.7} />}
      </Svg>
      {art.glint && (
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, width: box, height: box, transform: [{ rotate }] }}>
          <Svg width={box} height={box} viewBox={VIEWBOX}>
            <Defs>
              <LinearGradient id="glint" x1="0" y1="0" x2="1" y2="1">
                {FRAME_GLINT_STOPS.map(([offset, opacity]) => (
                  <Stop key={offset} offset={offset} stopColor="#ffffff" stopOpacity={opacity} />
                ))}
              </LinearGradient>
            </Defs>
            <Path d={art.glint.d} fill="none" stroke="url(#glint)" strokeWidth={art.glint.width} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}
