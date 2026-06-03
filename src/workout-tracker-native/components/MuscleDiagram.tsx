import React from 'react';
import { View, StyleSheet } from 'react-native';
import Body, { ExtendedBodyPart, Slug } from 'react-native-body-highlighter';
import { useTheme } from '../context/ThemeContext';

type Props = {
  muscles?: string[];
  primaryMuscle?: string | null;
  // Per-muscle rank colors for strength score screen; falls back to colors.accent if absent
  muscleColors?: Record<string, string>;
  scale?: number;
};

const MUSCLE_MAP: Record<string, { front: Slug[]; back: Slug[] }> = {
  Chest:        { front: ['chest'],                    back: [] },
  Back:         { front: [],                           back: ['upper-back', 'trapezius'] },
  'Lower Back': { front: [],                           back: ['lower-back'] },
  Shoulders:    { front: ['deltoids'],                 back: ['deltoids'] },
  Biceps:       { front: ['biceps'],                   back: [] },
  Triceps:      { front: [],                           back: ['triceps'] },
  Quads:        { front: ['quadriceps'],               back: [] },
  Quadriceps:   { front: ['quadriceps'],               back: [] },
  Hamstrings:   { front: [],                           back: ['hamstring'] },
  Calves:       { front: ['calves'],                   back: ['calves'] },
  Core:         { front: ['abs', 'obliques'],          back: [] },
  Abs:          { front: ['abs', 'obliques'],          back: [] },
  Glutes:       { front: [],                           back: ['gluteal'] },
};

export default function MuscleDiagram({ muscles, primaryMuscle, muscleColors, scale = 0.65 }: Props) {
  const { colors, mode } = useTheme();

  const bodyFill   = mode === 'dark' ? '#3a3a3a' : '#d4d4d4';
  const bodyStroke = mode === 'dark' ? '#555'    : '#aaaaaa';

  const activeList = muscles && muscles.length > 0
    ? muscles
    : primaryMuscle ? [primaryMuscle] : [];

  const frontMap = new Map<Slug, string>();
  const backMap  = new Map<Slug, string>();

  for (const m of activeList) {
    const key = Object.keys(MUSCLE_MAP).find(k => k.toLowerCase() === m.toLowerCase());
    if (!key) continue;
    const highlight = muscleColors?.[m] ?? muscleColors?.[key] ?? colors.accent;
    MUSCLE_MAP[key].front.forEach(s => frontMap.set(s, highlight));
    MUSCLE_MAP[key].back.forEach(s  => backMap.set(s, highlight));
  }

  const frontData: ExtendedBodyPart[] = Array.from(frontMap.entries()).map(([slug, color]) => ({ slug, color }));
  const backData:  ExtendedBodyPart[] = Array.from(backMap.entries()).map(([slug, color])  => ({ slug, color }));

  return (
    <View style={styles.row}>
      <Body
        data={frontData}
        side="front"
        scale={scale}
        defaultFill={bodyFill}
        defaultStroke={bodyStroke}
        border={bodyStroke}
      />
      <Body
        data={backData}
        side="back"
        scale={scale}
        defaultFill={bodyFill}
        defaultStroke={bodyStroke}
        border={bodyStroke}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 8,
  },
});
