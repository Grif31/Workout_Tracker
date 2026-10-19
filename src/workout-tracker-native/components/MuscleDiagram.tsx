import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Body, { ExtendedBodyPart, Slug } from 'react-native-body-highlighter';
import { MUSCLE_SLUGS, muscleKey } from '../utils/muscleDiagramSvg';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing } from '../theme/spacing';

type Props = {
  muscles?: string[];
  primaryMuscle?: string | null;
  // Per-muscle colors (strength score rank colors, workout set-count shades); falls back to colors.accent if absent
  muscleColors?: Record<string, string>;
  scale?: number;
};


// Memoized because WorkoutHeader re-renders on every second of the workout
// timer, and redrawing two body SVGs each tick is the costly part of that
function MuscleDiagram({ muscles, primaryMuscle, muscleColors, scale = 0.65 }: Props) {
  const { colors } = useTheme();
  // A profile with no gender set keeps the male figure the diagram always drew
  const gender = useAuth()?.user?.gender === 'female' ? 'female' : 'male';

  const bodyFill   = colors.surface;
  const bodyStroke = colors.border;

  const { frontData, backData } = useMemo(() => {
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

    return {
      frontData: Array.from(frontMap.entries()).map(([slug, color]) => ({ slug, color })) as ExtendedBodyPart[],
      backData:  Array.from(backMap.entries()).map(([slug, color])  => ({ slug, color })) as ExtendedBodyPart[],
    };
  }, [muscles, primaryMuscle, muscleColors, colors.accent]);

  return (
    <View style={styles.row}>
      <Body
        data={frontData}
        side="front"
        gender={gender}
        scale={scale}
        defaultFill={bodyFill}
        defaultStroke={bodyStroke}
        border={bodyStroke}
      />
      <Body
        data={backData}
        side="back"
        gender={gender}
        scale={scale}
        defaultFill={bodyFill}
        defaultStroke={bodyStroke}
        border={bodyStroke}
      />
    </View>
  );
}

export default React.memo(MuscleDiagram);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
});
