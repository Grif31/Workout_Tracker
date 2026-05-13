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

type Props = NativeStackScreenProps<AuthStackParamsList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const { handleApple, handleGoogle, handleFacebook } = useSocialAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  const handleLogin = async () => {
    setError('');
    if (!identifier.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (res.ok) {
        await login(data, data.access_token, data.refresh_token);
      } else {
        setError(data.message || 'Invalid credentials.');
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
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Welcome')}>
            <Ionicons name="chevron-back" size={24} color={AUTH.text} />
          </TouchableOpacity>

          {/* Header */}
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>

          {/* Inline error */}
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* Identifier */}
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={18} color={AUTH.subtext} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="e.g. john@example.com"
              placeholderTextColor={AUTH.placeholder}
              autoCapitalize="none"
              keyboardAppearance="dark"
              value={identifier}
              onChangeText={setIdentifier}
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

          {/* Forgot password */}
          <TouchableOpacity
            style={styles.forgotRow}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Log In button */}
          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>{loading ? 'Signing in…' : 'Log In'}</Text>
          </TouchableOpacity>

          {/* Social */}
          <SocialAuthButtons
            onApple={handleApple}
            onGoogle={handleGoogle}
            onFacebook={handleFacebook}
            label="or continue with"
          />

          {/* Sign up link */}
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.footerLink}> Sign Up</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },
  scroll:    { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },

  backBtn: { marginBottom: 28, alignSelf: 'flex-start', padding: 4 },

  title:    { fontSize: 30, fontWeight: '700', color: AUTH.text, marginBottom: 6 },
  subtitle: { fontSize: 15, color: AUTH.subtext, marginBottom: 32 },

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

  forgotRow: { alignItems: 'flex-end', marginBottom: 24 },
  forgotText: { color: AUTH.accent, fontSize: 14, fontWeight: '500' },

  primaryBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },

  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 14, color: AUTH.subtext },
  footerLink: { fontSize: 14, color: AUTH.accent, fontWeight: '600' },
});
