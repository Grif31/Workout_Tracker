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
import { AuthStackParamsList } from '../../navigation/types';
import { AUTH } from '../../theme/authColors';
import { apiFetch } from '../../utils/api';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<AuthStackParamsList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        navigation.navigate('ResetPassword', { email: email.trim() });
      } else {
        try {
          const data = await res.json();
          setError(data.message || 'Something went wrong.');
        } catch {
          setError(`Request failed (${res.status}). Please try again.`);
        }
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
            <Ionicons name="arrow-back" size={24} color={AUTH.text} />
          </TouchableOpacity>

          {/* Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="key-outline" size={32} color={AUTH.accent} />
          </View>

          {/* Header */}
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we'll send you a 6-digit code.
          </Text>

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
              {loading ? 'Sending…' : 'Send Code'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },
  inner:     { flex: 1, paddingHorizontal: spacing.lg, paddingTop: 8 },

  backBtn: { alignSelf: 'flex-start', padding: 4, marginBottom: spacing.xl },

  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: AUTH.card,
    borderWidth: 1,
    borderColor: AUTH.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    alignSelf: 'center',
  },

  title:    { fontSize: typography.fontSize.xxl, fontWeight: '700', color: AUTH.text, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: AUTH.subtext, textAlign: 'center', lineHeight: 22, marginBottom: 36 },

  errorText: {
    color: AUTH.danger,
    fontSize: typography.fontSize.sm,
    marginBottom: 16,
    textAlign: 'center',
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH.inputBg,
    borderRadius: radius.md,
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
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: typography.fontSize.md, fontWeight: '700', color: '#000' },

});
