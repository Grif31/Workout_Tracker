import React from 'react';
import { View, StyleSheet } from 'react-native';
import Body, { ExtendedBodyPart, Slug } from 'react-native-body-highlighter';
import { MUSCLE_SLUGS, muscleKey } from '../utils/muscleDiagramSvg';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';

type Props = {
  muscles?: string[];
  primaryMuscle?: string | null;
  // Per-muscle rank colors for strength score screen; falls back to colors.accent if absent
  muscleColors?: Record<string, string>;
  scale?: number;
};


export default function MuscleDiagram({ muscles, primaryMuscle, muscleColors, scale = 0.65 }: Props) {
  const { colors } = useTheme();

  const bodyFill   = colors.surface;
  const bodyStroke = colors.border;

  const activeList = muscles && muscles.length > 0
    ? muscles
    : primaryMuscle ? [primaryMuscle] : [];

  const frontMap = new Map<Slug, string>();
  const backMap  = new Map<Slug, string>();

  for (const m of activeList) {
    const key = muscleKey(m);
    if (!key) continue;
    const highlight = muscleColors?.[m] ?? muscleColors?.[key] ?? colors.accent;
    MUSCLE_SLUGS[key].front.forEach(s => frontMap.set(s, highlight));
    MUSCLE_SLUGS[key].back.forEach(s  => backMap.set(s, highlight));
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
    gap: spacing.sm,
  },
});
