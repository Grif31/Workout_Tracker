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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamsList } from '../navigation/types';
import { AUTH } from '../theme/authColors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Props = NativeStackScreenProps<AuthStackParamsList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        setError(data.message || 'Something went wrong.');
      }
    } catch {
      setError('Could not connect. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inner}>
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={AUTH.text} />
          </TouchableOpacity>

          {/* Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="key-outline" size={32} color={AUTH.accent} />
          </View>

          {/* Header */}
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we'll send you a reset link.
          </Text>

          {success ? (
            /* ── Success state ── */
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={28} color={AUTH.accent} style={{ marginBottom: 10 }} />
              <Text style={styles.successText}>
                If that email is registered, a reset link has been sent. Check your inbox.
              </Text>
              <TouchableOpacity
                style={styles.backToLoginBtn}
                onPress={() => navigation.navigate('Login')}
              >
                <Text style={styles.backToLoginText}>Back to Log In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Form state ── */
            <>
              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={AUTH.subtext} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. john@example.com"
                  placeholderTextColor={AUTH.placeholder}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  keyboardAppearance="dark"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },
  inner:     { flex: 1, paddingHorizontal: 24, paddingTop: 8 },

  backBtn: { alignSelf: 'flex-start', padding: 4, marginBottom: 32 },

  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: AUTH.card,
    borderWidth: 1,
    borderColor: AUTH.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    alignSelf: 'center',
  },

  title:    { fontSize: 28, fontWeight: '700', color: AUTH.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: AUTH.subtext, textAlign: 'center', lineHeight: 22, marginBottom: 36 },

  errorText: {
    color: AUTH.danger,
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AUTH.border,
    marginBottom: 20,
    paddingHorizontal: 14,
    height: 54,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    color: AUTH.text,
    fontSize: 15,
  },

  primaryBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },

  successBox: {
    backgroundColor: AUTH.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AUTH.border,
    padding: 24,
    alignItems: 'center',
  },
  successText: {
    color: AUTH.subtext,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  backToLoginBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 32,
  },
  backToLoginText: { fontSize: 15, fontWeight: '700', color: '#000' },
});
