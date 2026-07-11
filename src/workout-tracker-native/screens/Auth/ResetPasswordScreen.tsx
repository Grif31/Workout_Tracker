import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamsList } from '../../navigation/types';
import { AUTH } from '../../theme/authColors';
import { apiFetch } from '../../utils/api';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<AuthStackParamsList, 'ResetPassword'>;

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const { email } = route.params;

  const [step,        setStep]        = useState<1 | 2>(1);
  const [otp,         setOtp]         = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState(false);
  const [resending,   setResending]   = useState(false);
  const [resent,      setResent]      = useState(false);

  const handleVerify = async () => {
    setError('');
    if (otp.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otp.trim() }),
      });
      if (res.ok) {
        setStep(2);
      } else {
        try {
          const data = await res.json();
          setError(data.message || 'Invalid or expired code.');
        } catch {
          setError('Invalid or expired code.');
        }
      }
    } catch {
      setError('Could not connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setResent(false);
    setResending(true);
    try {
      await apiFetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } catch {
      setError('Could not connect. Please check your connection.');
    } finally {
      setResending(false);
    }
  };

  const handleReset = async () => {
    setError('');
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPw) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otp.trim(), new_password: newPassword }),
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        try {
          const data = await res.json();
          setError(data.message || 'Something went wrong.');
        } catch {
          setError('Something went wrong.');
        }
      }
    } catch {
      setError('Could not connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />
        <View style={styles.successInner}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark-circle" size={36} color={AUTH.accent} />
          </View>
          <Text style={styles.title}>Password Reset!</Text>
          <Text style={styles.subtitle}>
            Your password has been updated. You can now sign in with your new password.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Back to Log In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => step === 2 ? (setStep(1), setError('')) : navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color={AUTH.text} />
          </TouchableOpacity>

          <View style={styles.iconCircle}>
            <Ionicons
              name={step === 1 ? 'keypad-outline' : 'lock-closed-outline'}
              size={32}
              color={AUTH.accent}
            />
          </View>

          {step === 1 ? (
            <>
              <Text style={styles.title}>Enter Your Code</Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit code to{' '}
                <Text style={{ color: AUTH.text, fontWeight: '600' }}>{email}</Text>.
              </Text>

              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <View style={styles.inputWrapper}>
                <Ionicons name="keypad-outline" size={18} color={AUTH.subtext} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="6-digit code"
                  placeholderTextColor={AUTH.placeholder}
                  keyboardType="number-pad"
                  keyboardAppearance="dark"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={handleVerify}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>
                  {loading ? 'Verifying…' : 'Verify Code'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.resendRow} onPress={handleResend} disabled={resending}>
                <Text style={styles.resendText}>Didn't receive a code? </Text>
                <Text style={[styles.resendText, { color: AUTH.accent }]}>
                  {resending ? 'Sending…' : resent ? 'Sent — check your email' : 'Resend'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.title}>New Password</Text>
              <Text style={styles.subtitle}>Choose a new password for your account.</Text>

              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={AUTH.subtext} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="New password (min 6 chars)"
                  placeholderTextColor={AUTH.placeholder}
                  secureTextEntry={!showPw}
                  keyboardAppearance="dark"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  autoFocus
                />
                <TouchableOpacity onPress={() => setShowPw(p => !p)} style={styles.eyeBtn}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={AUTH.subtext} />
                </TouchableOpacity>
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={AUTH.subtext} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Confirm new password"
                  placeholderTextColor={AUTH.placeholder}
                  secureTextEntry={!showConfirm}
                  keyboardAppearance="dark"
                  value={confirmPw}
                  onChangeText={setConfirmPw}
                />
                <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={styles.eyeBtn}>
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={AUTH.subtext} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={handleReset}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>
                  {loading ? 'Resetting…' : 'Reset Password'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: AUTH.bg },
  inner:        { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40 },
  successInner: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'center', alignItems: 'center' },

  backBtn: { alignSelf: 'flex-start', padding: 4, marginBottom: spacing.xl },

  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: AUTH.card, borderWidth: 1, borderColor: AUTH.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg, alignSelf: 'center',
  },

  title:     { fontSize: typography.fontSize.xxl, fontWeight: '700', color: AUTH.text, marginBottom: 8, textAlign: 'center' },
  subtitle:  { fontSize: 15, color: AUTH.subtext, textAlign: 'center', lineHeight: 22, marginBottom: 36 },
  errorText: { color: AUTH.danger, fontSize: typography.fontSize.sm, marginBottom: 16, textAlign: 'center' },

  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: AUTH.inputBg, borderRadius: radius.md, borderWidth: 1, borderColor: AUTH.border,
    marginBottom: 14, paddingHorizontal: 14, height: 54,
  },
  inputIcon: { marginRight: 10 },
  input:     { flex: 1, color: AUTH.text, fontSize: 15 },
  eyeBtn:    { padding: 4 },

  primaryBtn:         { backgroundColor: AUTH.accent, borderRadius: 14, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText:     { fontSize: typography.fontSize.md, fontWeight: '700', color: '#000' },

  resendRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  resendText: { fontSize: typography.fontSize.sm, color: AUTH.subtext },
});
