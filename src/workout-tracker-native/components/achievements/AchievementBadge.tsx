import React, { memo } from 'react';
import Svg, { Defs, G, LinearGradient, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import {
  BADGE_ART, BADGE_METALS, GLINT_STOPS, GLOSS_STOPS, LEAP_PEG, MARBLE_VEINS, PLATE_BARS, ROUND_CROWN,
  type BadgeMetal, type GradientStop,
} from '../../constants/badgeArt';
import { MARBLE_VEIN, OLIVE, UNFOUND_HIDDEN, badgeLook, type BadgeLook } from '../../constants/achievements';

// Every badge is a 64-unit enamel pin drawn in this box (design/achievements, Badges.dc.html)
export const BADGE_VIEWBOX = '-8 -8 80 80';
const SHADOW = 'rgba(0,0,0,0.45)';
const EDGE = 'rgba(0,0,0,0.55)';
const LIGHT = 'rgba(255,255,255,0.3)';
const STAMP_FONT = { fontSize: 9, fontWeight: '800' as const };

/** A gradient's children must be Stop elements themselves, not a component wrapping them */
export function gradientStops(stops: GradientStop[]) {
  return stops.map(([offset, color, opacity], i) => (
    <Stop key={i} offset={offset} stopColor={color} stopOpacity={opacity ?? 1} />
  ));
}

/** The metal's gradients, shared by the face and the back */
export function MetalDefs({ metal }: { metal: BadgeMetal }) {
  const m = BADGE_METALS[metal];
  return (
    <Defs>
      <RadialGradient id="face" cx="38%" cy="30%" r="85%">{gradientStops(m.face)}</RadialGradient>
      <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="1">{gradientStops(m.rim)}</LinearGradient>
      <LinearGradient id="ink" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="60">{gradientStops(m.ink)}</LinearGradient>
      <LinearGradient id="iconInk" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24">{gradientStops(m.iconInk)}</LinearGradient>
      <LinearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">{gradientStops(GLOSS_STOPS)}</LinearGradient>
      <LinearGradient id="glint" x1="0" y1="0" x2="1" y2="1">{gradientStops(GLINT_STOPS)}</LinearGradient>
    </Defs>
  );
}

interface Props {
  /** A server badge key (`workouts_5`, `feat_nostos`, `hidden_pi`); omit for an unfound hidden badge */
  badgeKey?: string;
  size: number;
  /** The rung's threshold, from the server; ladders stamp it on the base */
  threshold?: number;
  weightUnit?: string;
  locked?: boolean;
  accessibilityLabel?: string;
}

function AchievementBadge({ badgeKey, size, threshold, weightUnit, locked, accessibilityLabel }: Props) {
  const look: BadgeLook = badgeKey
    ? badgeLook(badgeKey, { threshold, weightUnit, locked })
    : { art: UNFOUND_HIDDEN, metal: 'locked', stamp: '', top: false };
  const art = BADGE_ART[look.art];
  const { band } = BADGE_METALS[look.metal];
  const crown = look.top && look.metal === 'marble' ? (art.crown ?? ROUND_CROWN) : null;
  const unfound = look.art === UNFOUND_HIDDEN;
  const bar = look.plates ? PLATE_BARS[look.plates - 1] : look.art === 'h_emb' ? LEAP_PEG : null;
  const iconT = art.iconT ? `translate(${art.iconT[0]} ${art.iconT[1]}) scale(${art.iconT[2]})` : undefined;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={BADGE_VIEWBOX}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
    >
      <MetalDefs metal={look.metal} />
      {crown && <Path d={crown} fill={OLIVE} />}
      <Path d={art.shape} fill={SHADOW} transform="translate(0.8 1.6)" />
      <Path d={art.shape} fill="none" stroke={EDGE} strokeWidth={4.4} strokeLinejoin="round" />
      <Path d={art.shape} fill="url(#face)" stroke="url(#rim)" strokeWidth={3} strokeLinejoin="round" />
      <Path d={art.shape} fill="url(#glint)" />
      <Path d={art.shape} fill="url(#gloss)" />
      {look.metal === 'marble' && (
        <Path d={MARBLE_VEINS} fill="none" stroke={MARBLE_VEIN} strokeWidth={0.6} opacity={0.6} />
      )}
      {band[0] > 0 && !!art.band && (
        <Path
          d={art.band}
          fill="none"
          stroke="url(#rim)"
          strokeWidth={band[0]}
          strokeDasharray={band[1] === 'none' ? undefined : band[1]}
        />
      )}
      {!!art.extra && (
        <Path d={art.extra} fill="none" stroke="url(#rim)" strokeWidth={2.4} strokeLinecap="round" />
      )}
      {!!art.detail && (
        <>
          <Path d={art.detail} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={0.85} strokeLinecap="round" transform="translate(0.35 0.45)" />
          <Path d={art.detail} fill="none" stroke="url(#ink)" strokeWidth={0.85} strokeLinecap="round" opacity={0.8} />
        </>
      )}
      {!!art.icon && (
        <G transform={iconT}>
          {/* Raised: dark below-right, light above-left, then the icon */}
          <Path d={art.icon} fill="none" stroke={EDGE} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" transform="translate(0.6 0.8)" />
          <Path d={art.icon} fill="none" stroke={LIGHT} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" transform="translate(-0.4 -0.5)" />
          <Path d={art.icon} fill="none" stroke="url(#iconInk)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {bar && (
        <>
          <Path d={bar} fill="rgba(0,0,0,0.5)" transform="translate(0.5 0.6)" />
          <Path d={bar} fill="url(#ink)" />
        </>
      )}
      {unfound && (
        <SvgText x={32} y={36} fill="url(#ink)" textAnchor="middle" {...STAMP_FONT}>?</SvgText>
      )}
      {!!look.label && (
        <SvgText x={32} y={23.5} fill="url(#ink)" textAnchor="middle" fontSize={5.4} fontWeight="800" letterSpacing={0.8}>
          {look.label}
        </SvgText>
      )}
      {!!look.stamp && (
        <>
          {/* Embossed: a dark copy just below */}
          <SvgText x={32.4} y={art.stampY + 0.6} fill={EDGE} textAnchor="middle" {...STAMP_FONT}>{look.stamp}</SvgText>
          <SvgText x={32} y={art.stampY} fill="url(#ink)" textAnchor="middle" {...STAMP_FONT}>{look.stamp}</SvgText>
        </>
      )}
    </Svg>
  );
}

export default memo(AchievementBadge);
