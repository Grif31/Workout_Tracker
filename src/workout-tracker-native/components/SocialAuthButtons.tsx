import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AUTH } from '../theme/authColors';
import { spacing, radius } from '../theme/spacing';
import { typography } from '../theme/typography';

type Props = {
  onApple:    () => void;
  onGoogle:   () => void;
  onFacebook: () => void;
  /** Google is set up for this platform (useSocialAuth's googleAvailable). */
  google?: boolean;
  label?: string;
};

export default function SocialAuthButtons({
  onApple,
  onGoogle,
  onFacebook,
  google = false,
  label = 'or continue with',
}: Props) {
  const apple = Platform.OS === 'ios';
  // No divider over an empty row: Apple is iOS-only, and Google only shows
  // where its client is set up
  if (!apple && !google) return null;
  return (
    <View>
      <View style={styles.dividerRow}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>{label}</Text>
        <View style={styles.line} />
      </View>

      <View style={styles.row}>
        {apple && (
          <TouchableOpacity style={styles.btn} onPress={onApple} activeOpacity={0.75}>
            <Ionicons name="logo-apple" size={20} color={AUTH.text} />
            <Text style={styles.btnText}>Apple</Text>
          </TouchableOpacity>
        )}
        {google && (
          <TouchableOpacity style={styles.btn} onPress={onGoogle} activeOpacity={0.75}>
            <Ionicons name="logo-google" size={18} color={AUTH.text} />
            <Text style={styles.btnText}>Google</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: 10,
  },
  line: { flex: 1, height: 1, backgroundColor: AUTH.border },
  dividerText: { fontSize: 13, color: AUTH.subtext },

  row: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: AUTH.border,
    backgroundColor: AUTH.card,
  },
  btnText: {
    color: AUTH.text,
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
  },
});
