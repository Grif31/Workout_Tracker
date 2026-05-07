import React from 'react';
import { View, StyleSheet } from 'react-native';
import Body, { ExtendedBodyPart, Slug } from 'react-native-body-highlighter';
import { useTheme } from '../context/ThemeContext';

type Props = {
  primaryMuscle?: string | null;
};

const MUSCLE_MAP: Record<string, { front: Slug[]; back: Slug[] }> = {
  Chest:      { front: ['chest'],                    back: [] },
  Back:       { front: [],                           back: ['upper-back', 'lower-back', 'trapezius'] },
  Shoulders:  { front: ['deltoids'],                 back: ['deltoids'] },
  Biceps:     { front: ['biceps'],                   back: [] },
  Triceps:    { front: [],                           back: ['triceps'] },
  Quads:      { front: ['quadriceps'],               back: [] },
  Hamstrings: { front: [],                           back: ['hamstring'] },
  Calves:     { front: ['calves'],                   back: ['calves'] },
  Core:       { front: ['abs', 'obliques'],          back: [] },
};

export default function MuscleDiagram({ primaryMuscle }: Props) {
  const { colors, mode } = useTheme();

  const bodyFill   = mode === 'dark' ? '#3a3a3a' : '#d4d4d4';
  const bodyStroke = mode === 'dark' ? '#555'    : '#aaaaaa';

  const regions = primaryMuscle
    ? (MUSCLE_MAP[primaryMuscle] ?? { front: [], back: [] })
    : { front: [], back: [] };

  const frontData: ExtendedBodyPart[] = regions.front.map(slug => ({ slug, color: colors.accent }));
  const backData:  ExtendedBodyPart[] = regions.back.map(slug  => ({ slug, color: colors.accent }));

  return (
    <View style={styles.row}>
      <Body
        data={frontData}
        side="front"
        scale={0.65}
        defaultFill={bodyFill}
        defaultStroke={bodyStroke}
        border={bodyStroke}
      />
      <Body
        data={backData}
        side="back"
        scale={0.65}
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
