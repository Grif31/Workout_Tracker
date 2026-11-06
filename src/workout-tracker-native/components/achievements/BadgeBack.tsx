import React, { memo, useMemo } from 'react';
import Svg, { Defs, LinearGradient, Line, Path, Stop, Text as SvgText } from 'react-native-svg';
import { BADGE_ART, BADGE_METALS, GLOSS_STOPS, ROUND_CROWN, type BadgeArtKey } from '../../constants/badgeArt';
import {
  BACK_INK, BADGE_MEANINGS, OLIVE, UNFOUND_HIDDEN, UNFOUND_HIDDEN_BACK, badgeLook,
} from '../../constants/achievements';
import { layoutBack, type BackLayout, type BackLineSpec } from '../../utils/badgeBackLayout';
import { BADGE_VIEWBOX, gradientStops } from './AchievementBadge';

// Round shapes hold the back's text best; an outline that can't (the π, the
// helmet's T-opening) turns over to a round plate in the same metal
const FALLBACK_SHAPE: BadgeArtKey = 'work';

interface Props {
  /** Omit for an unfound hidden badge */
  badgeKey?: string;
  size: number;
  title: string;
  threshold?: number;
  weightUnit?: string;
  /** Earned: the date as shown, the workout's name (null once it's deleted) and which number it was */
  earned?: { date: string; workoutName?: string | null; countLine?: string | null };
  /** Locked: the plain threshold ("250 workouts"), "137 so far", "113 to go" */
  progress?: { goal: string; soFar?: string | null; toGo?: string | null };
  accessibilityLabel?: string;
}

export function backLines(props: Pick<Props, 'badgeKey' | 'title' | 'earned' | 'progress'>): BackLineSpec[] {
  const { badgeKey, title, earned, progress } = props;
  // A long single word (DODEKATHEON) can't wrap, so the name may shrink further than the rest
  const name: BackLineSpec = { text: title.toUpperCase(), size: 4.6, floor: 0.62, weight: '800', spacing: 0.9, tone: 'strong', emboss: true, ruleAfter: true, maxLines: 2 };
  if (!badgeKey) {
    return [
      { ...name, text: 'HIDDEN' },
      { text: UNFOUND_HIDDEN_BACK, size: 3, weight: '500', tone: 'soft', italic: true, maxLines: 3 },
    ];
  }
  const meaning = BADGE_MEANINGS[badgeKey];
  const lines: BackLineSpec[] = [name];
  if (earned) {
    lines.push({ text: 'EARNED', size: 2.9, weight: '600', spacing: 0.5, tone: 'soft' });
    lines.push({ text: earned.date, size: 4.4, weight: '800', tone: 'strong', emboss: true });
    if (earned.workoutName) lines.push({ text: earned.workoutName, size: 3.2, weight: '700', tone: 'strong', ellipsize: true });
    if (earned.countLine) lines.push({ text: earned.countLine, size: 3, weight: '500', tone: 'strong', maxLines: 2 });
  } else {
    lines.push({ text: 'NOT YET', size: 2.9, weight: '600', spacing: 0.5, tone: 'soft' });
    // A feat's goal is a sentence ("Deadlifted twice your bodyweight"), so it may wrap
    if (progress?.goal) lines.push({ text: progress.goal, size: 4.4, weight: '800', tone: 'strong', emboss: true, maxLines: 3 });
    if (progress?.soFar) lines.push({ text: progress.soFar, size: 3.2, weight: '700', tone: 'strong', maxLines: 2 });
    if (progress?.toGo) lines.push({ text: progress.toGo, size: 3, weight: '500', tone: 'strong', maxLines: 2 });
  }
  if (meaning) {
    lines[lines.length - 1] = { ...lines[lines.length - 1], ruleAfter: true };
    lines.push({ text: meaning, size: 2.5, weight: '500', italic: true, tone: 'soft', maxLines: 3, meaning: true });
  }
  return lines;
}

/** The layout, and the outline it fits: the badge's own, else the round plate, else without the meaning */
export function fitBack(art: BadgeArtKey, specs: BackLineSpec[]): { shape: BadgeArtKey; layout: BackLayout } | null {
  for (const shape of [art, FALLBACK_SHAPE]) {
    const layout = layoutBack(BADGE_ART[shape].backRows, specs);
    if (layout) return { shape, layout };
  }
  // Then lines from the bottom up, so a back is never left blank: the name always shows
  const kept = specs.filter(s => !s.meaning);
  while (kept.length) {
    const layout = layoutBack(BADGE_ART[FALLBACK_SHAPE].backRows, kept);
    if (layout) return { shape: FALLBACK_SHAPE, layout };
    kept.pop();
  }
  return null;
}

function BadgeBack({ badgeKey, size, title, threshold, weightUnit, earned, progress, accessibilityLabel }: Props) {
  const look = badgeKey
    ? badgeLook(badgeKey, { threshold, weightUnit, locked: !earned })
    : { art: UNFOUND_HIDDEN as BadgeArtKey, metal: 'locked' as const, top: false };
  const ink = BACK_INK[look.metal];
  const rim = BADGE_METALS[look.metal].rim;

  const fitted = useMemo(
    () => fitBack(look.art, backLines({ badgeKey, title, earned, progress })),
    [look.art, badgeKey, title, earned?.date, earned?.workoutName, earned?.countLine, progress?.goal, progress?.soFar, progress?.toGo],
  );
  const shapeKey = fitted?.shape ?? look.art;
  const art = BADGE_ART[shapeKey];
  const crown = look.top && look.metal === 'marble' ? (art.crown ?? ROUND_CROWN) : null;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={BADGE_VIEWBOX}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
    >
      <Defs>
        {/* Lit from the other side: the back is the face turned over */}
        <LinearGradient id="back" x1="1" y1="0" x2="0" y2="1">
          <Stop offset={0} stopColor={ink.faceTop} />
          <Stop offset={0.6} stopColor={ink.faceMid} />
          <Stop offset={1} stopColor={ink.faceEnd} />
        </LinearGradient>
        <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="1">{gradientStops(rim)}</LinearGradient>
        <LinearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">{gradientStops(GLOSS_STOPS)}</LinearGradient>
      </Defs>
      {crown && <Path d={crown} fill={OLIVE} />}
      <Path d={art.shape} fill="rgba(0,0,0,0.45)" transform="translate(0.8 1.6)" />
      <Path d={art.shape} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={4.4} strokeLinejoin="round" />
      <Path d={art.shape} fill="url(#back)" stroke="url(#rim)" strokeWidth={3} strokeLinejoin="round" />
      <Path d={art.shape} fill="url(#gloss)" />
      {!!art.band && <Path d={art.band} fill="none" stroke="url(#rim)" strokeWidth={1.2} strokeDasharray="1.2 1" />}
      {fitted?.layout.rules.map((r, i) => (
        <Line key={`r${i}`} x1={r.x1} x2={r.x2} y1={r.y} y2={r.y} stroke={ink.rule} strokeWidth={0.4} opacity={0.7} />
      ))}
      {fitted?.layout.lines.map((l, i) => (
        <React.Fragment key={`l${i}`}>
          {l.emboss && (
            <SvgText x={l.x + 0.35} y={l.y + 0.45} fill="rgba(0,0,0,0.5)" textAnchor="middle"
              fontSize={l.size} fontWeight={l.weight} letterSpacing={l.spacing} fontStyle={l.italic ? 'italic' : 'normal'}>
              {l.text}
            </SvgText>
          )}
          <SvgText x={l.x} y={l.y} fill={l.tone === 'strong' ? ink.strong : ink.soft} textAnchor="middle"
            fontSize={l.size} fontWeight={l.weight} letterSpacing={l.spacing} fontStyle={l.italic ? 'italic' : 'normal'}>
            {l.text}
          </SvgText>
        </React.Fragment>
      ))}
    </Svg>
  );
}

export default memo(BadgeBack);
