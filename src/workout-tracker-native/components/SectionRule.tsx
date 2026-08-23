import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  label: string;
  style?: ViewStyle;
  fontSize?: number;
};

// Hairline + uppercase label divider — shared across LiftDetailModal, DashboardScreen,
// ExercisesScreen, ProfileScreen, StrengthScoreScreen (previously copy-pasted in each).
export default function SectionRule({ label, style, fontSize = typography.fontSize.xs }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
      <Text style={[styles.label, { fontSize, color: colors.textSecondary }]}>
        {label}
      </Text>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  label: { fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginHorizontal: spacing.sm },
});
