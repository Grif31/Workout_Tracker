import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { OnboardingStackParamsList } from '../../navigation/types';
import { AUTH } from '../../theme/authColors';
import { apiFetch } from '../../utils/api';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { GPS_DISTANCE_UNIT_KEY } from '../../utils/units';

type Props = NativeStackScreenProps<OnboardingStackParamsList, 'OnboardingUnits'>;

export default function OnboardingUnitsScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const [weightIsKg, setWeightIsKg] = useState(user?.weight_unit === 'kg');
  const [distanceIsMi, setDistanceIsMi] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`).then(v => {
      if (v === 'km') setDistanceIsMi(false);
    });
  }, [user?.id]);

  const handleContinue = async () => {
    setSaving(true);
    const weightUnit = weightIsKg ? 'kg' : 'lbs';
    const distanceUnit = distanceIsMi ? 'mi' : 'km';
    try {
      await updateUser({ weight_unit: weightUnit });
      await apiFetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight_unit: weightUnit }),
      });
      if (user?.id) await AsyncStorage.setItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`, distanceUnit);
    } catch {
      // best-effort — the app-wide defaults still work fine if this fails
    } finally {
      setSaving(false);
      navigation.navigate('OnboardingPersonalInfo');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />

      <View style={styles.header} />

      <View style={styles.content}>
        <Text style={styles.title}>Set Your Units</Text>
        <Text style={styles.subtitle}>You can always change these later in Settings.</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="barbell-outline" size={20} color={AUTH.subtext} />
              <Text style={styles.rowLabel}>Weight Unit</Text>
            </View>
            <View style={styles.unitToggle}>
              <Text style={[styles.unitLabel, !weightIsKg && styles.unitActive]}>lbs</Text>
              <Switch
                value={weightIsKg}
                onValueChange={setWeightIsKg}
                trackColor={{ false: AUTH.border, true: AUTH.accent }}
                thumbColor="#fff"
              />
              <Text style={[styles.unitLabel, weightIsKg && styles.unitActive]}>kg</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="navigate-outline" size={20} color={AUTH.subtext} />
              <Text style={styles.rowLabel}>Distance Unit</Text>
            </View>
            <View style={styles.unitToggle}>
              <Text style={[styles.unitLabel, !distanceIsMi && styles.unitActive]}>km</Text>
              <Switch
                value={distanceIsMi}
                onValueChange={setDistanceIsMi}
                trackColor={{ false: AUTH.border, true: AUTH.accent }}
                thumbColor="#fff"
              />
              <Text style={[styles.unitLabel, distanceIsMi && styles.unitActive]}>mi</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue} disabled={saving} activeOpacity={0.85}>
          <Text style={styles.continueBtnText}>{saving ? 'Saving…' : 'Continue'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },

  header: { minHeight: 44, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },

  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  title: { fontSize: typography.fontSize.xxl, fontWeight: '700', color: AUTH.text },
  subtitle: { fontSize: typography.fontSize.md, color: AUTH.subtext, marginTop: spacing.xs, lineHeight: 22 },

  card: {
    backgroundColor: AUTH.card,
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 14,
    marginTop: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { fontSize: typography.fontSize.md, color: AUTH.text, fontWeight: '500' },
  divider: { height: 1, backgroundColor: AUTH.border, marginHorizontal: spacing.md },
  unitToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unitLabel: { fontSize: typography.fontSize.sm, color: AUTH.subtext, fontWeight: '500' },
  unitActive: { color: AUTH.text, fontWeight: '700' },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm },
  continueBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueBtnText: { fontSize: typography.fontSize.md, fontWeight: '700', color: AUTH.bg },
});
