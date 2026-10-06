import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ProfileStackParamsList } from '../../navigation/types';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { apiFetch, saveTokens } from '../../utils/api';
import { showToast } from '../../utils/toast';

type Props = NativeStackScreenProps<ProfileStackParamsList, 'ChangePassword'>;

type FieldProps = React.ComponentProps<typeof TextInput> & {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  inputRef?: React.Ref<TextInput>;
  colors: Colors;
  styles: ReturnType<typeof createStyles>;
};

/** A password row with its own show/hide toggle. */
function PasswordField({ icon, inputRef, colors, styles, ...input }: FieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.fieldRow}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} style={styles.fieldIcon} />
      <TextInput
        ref={inputRef}
        style={styles.fieldInput}
        placeholderTextColor={colors.placeholder}
        secureTextEntry={!shown}
        autoCapitalize="none"
        {...input}
      />
      <TouchableOpacity
        onPress={() => setShown(v => !v)}
        style={styles.eyeBtn}
        accessibilityRole="button"
        accessibilityLabel={shown ? 'Hide password' : 'Show password'}
      >
        <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

export default function ChangePasswordScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { user, updateUser, logout } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Signed up with Apple or Google: there is no current password to check,
  // so the account sets its first one with an emailed code instead
  const socialOnly = !!(user as any)?.is_social_only;

  const [currentPw,   setCurrentPw]   = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [code,        setCode]        = useState('');
  const [codeSent,    setCodeSent]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const newPasswordProblem = () => {
    if (newPw.length < 6) return 'New password must be at least 6 characters.';
    if (newPw !== confirmPw) return 'New passwords do not match.';
    return null;
  };

  const handleSave = async () => {
    setError('');
    if (!currentPw || !newPw || !confirmPw) {
      setError('All fields are required.');
      return;
    }
    const problem = newPasswordProblem();
    if (problem) { setError(problem); return; }
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
        if (data.access_token && data.refresh_token) {
          await saveTokens(data.access_token, data.refresh_token);
        }
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

  const sendCode = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email }),
      });
      if (res.ok) {
        setCodeSent(true);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.message || "Couldn't send the code. Try again in a few minutes.");
      }
    } catch {
      setError('Could not connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const setFirstPassword = async () => {
    setError('');
    if (code.trim().length !== 6) { setError('Enter the 6-digit code from your email.'); return; }
    const problem = newPasswordProblem();
    if (problem) { setError(problem); return; }
    setLoading(true);
    try {
      const res = await apiFetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email, otp: code.trim(), new_password: newPw }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message || 'Invalid or expired code.');
        return;
      }
      // Setting a password signs out every existing session, this one
      // included. Sign straight back in with it so the user stays put.
      const login = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: user?.email, password: newPw }),
      });
      const data = await login.json().catch(() => null);
      if (login.ok && data?.access_token && data?.refresh_token) {
        await saveTokens(data.access_token, data.refresh_token);
        await updateUser({ is_social_only: false });
        showToast('Password set');
        navigation.goBack();
      } else {
        Alert.alert('Password Set', 'Sign in again to continue.', [{ text: 'OK', onPress: () => logout() }]);
      }
    } catch {
      setError('Could not connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const field = { colors, styles };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{socialOnly ? 'Set a Password' : 'Change Password'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {socialOnly ? (
        <>
          <Text style={styles.hint}>
            You sign in with Apple or Google, so this account has no password yet. Set one to also sign in with
            your email{user?.email ? ` (${user.email})` : ''}. We'll email you a 6-digit code to confirm it's you.
          </Text>

          {codeSent && (
            <>
              <Text style={styles.sectionLabel}>Code and New Password</Text>
              <View style={styles.group}>
                <View style={styles.fieldRow}>
                  <Ionicons name="keypad-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="6-digit code"
                    placeholderTextColor={colors.placeholder}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    value={code}
                    onChangeText={setCode}
                    autoFocus
                  />
                </View>
                <View style={styles.divider} />
                <PasswordField
                  {...field}
                  icon="lock-open-outline"
                  inputRef={newRef}
                  placeholder="New password (min 6 chars)"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  value={newPw}
                  onChangeText={setNewPw}
                />
                <View style={styles.divider} />
                <PasswordField
                  {...field}
                  icon="lock-open-outline"
                  inputRef={confirmRef}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="go"
                  onSubmitEditing={setFirstPassword}
                  value={confirmPw}
                  onChangeText={setConfirmPw}
                />
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
            onPress={codeSent ? setFirstPassword : sendCode}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={colors.accentText} />
              : <Text style={styles.saveBtnText}>{codeSent ? 'Set Password' : 'Email Me a Code'}</Text>
            }
          </TouchableOpacity>
          {codeSent && (
            <TouchableOpacity style={styles.resend} onPress={sendCode} disabled={loading}>
              <Text style={styles.resendText}>Send a new code</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          <Text style={styles.sectionLabel}>Update Password</Text>
          <View style={styles.group}>
            <PasswordField
              {...field}
              icon="lock-closed-outline"
              placeholder="Current password"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => newRef.current?.focus()}
              value={currentPw}
              onChangeText={setCurrentPw}
            />
            <View style={styles.divider} />
            <PasswordField
              {...field}
              icon="lock-open-outline"
              inputRef={newRef}
              placeholder="New password (min 6 chars)"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmRef.current?.focus()}
              value={newPw}
              onChangeText={setNewPw}
            />
            <View style={styles.divider} />
            <PasswordField
              {...field}
              icon="lock-open-outline"
              inputRef={confirmRef}
              placeholder="Confirm new password"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={handleSave}
              value={confirmPw}
              onChangeText={setConfirmPw}
            />
          </View>

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
        </>
      )}
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
  eyeBtn: { padding: spacing.xs },

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
  },

  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  resend: { alignItems: 'center', paddingVertical: spacing.md },
  resendText: { fontSize: typography.fontSize.sm, color: colors.accent, fontWeight: '600' },
  saveBtnText: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.accentText,
  },
});
