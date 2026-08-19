import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { PR_GOLD_TEXT } from '../constants/prColors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Optional trailing accessory, e.g. a loading spinner. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Gold icon + uppercase label — the PR-gold section header used across the
// Personal Records feature (Dashboard, Progression, PersonalRecordsScreen).
// A PR-gold sibling of SectionRule (hairline + label) for the trophy-case
// sections; promoted from PRDashboardScreen's original local SectionHeader
// so all three screens share one header instead of three different ones.
export default function GoldSectionRule({ icon, label, right, style }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]}>
      <Ionicons name={icon} size={14} color={PR_GOLD_TEXT} />
      <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
