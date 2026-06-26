import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, {
  Circle, Path, G, Rect, Text as SvgText,
  Defs, LinearGradient, Stop, Ellipse,
} from 'react-native-svg';
import { GREEK_RANK_COLORS } from '../../constants/greekRanks';

// Skin palette
const SK_LIGHT = '#EAB990';
const SK_MID   = '#D49060';
const SK_DARK  = '#B87045';
const HAIR_COL = '#1C1008';
const EYE_WHT  = '#F2F2F2';
const EYE_DARK = '#1A0800';
const SHOE_COL = '#1A1A2E';

type RankCfg = {
  color: string;
  headR: number;
  sw: number;
  ww: number;
  hw: number;
  aw: number;
  lw: number;
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
const BUBBLE_TOP = 4;
const BUBBLE_H = 28;
const BUBBLE_TAIL_TIP_OFFSET = 12;
const BUBBLE_AREA = BUBBLE_H + BUBBLE_TAIL_TIP_OFFSET + 12; // 52

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

  const O = BUBBLE_AREA;
  const headCY = O + 16 + headR;
  const neckTop = headCY + headR;
  const torsoTop = neckTop + 5;
  const waistY = torsoTop + 38;
  const hipY = waistY + 8;
  const kneeY = hipY + 28;
  const ankleY = kneeY + 20;
  const VB_H = ankleY + 10;
  const svgHeight = Math.round(size * VB_H / VB_W);

  const neckHW = headR * 0.35;

  // ── Body shape paths ──────────────────────────────────────────────────────

  // Tank top (torso — filled with rank color)
  const torsoPath = [
    `M ${CX - neckHW} ${torsoTop}`,
    `C ${CX - sw * 0.45} ${torsoTop} ${CX - sw} ${torsoTop + 5} ${CX - sw} ${torsoTop + 14}`,
    `C ${CX - sw} ${waistY - 10} ${CX - ww} ${waistY} ${CX - ww} ${waistY}`,
    `L ${CX + ww} ${waistY}`,
    `C ${CX + ww} ${waistY} ${CX + sw} ${waistY - 10} ${CX + sw} ${torsoTop + 14}`,
    `C ${CX + sw} ${torsoTop + 5} ${CX + sw * 0.45} ${torsoTop} ${CX + neckHW} ${torsoTop}`,
    'Z',
  ].join(' ');

  // Hips (shorts top section)
  const hipPath = [
    `M ${CX - ww} ${waistY}`,
    `C ${CX - ww} ${waistY + 3} ${CX - hw} ${waistY + 6} ${CX - hw} ${hipY}`,
    `L ${CX + hw} ${hipY}`,
    `C ${CX + hw} ${waistY + 6} ${CX + ww} ${waistY + 3} ${CX + ww} ${waistY}`,
    'Z',
  ].join(' ');

  // Arms (skin color)
  const leftArmPath = [
    `M ${CX - sw} ${torsoTop + 14}`,
    `L ${CX - sw} ${waistY + 2}`,
    `Q ${CX - sw - aw * 0.6} ${waistY + 4} ${CX - sw - aw * 1.4} ${waistY + 1}`,
    `L ${CX - sw - aw * 2} ${torsoTop + 12}`,
    `Q ${CX - sw - aw} ${torsoTop + 3} ${CX - sw} ${torsoTop + 14}`,
    'Z',
  ].join(' ');

  const rightArmPath = [
    `M ${CX + sw} ${torsoTop + 14}`,
    `Q ${CX + sw + aw} ${torsoTop + 3} ${CX + sw + aw * 2} ${torsoTop + 12}`,
    `L ${CX + sw + aw * 1.4} ${waistY + 1}`,
    `Q ${CX + sw + aw * 0.6} ${waistY + 4} ${CX + sw} ${waistY + 2}`,
    `L ${CX + sw} ${torsoTop + 14}`,
    'Z',
  ].join(' ');

  // Full legs (skin color, drawn under shorts overlay)
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

  // Shorts overlay — hip to knee (filled with rank color, covers upper legs)
  const leftShortsPath = [
    `M ${li} ${hipY}`,
    `L ${li} ${kneeY}`,
    `L ${loH} ${kneeY - 4}`,
    `C ${loH - lw * 0.1} ${kneeY - 8} ${loH} ${hipY + 6} ${loH} ${hipY}`,
    'Z',
  ].join(' ');

  const rightShortsPath = [
    `M ${ri} ${hipY}`,
    `C ${roH} ${hipY + 6} ${roH + lw * 0.1} ${kneeY - 8} ${roH} ${kneeY - 4}`,
    `L ${ri} ${kneeY}`,
    'Z',
  ].join(' ');

  // Hair (short athletic cut — cap over top of head)
  const hairPath = [
    `M ${CX - headR * 0.93} ${headCY - headR * 0.1}`,
    `Q ${CX - headR * 1.12} ${headCY - headR * 0.86} ${CX - headR * 0.58} ${headCY - headR * 1.18}`,
    `Q ${CX} ${headCY - headR * 1.3} ${CX + headR * 0.58} ${headCY - headR * 1.18}`,
    `Q ${CX + headR * 1.12} ${headCY - headR * 0.86} ${CX + headR * 0.93} ${headCY - headR * 0.1}`,
    `Q ${CX + headR * 0.62} ${headCY - headR * 0.33} ${CX} ${headCY - headR * 0.42}`,
    `Q ${CX - headR * 0.62} ${headCY - headR * 0.33} ${CX - headR * 0.93} ${headCY - headR * 0.1}`,
    'Z',
  ].join(' ');

  // ── Face feature coordinates ──────────────────────────────────────────────
  const eyeY   = headCY - headR * 0.1;
  const eyeR   = headR * 0.22;
  const irisR  = eyeR * 0.64;
  const lEyeX  = CX - headR * 0.32;
  const rEyeX  = CX + headR * 0.32;

  const browY  = headCY - headR * 0.4;
  const bW     = headR * 0.15; // brow stroke width
  const lBrow  = `M ${lEyeX - eyeR * 0.95} ${browY + eyeR * 0.28} Q ${lEyeX} ${browY - eyeR * 0.08} ${lEyeX + eyeR * 0.88} ${browY + eyeR * 0.28}`;
  const rBrow  = `M ${rEyeX - eyeR * 0.88} ${browY + eyeR * 0.28} Q ${rEyeX} ${browY - eyeR * 0.08} ${rEyeX + eyeR * 0.95} ${browY + eyeR * 0.28}`;

  const mouthY = headCY + headR * 0.42;
  const mouthPath = `M ${CX - headR * 0.27} ${mouthY} Q ${CX} ${mouthY + headR * 0.17} ${CX + headR * 0.27} ${mouthY}`;

  // ── Speech bubble ─────────────────────────────────────────────────────────
  const bubble = speechText ?? RANK_SPEECH[rank] ?? '';
  const bubbleLabel = bubble.length > 14 ? bubble.slice(0, 12) + '…' : bubble;
  const bX = 5;
  const bY = BUBBLE_TOP;
  const bW2 = VB_W - 10;
  const bubbleBottom = bY + BUBBLE_H;
  const tailTipY = O + 14;

  // ── Shoe dimensions ───────────────────────────────────────────────────────
  const shoeH = 5;
  const leftShoeX = loA - lw * 0.4;
  const leftShoeW = lw * 1.9;
  const rightShoeX = ri - lw * 0.5;
  const rightShoeW = lw * 1.9;

  return (
    <Animated.View style={glow ? { transform: [{ scale: pulseAnim }] } : undefined}>
      <Svg width={size} height={svgHeight} viewBox={`0 0 ${VB_W} ${VB_H}`}>

        <Defs>
          <LinearGradient id="skinG" x1="0.2" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={SK_LIGHT} stopOpacity="1" />
            <Stop offset="0.5" stopColor={SK_MID} stopOpacity="1" />
            <Stop offset="1" stopColor={SK_DARK} stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="clothG" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0.72" />
          </LinearGradient>
        </Defs>

        {/* ── Speech bubble ── */}
        <Path
          d={`M ${CX - 6} ${bubbleBottom} L ${CX + 6} ${bubbleBottom} L ${CX} ${tailTipY} Z`}
          fill="white"
          stroke={color}
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
        <Rect x={bX} y={bY} width={bW2} height={BUBBLE_H} rx={8} fill="white" stroke={color} strokeWidth={1.2} />
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

        {/* ── Aretē glow ring ── */}
        {glow && (
          <Circle cx={CX} cy={headCY} r={headR + 10} fill="none" stroke={color} strokeWidth={2.5} opacity={0.25} />
        )}

        {/* ── Ears (behind head) ── */}
        <Ellipse
          cx={CX - headR * 0.9}
          cy={headCY + headR * 0.05}
          rx={headR * 0.19}
          ry={headR * 0.27}
          fill="url(#skinG)"
        />
        <Ellipse
          cx={CX + headR * 0.9}
          cy={headCY + headR * 0.05}
          rx={headR * 0.19}
          ry={headR * 0.27}
          fill="url(#skinG)"
        />

        {/* ── Head (skin) ── */}
        <Circle cx={CX} cy={headCY} r={headR} fill="url(#skinG)" />

        {/* ── Hair ── */}
        <Path d={hairPath} fill={HAIR_COL} />

        {/* ── Crown (Aretē only) ── */}
        {crown && (
          <Path
            fill="#FFD700"
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

        {/* ── Laurel wreath (Olympian/Titan) ── */}
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

        {/* ── Face: eyes ── */}
        <Circle cx={lEyeX} cy={eyeY} r={eyeR} fill={EYE_WHT} />
        <Circle cx={lEyeX} cy={eyeY} r={irisR} fill={EYE_DARK} />
        <Circle cx={lEyeX + irisR * 0.3} cy={eyeY - irisR * 0.2} r={irisR * 0.28} fill="#FFFFFF" fillOpacity={0.45} />

        <Circle cx={rEyeX} cy={eyeY} r={eyeR} fill={EYE_WHT} />
        <Circle cx={rEyeX} cy={eyeY} r={irisR} fill={EYE_DARK} />
        <Circle cx={rEyeX + irisR * 0.3} cy={eyeY - irisR * 0.2} r={irisR * 0.28} fill="#FFFFFF" fillOpacity={0.45} />

        {/* ── Face: eyebrows ── */}
        <Path d={lBrow} fill="none" stroke={HAIR_COL} strokeWidth={bW} strokeLinecap="round" />
        <Path d={rBrow} fill="none" stroke={HAIR_COL} strokeWidth={bW} strokeLinecap="round" />

        {/* ── Face: nose dots ── */}
        <Circle cx={CX - headR * 0.09} cy={headCY + headR * 0.19} r={headR * 0.07} fill={SK_DARK} />
        <Circle cx={CX + headR * 0.09} cy={headCY + headR * 0.19} r={headR * 0.07} fill={SK_DARK} />

        {/* ── Face: mouth (confident smile) ── */}
        <Path d={mouthPath} fill="none" stroke={SK_DARK} strokeWidth={bW} strokeLinecap="round" />

        {/* ── Neck (skin) ── */}
        <Rect x={CX - neckHW} y={neckTop} width={neckHW * 2} height={5} rx={2} fill="url(#skinG)" />

        {/* ── Arms (skin) ── */}
        <Path d={leftArmPath} fill="url(#skinG)" />
        <Path d={rightArmPath} fill="url(#skinG)" />

        {/* ── Tank top (rank color) ── */}
        <Path d={torsoPath} fill="url(#clothG)" />

        {/* ── Full legs (skin, shorts will overlay upper portion) ── */}
        <Path d={leftLegPath} fill="url(#skinG)" />
        <Path d={rightLegPath} fill="url(#skinG)" />

        {/* ── Shorts: hips + upper thighs (rank color) ── */}
        <Path d={hipPath} fill="url(#clothG)" />
        <Path d={leftShortsPath} fill="url(#clothG)" />
        <Path d={rightShortsPath} fill="url(#clothG)" />

        {/* ── Waistband accent stripe ── */}
        <Rect
          x={CX - ww - 1} y={waistY - 1.5}
          width={(ww + 1) * 2} height={2.5}
          rx={1}
          fill={color}
          opacity={0.55}
        />

        {/* ── Shoes ── */}
        <Rect x={leftShoeX} y={ankleY} width={leftShoeW} height={shoeH} rx={2} fill={SHOE_COL} />
        <Rect x={rightShoeX} y={ankleY} width={rightShoeW} height={shoeH} rx={2} fill={SHOE_COL} />

      </Svg>
    </Animated.View>
  );
}
