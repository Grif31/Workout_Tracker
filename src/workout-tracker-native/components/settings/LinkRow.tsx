import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { createSettingsStyles } from './settingsStyles';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  // Leaves the app (browser, mail), so it gets the open-outside icon instead of a chevron
  external?: boolean;
};

export default function LinkRow({ icon, label, onPress, external }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createSettingsStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={label}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Ionicons name={external ? 'open-outline' : 'chevron-forward'} size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}
