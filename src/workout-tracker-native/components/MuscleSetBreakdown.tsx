import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import MuscleDiagram from './MuscleDiagram';
import {
  fmtSetCount, muscleShading, shadeColor, shadeLevel, type MuscleSetCount,
} from '../utils/muscleSetCounts';

type Props = {
  counts: MuscleSetCount[];
  /** A saved workout: every set counts as done, so there's no "x of y". */
  logged?: boolean;
};

const setWord = (n: number) => (n === 1 ? 'set' : 'sets');

/** The muscle diagram shaded by working sets, and a row per muscle. Shared by the workout log and a logged workout. */
export default function MuscleSetBreakdown({ counts, logged = false }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const shading = useMemo(() => muscleShading(counts, colors.accent), [counts, colors.accent]);
  const maxPlanned = Math.max(...counts.map(c => c.planned), 1);
  const firstSecondary = counts.findIndex(c => !c.primary);

  return (
    <View style={styles.container}>
      <MuscleDiagram muscles={shading.muscles} muscleColors={shading.muscleColors} />

      <View style={styles.rows}>
        {counts.map((c, i) => (
          <React.Fragment key={c.muscle}>
            {i === firstSecondary && i > 0 && <Text style={styles.sectionLabel}>Secondary</Text>}
            <View
              style={styles.row}
              accessible
              accessibilityLabel={logged
                ? `${c.muscle}, ${fmtSetCount(c.done)} ${setWord(c.done)}`
                : `${c.muscle}, ${fmtSetCount(c.done)} of ${fmtSetCount(c.planned)} ${setWord(c.planned)} done`}
            >
              <Text style={[styles.muscleName, !c.primary && styles.secondaryText]} numberOfLines={1}>{c.muscle}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barPlanned, { width: `${(c.planned / maxPlanned) * 100}%`, backgroundColor: shadeColor(colors.accent, 1) }]} />
                <View style={[styles.barDone, { width: `${(c.done / maxPlanned) * 100}%`, backgroundColor: shadeColor(colors.accent, shadeLevel(c)) }]} />
              </View>
              <Text style={styles.countText}>
                {logged ? fmtSetCount(c.done) : `${fmtSetCount(c.done)}/${fmtSetCount(c.planned)}`}
                <Text style={styles.countUnit}> {setWord(logged ? c.done : c.planned)}</Text>
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md },
  rows: { alignSelf: 'stretch', gap: spacing.sm },
  sectionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  muscleName: { width: 96, fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  secondaryText: { fontWeight: '400', color: colors.textSecondary },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  barPlanned: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  barDone: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  countText: { minWidth: 64, textAlign: 'right', fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  countUnit: { fontWeight: '400', color: colors.textSecondary },
});
