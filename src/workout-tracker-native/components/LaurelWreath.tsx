import React from 'react';
import Svg, { G, Path } from 'react-native-svg';
import { PR_GOLD } from '../constants/prColors';

// Pointed oval leaf: tip up, 4px wide × 10px tall, centered at origin
const LEAF = 'M 0 -5 Q 2 -2 2 0 Q 2 2 0 5 Q -2 2 -2 0 Q -2 -2 0 -5 Z';
const LEAF_H = 10;

// Left branch: stem runs along the right side, 5 leaves fan outward-left
const STEM = 'M 12 2 Q 10 8 9 15 Q 8 22 10 28';
// [x, y, angleDeg] — angle 0 = leaf points up; -90 = points left
const LEAF_CONFIGS: [number, number, number][] = [
  [11,  5, -120],
  [10, 10, -105],
  [ 8, 15,  -90],
  [ 8, 20,  -75],
  [10, 25,  -60],
];
const VB_W = 16;
const VB_H = 30;

type Props = {
  side?: 'left' | 'right';
  height?: number;
  color?: string;
};

export function LaurelBranch({ side = 'left', height = 24, color = PR_GOLD }: Props) {
  const width = Math.round(height * VB_W / VB_H);
  const mirror = side === 'right' ? `translate(${VB_W}, 0) scale(-1, 1)` : undefined;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      <G transform={mirror}>
        <Path d={STEM} stroke={color} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        {LEAF_CONFIGS.map(([x, y, angle], i) => (
          <G key={i} transform={`translate(${x}, ${y}) rotate(${angle})`}>
            <Path d={LEAF} fill={color} />
          </G>
        ))}
      </G>
    </Svg>
  );
}

// ── Ring wreath ───────────────────────────────────────────────────────────────
// Two mirrored branches sweeping up from the bottom of a circle, open at the
// top, sized to hug a ring of a given radius. Returns a <G> for a caller's <Svg>.
const RING_LEAF_COUNT = 8;
const RING_START_DEG  = 92;   // screen angle: 0 = right, 90 = bottom of the ring
const RING_END_DEG    = -46;  // sweeps up the side, leaving the top open
const RING_TILT_DEG   = 38;   // how far each leaf angles outward off the stem
const RING_TIP_TAPER  = 0.35; // leaves shrink toward the open top

type RingProps = {
  cx: number;
  cy: number;
  radius: number;     // radius of the stem arc, not of the leaf tips
  leafLength: number;
  color?: string;
};

function ringLeaves(cx: number, cy: number, radius: number, leafLength: number, color: string) {
  return Array.from({ length: RING_LEAF_COUNT }, (_, i) => {
    const t   = i / (RING_LEAF_COUNT - 1);
    const deg = RING_START_DEG + (RING_END_DEG - RING_START_DEG) * t;
    const rad = (deg * Math.PI) / 180;
    const len = leafLength * (1 - RING_TIP_TAPER * t);
    // rotate(deg) alone lays a leaf along the stem; the tilt fans it outward
    const angle = deg + RING_TILT_DEG;
    const aRad  = (angle * Math.PI) / 180;
    // offset by half a leaf so the base sits on the stem and the tip points out
    const x = cx + radius * Math.cos(rad) + (len / 2) * Math.sin(aRad);
    const y = cy + radius * Math.sin(rad) - (len / 2) * Math.cos(aRad);
    return (
      <G key={i} transform={`translate(${x.toFixed(2)}, ${y.toFixed(2)}) rotate(${angle.toFixed(1)}) scale(${(len / LEAF_H).toFixed(3)})`}>
        <Path d={LEAF} fill={color} />
      </G>
    );
  });
}

export function LaurelRing({ cx, cy, radius, leafLength, color = PR_GOLD }: RingProps) {
  const point = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return `${(cx + radius * Math.cos(r)).toFixed(2)} ${(cy + radius * Math.sin(r)).toFixed(2)}`;
  };
  const stem = `M ${point(RING_START_DEG)} A ${radius} ${radius} 0 0 0 ${point(RING_END_DEG)}`;
  const branch = (
    <>
      <Path d={stem} stroke={color} strokeWidth={Math.max(0.8, leafLength * 0.12)} fill="none" strokeLinecap="round" />
      {ringLeaves(cx, cy, radius, leafLength, color)}
    </>
  );
  return (
    <G>
      <G>{branch}</G>
      {/* mirror about x = cx for the opposite branch */}
      <G transform={`translate(${cx * 2}, 0) scale(-1, 1)`}>{branch}</G>
    </G>
  );
}

export default LaurelBranch;
