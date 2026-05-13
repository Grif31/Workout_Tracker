import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from 'navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from 'theme/spacing';
import { typography } from 'theme/typography';
import { apiFetch } from '../../utils/api';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'ChangePassword'>;

export default function ChangePasswordScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [currentPw,   setCurrentPw]   = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const handleSave = async () => {
    setError('');
    if (!currentPw || !newPw || !confirmPw) {
      setError('All fields are required.');
      return;
    }
    if (newPw.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPw,
          new_password:     newPw,
          confirm_password: confirmPw,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Password changed successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        setError(data.message || 'Something went wrong.');
      }
    } catch {
      setError('Could not connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={{ width: 24 }} />
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.sectionLabel}>Update Password</Text>
      <View style={styles.group}>

        <View style={styles.fieldRow}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />
          <TextInput
            style={styles.fieldInput}
            placeholder="Current password"
            placeholderTextColor={colors.placeholder}
            secureTextEntry={!showCurrent}
            value={currentPw}
            onChangeText={setCurrentPw}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowCurrent(p => !p)} style={styles.eyeBtn}>
            <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.fieldRow}>
          <Ionicons name="lock-open-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />
          <TextInput
            style={styles.fieldInput}
            placeholder="New password (min 6 chars)"
            placeholderTextColor={colors.placeholder}
            secureTextEntry={!showNew}
            value={newPw}
            onChangeText={setNewPw}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowNew(p => !p)} style={styles.eyeBtn}>
            <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.fieldRow}>
          <Ionicons name="lock-open-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />
          <TextInput
            style={styles.fieldInput}
            placeholder="Confirm new password"
            placeholderTextColor={colors.placeholder}
            secureTextEntry={!showConfirm}
            value={confirmPw}
            onChangeText={setConfirmPw}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={styles.eyeBtn}>
            <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

      </View>

      <Text style={styles.hint}>
        If you signed in with Apple, Google, or Facebook, use Forgot Password from the login screen to set a password.
      </Text>

      <TouchableOpacity
        style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color={colors.accentText} />
          : <Text style={styles.saveBtnText}>Save Password</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content:   { paddingBottom: spacing.xl * 2 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  errorText: {
    color: colors.danger,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },

  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
  },

  group: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: spacing.sm,
    overflow: 'hidden',
  },

  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  fieldIcon:  { marginRight: spacing.sm },
  fieldInput: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
  eyeBtn: { padding: 4 },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },

  hint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.accentText,
  },
});
