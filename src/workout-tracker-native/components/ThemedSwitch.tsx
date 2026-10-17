import React from 'react';
import { Switch, SwitchProps } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// iOS 13+ ignores trackColor.false for the off fill and paints its own faint gray,
// which vanishes on a white card in light mode; ios_backgroundColor is what fills it.
export default function ThemedSwitch(props: SwitchProps) {
  const { colors } = useTheme();
  return (
    <Switch
      trackColor={{ false: colors.switchTrack, true: colors.accent }}
      ios_backgroundColor={colors.switchTrack}
      thumbColor="#fff"
      {...props}
    />
  );
}
