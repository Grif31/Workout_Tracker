import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamsList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import SocialAuthButtons from '../../components/SocialAuthButtons';
import { useSocialAuth } from '../../hooks/useSocialAuth';
import { AUTH } from '../../theme/authColors';
import { apiFetch } from '../../utils/api';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<AuthStackParamsList, 'Signup'>;

export default function SignupScreen({ navigation }: Props) {
  const { login } = useAuth();
  const { handleApple, handleGoogle, handleFacebook } = useSocialAuth();

  const [username, setUsername]           = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirm]     = useState('');
  const [showPw, setShowPw]               = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(false);

  const handleSignup = async () => {
    setError('');
    if (!username.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
      });
      const data = await res.json();
      if (res.ok) {
        await login(data.user ?? data, data.token ?? data.access_token, data.refresh_token);
      } else {
        setError(data.message || 'Could not create account.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={AUTH.text} />
          </TouchableOpacity>

          {/* Header */}
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Start your fitness journey today</Text>

          {/* Inline error */}
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* Username */}
          <View style={styles.inputWrapper}>
            <Ionicons name="at-outline" size={18} color={AUTH.subtext} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={AUTH.placeholder}
              autoCapitalize="none"
              keyboardAppearance="dark"
              value={username}
              onChangeText={setUsername}
            />
          </View>

          {/* Email */}
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

          {/* Password */}
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={18} color={AUTH.subtext} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Min. 6 characters"
              placeholderTextColor={AUTH.placeholder}
              secureTextEntry={!showPw}
              keyboardAppearance="dark"
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPw(p => !p)} style={styles.eyeBtn}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={AUTH.subtext} />
            </TouchableOpacity>
          </View>
          {password.length > 0 && password.length < 6 && (
            <Text style={styles.hintText}>At least 6 characters required</Text>
          )}

          {/* Confirm password */}
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={18} color={AUTH.subtext} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Confirm password"
              placeholderTextColor={AUTH.placeholder}
              secureTextEntry={!showConfirm}
              keyboardAppearance="dark"
              value={confirmPassword}
              onChangeText={setConfirm}
            />
            <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={styles.eyeBtn}>
              <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={AUTH.subtext} />
            </TouchableOpacity>
          </View>

          {/* Create account button */}
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
          </TouchableOpacity>

          {/* Social */}
          <SocialAuthButtons
            onApple={handleApple}
            onGoogle={handleGoogle}
            onFacebook={handleFacebook}
            label="or sign up with"
          />

          {/* Disclaimer */}
          <Text style={styles.disclaimer}>
            By creating an account, you agree to our{' '}
            <Text style={styles.disclaimerLink} onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_API_URL}/terms`)}>
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text style={styles.disclaimerLink} onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_API_URL}/privacy`)}>
              Privacy Policy
            </Text>
          </Text>

          {/* Log in link */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.footerLink}> Log In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },
  scroll:    { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 40 },

  backBtn: { marginBottom: 28, alignSelf: 'flex-start', padding: 4 },

  title:    { fontSize: 30, fontWeight: '700', color: AUTH.text, marginBottom: 6 },
  subtitle: { fontSize: 15, color: AUTH.subtext, marginBottom: 32 },

  errorText: {
    color: AUTH.danger,
    fontSize: typography.fontSize.sm,
    marginBottom: 16,
    textAlign: 'center',
  },
  hintText: {
    color: AUTH.danger,
    fontSize: 12,
    marginTop: -8,
    marginBottom: 10,
    marginLeft: 4,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH.inputBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: AUTH.border,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 54,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    color: AUTH.text,
    fontSize: 15,
  },
  eyeBtn: { padding: 4 },

  primaryBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: typography.fontSize.md, fontWeight: '700', color: '#000' },

  disclaimer: {
    fontSize: 12,
    color: AUTH.subtext,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  disclaimerLink: {
    color: AUTH.accent,
    textDecorationLine: 'underline',
  },

  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { fontSize: typography.fontSize.sm, color: AUTH.subtext },
  footerLink: { fontSize: typography.fontSize.sm, color: AUTH.accent, fontWeight: '600' },
});
