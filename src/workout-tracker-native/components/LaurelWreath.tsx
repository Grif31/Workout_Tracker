import React from 'react';
import Svg, { G, Path } from 'react-native-svg';

// Pointed oval leaf: tip up, 4px wide × 10px tall, centered at origin
const LEAF = 'M 0 -5 Q 2 -2 2 0 Q 2 2 0 5 Q -2 2 -2 0 Q -2 -2 0 -5 Z';

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

export function LaurelBranch({ side = 'left', height = 24, color = '#FFD700' }: Props) {
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

export default LaurelBranch;
