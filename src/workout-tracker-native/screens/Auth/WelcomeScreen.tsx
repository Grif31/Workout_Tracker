import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamsList } from '../../navigation/types';
import { useSocialAuth } from '../../hooks/useSocialAuth';
import { AUTH } from '../../theme/authColors';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Props = NativeStackScreenProps<AuthStackParamsList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  const { handleApple, handleGoogle, handleFacebook } = useSocialAuth();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />

      {/* ── hero ── */}
      <View style={styles.hero}>
        <View style={styles.logoCircle}>
          <Ionicons name="barbell-outline" size={40} color={AUTH.accent} />
        </View>
        <Text style={styles.title}>Aretē</Text>
        <Text style={styles.tagline}>Strive for Excellence</Text>
      </View>

      {/* ── bottom actions ── */}
      <View style={styles.actions}>
        {/* Apple sign in — iOS only */}
        {Platform.OS === 'ios' && (
          <TouchableOpacity style={styles.appleBtn} onPress={handleApple} activeOpacity={0.85}>
            <Ionicons name="logo-apple" size={20} color="#000" />
            <Text style={styles.appleBtnText}>Sign in with Apple</Text>
          </TouchableOpacity>
        )}

        {/* Sign Up */}
        <TouchableOpacity
          style={styles.signupBtn}
          onPress={() => navigation.navigate('Signup')}
          activeOpacity={0.85}
        >
          <Text style={styles.signupBtnText}>Sign Up</Text>
        </TouchableOpacity>

        {/* Log In (text only) */}
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.7}
        >
          <Text style={styles.loginBtnText}>Log In</Text>
        </TouchableOpacity>

        {/* Social divider */}
        <View style={styles.dividerRow}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>or sign in with</Text>
          <View style={styles.line} />
        </View>

        {/* Icon-only social row */}
        <View style={styles.socialRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={handleGoogle} activeOpacity={0.75}>
            <Ionicons name="logo-google" size={22} color={AUTH.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleFacebook} activeOpacity={0.75}>
            <Ionicons name="logo-facebook" size={22} color={AUTH.text} />
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Sign in securely via your existing account</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AUTH.bg,
    paddingHorizontal: spacing.lg,
  },

  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AUTH.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: AUTH.border,
  },
  title: {
    fontSize: 42,
    fontWeight: '700',
    color: AUTH.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: typography.fontSize.md,
    color: AUTH.subtext,
    fontStyle: 'italic',
  },

  actions: {
    paddingBottom: 12,
    gap: 0,
  },

  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 12,
  },
  appleBtnText: {
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: '#000',
  },

  signupBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  signupBtnText: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: '#000',
  },

  loginBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: AUTH.text,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: 10,
  },
  line: { flex: 1, height: 1, backgroundColor: AUTH.border },
  dividerText: { fontSize: 13, color: AUTH.subtext },

  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: 20,
  },
  iconBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: AUTH.border,
    backgroundColor: AUTH.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: {
    fontSize: 12,
    color: AUTH.placeholder,
    textAlign: 'center',
    marginTop: 4,
  },
});
