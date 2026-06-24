import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, Path, G, Rect, Text as SvgText } from 'react-native-svg';
import { GREEK_RANK_COLORS } from '../../constants/greekRanks';

type RankCfg = {
  color: string;
  headR: number;
  sw: number;   // shoulder half-spread
  ww: number;   // waist half-width
  hw: number;   // hip half-width
  aw: number;   // arm half-width
  lw: number;   // leg half-width
  glow: boolean;
  crown: boolean;
  laurel: boolean;
};

const CONFIGS: Record<string, RankCfg> = {
  Neophyte: { color: GREEK_RANK_COLORS.Neophyte, headR: 9,  sw: 10, ww: 7,  hw: 9,  aw: 3,  lw: 4,  glow: false, crown: false, laurel: false },
  Athlete:  { color: GREEK_RANK_COLORS.Athlete,  headR: 10, sw: 13, ww: 9,  hw: 11, aw: 5,  lw: 5,  glow: false, crown: false, laurel: false },
  Hero:     { color: GREEK_RANK_COLORS.Hero,     headR: 10, sw: 16, ww: 11, hw: 13, aw: 7,  lw: 7,  glow: false, crown: false, laurel: false },
  Demigod:  { color: GREEK_RANK_COLORS.Demigod,  headR: 11, sw: 19, ww: 12, hw: 15, aw: 9,  lw: 9,  glow: false, crown: false, laurel: false },
  Olympian: { color: GREEK_RANK_COLORS.Olympian, headR: 11, sw: 21, ww: 13, hw: 16, aw: 10, lw: 10, glow: false, crown: false, laurel: true  },
  Titan:    { color: GREEK_RANK_COLORS.Titan,    headR: 12, sw: 23, ww: 14, hw: 17, aw: 11, lw: 11, glow: false, crown: false, laurel: true  },
  'Aretē':  { color: GREEK_RANK_COLORS['Aretē'], headR: 12, sw: 25, ww: 15, hw: 18, aw: 12, lw: 12, glow: true,  crown: true,  laurel: false },
};

const RANK_SPEECH: Record<string, string> = {
  Neophyte: "Let's begin!",
  Athlete:  'Keep going!',
  Hero:     'Stay strong!',
  Demigod:  'Push harder!',
  Olympian: 'Ascend!',
  Titan:    'Unstoppable!',
  'Aretē':  'Excellence!',
};

const VB_W = 120;
const CX = 60;
// Space above the head reserved for the speech bubble
const BUBBLE_TOP = 4;
const BUBBLE_H = 28;
const BUBBLE_TAIL_TIP_OFFSET = 12; // units below bubble bottom before head starts
const BUBBLE_AREA = BUBBLE_H + BUBBLE_TAIL_TIP_OFFSET + 12; // total extra top height = 52

export default function CoachCharacter({
  rank,
  size = 110,
  speechText,
}: {
  rank: string;
  size?: number;
  speechText?: string;
}) {
  const cfg = CONFIGS[rank] ?? CONFIGS['Neophyte'];
  const { color, headR, sw, ww, hw, aw, lw, glow, crown, laurel } = cfg;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!glow) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  // All body positions offset downward to make room for the speech bubble at top
  const O = BUBBLE_AREA; // vertical offset applied to all body y-coords
  const headCY = O + 16 + headR;
  const neckTop = headCY + headR;
  const torsoTop = neckTop + 5;
  const waistY = torsoTop + 38;
  const hipY = waistY + 8;
  const kneeY = hipY + 28;
  const ankleY = kneeY + 20;
  const VB_H = ankleY + 8;
  const svgHeight = Math.round(size * VB_H / VB_W);

  const neckHW = headR * 0.35;

  // ── Smooth body paths using bezier curves ──────────────────────────────────

  // Torso: shoulder flare uses cubic bezier for a natural V-taper
  const torsoPath = [
    `M ${CX - neckHW} ${torsoTop}`,
    `C ${CX - sw * 0.45} ${torsoTop} ${CX - sw} ${torsoTop + 5} ${CX - sw} ${torsoTop + 14}`,
    `C ${CX - sw} ${waistY - 10} ${CX - ww} ${waistY} ${CX - ww} ${waistY}`,
    `L ${CX + ww} ${waistY}`,
    `C ${CX + ww} ${waistY} ${CX + sw} ${waistY - 10} ${CX + sw} ${torsoTop + 14}`,
    `C ${CX + sw} ${torsoTop + 5} ${CX + sw * 0.45} ${torsoTop} ${CX + neckHW} ${torsoTop}`,
    'Z',
  ].join(' ');

  // Hips: smooth waist-to-leg transition
  const hipPath = [
    `M ${CX - ww} ${waistY}`,
    `C ${CX - ww} ${waistY + 3} ${CX - hw} ${waistY + 6} ${CX - hw} ${hipY}`,
    `L ${CX + hw} ${hipY}`,
    `C ${CX + hw} ${waistY + 6} ${CX + ww} ${waistY + 3} ${CX + ww} ${waistY}`,
    'Z',
  ].join(' ');

  // Left arm: deltoid shoulder curve Q + tapered body, rounded wrist
  const leftArmPath = [
    `M ${CX - sw} ${torsoTop + 14}`,
    `L ${CX - sw} ${waistY + 2}`,
    `Q ${CX - sw - aw * 0.6} ${waistY + 4} ${CX - sw - aw * 1.4} ${waistY + 1}`,
    `L ${CX - sw - aw * 2} ${torsoTop + 12}`,
    `Q ${CX - sw - aw} ${torsoTop + 3} ${CX - sw} ${torsoTop + 14}`,
    'Z',
  ].join(' ');

  // Right arm: mirror of left
  const rightArmPath = [
    `M ${CX + sw} ${torsoTop + 14}`,
    `Q ${CX + sw + aw} ${torsoTop + 3} ${CX + sw + aw * 2} ${torsoTop + 12}`,
    `L ${CX + sw + aw * 1.4} ${waistY + 1}`,
    `Q ${CX + sw + aw * 0.6} ${waistY + 4} ${CX + sw} ${waistY + 2}`,
    `L ${CX + sw} ${torsoTop + 14}`,
    'Z',
  ].join(' ');

  // Left leg: single path with cubic bezier outer edge (quad/calf definition)
  const li = CX - hw;
  const loH = CX - hw - lw * 2;
  const loA = li - lw;
  const leftLegPath = [
    `M ${li} ${hipY}`,
    `L ${li} ${ankleY}`,
    `L ${loA} ${ankleY}`,
    `C ${loA - lw * 0.2} ${kneeY + 2} ${loH + lw * 0.4} ${kneeY} ${loH} ${kneeY - 4}`,
    `C ${loH - lw * 0.1} ${kneeY - 8} ${loH} ${hipY + 6} ${loH} ${hipY}`,
    'Z',
  ].join(' ');

  // Right leg: mirror
  const ri = CX + hw;
  const roH = CX + hw + lw * 2;
  const roA = ri + lw;
  const rightLegPath = [
    `M ${ri} ${hipY}`,
    `C ${roH} ${hipY + 6} ${roH + lw * 0.1} ${kneeY - 8} ${roH} ${kneeY - 4}`,
    `C ${roH - lw * 0.4} ${kneeY} ${roA + lw * 0.2} ${kneeY + 2} ${roA} ${ankleY}`,
    `L ${ri} ${ankleY}`,
    `L ${ri} ${hipY}`,
    'Z',
  ].join(' ');

  // ── Speech bubble (centered above head) ────────────────────────────────────
  const bubble = speechText ?? RANK_SPEECH[rank] ?? '';
  const bubbleLabel = bubble.length > 14 ? bubble.slice(0, 12) + '…' : bubble;
  const bX = 5;
  const bY = BUBBLE_TOP;
  const bW = VB_W - 10; // 110 units wide
  const bubbleBottom = bY + BUBBLE_H;
  // Tail: triangle pointing from bubble bottom-center down toward the head
  const tailTipY = O + 14; // just above head top

  return (
    <Animated.View style={glow ? { transform: [{ scale: pulseAnim }] } : undefined}>
      <Svg width={size} height={svgHeight} viewBox={`0 0 ${VB_W} ${VB_H}`}>

        {/* ── Speech bubble ── */}
        {/* Tail drawn first so bubble rect covers the join seam */}
        <Path
          d={`M ${CX - 6} ${bubbleBottom} L ${CX + 6} ${bubbleBottom} L ${CX} ${tailTipY} Z`}
          fill="white"
          stroke={color}
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
        <Rect x={bX} y={bY} width={bW} height={BUBBLE_H} rx={8} fill="white" stroke={color} strokeWidth={1.2} />
        <SvgText
          x={CX}
          y={bY + BUBBLE_H / 2 + 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight="700"
          fill={color}
        >
          {bubbleLabel}
        </SvgText>

        {/* ── Character body ── */}

        {/* Outer glow ring — Aretē only */}
        {glow && (
          <Circle cx={CX} cy={headCY} r={headR + 8} fill="none" stroke={color} strokeWidth={2} opacity={0.3} />
        )}

        <G fill={color}>
          {/* Head */}
          <Circle cx={CX} cy={headCY} r={headR} />

          {/* Crown — Aretē */}
          {crown && (
            <Path
              d={[
                `M ${CX - headR * 0.75} ${headCY - headR + 1}`,
                `L ${CX - headR * 0.95} ${headCY - headR - 6}`,
                `L ${CX - headR * 0.35} ${headCY - headR - 1}`,
                `L ${CX} ${headCY - headR - 9}`,
                `L ${CX + headR * 0.35} ${headCY - headR - 1}`,
                `L ${CX + headR * 0.95} ${headCY - headR - 6}`,
                `L ${CX + headR * 0.75} ${headCY - headR + 1}`,
                'Z',
              ].join(' ')}
            />
          )}

          {/* Laurel wreath — Olympian & Titan */}
          {laurel && (
            <>
              <Path
                d={`M${CX - headR - 1} ${headCY + headR * 0.4} Q${CX - headR * 2.4} ${headCY} ${CX - headR - 1} ${headCY - headR * 1.05}`}
                fill="none"
                stroke={color}
                strokeWidth={3.5}
                strokeLinecap="round"
              />
              <Path
                d={`M${CX + headR + 1} ${headCY + headR * 0.4} Q${CX + headR * 2.4} ${headCY} ${CX + headR + 1} ${headCY - headR * 1.05}`}
                fill="none"
                stroke={color}
                strokeWidth={3.5}
                strokeLinecap="round"
              />
            </>
          )}

          {/* Neck */}
          <Rect x={CX - neckHW} y={neckTop} width={neckHW * 2} height={5} rx={2} />

          {/* Torso */}
          <Path d={torsoPath} />

          {/* Arms */}
          <Path d={leftArmPath} />
          <Path d={rightArmPath} />

          {/* Hips */}
          <Path d={hipPath} />

          {/* Legs */}
          <Path d={leftLegPath} />
          <Path d={rightLegPath} />
        </G>
      </Svg>
    </Animated.View>
  );
}
