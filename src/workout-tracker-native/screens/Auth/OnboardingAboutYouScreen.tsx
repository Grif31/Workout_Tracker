import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, Platform, Modal, Alert, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { OnboardingStackParamsList } from '../../navigation/types';
import { AUTH } from '../../theme/authColors';
import { apiFetch } from '../../utils/api';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { GPS_DISTANCE_UNIT_KEY, roundTenth, type WeightUnit, type DistanceUnit } from '../../utils/units';
import { toLocalDateStr } from '../../utils/date';
import SegmentedControl, { type SegmentPalette } from '../../components/SegmentedControl';

type Props = NativeStackScreenProps<OnboardingStackParamsList, 'OnboardingAboutYou'>;

const LBS_PER_KG = 2.20462;

// Onboarding is always dark, whatever the app theme is
const AUTH_SEGMENTS: SegmentPalette = {
  track: AUTH.inputBg,
  border: AUTH.border,
  thumb: AUTH.accent,
  text: AUTH.subtext,
  activeText: AUTH.bg,
};

const WEIGHT_UNITS = [{ key: 'lbs', label: 'lbs' }, { key: 'kg', label: 'kg' }] as const;
const DISTANCE_UNITS = [{ key: 'mi', label: 'mi' }, { key: 'km', label: 'km' }] as const;
const SEXES = [{ key: 'male', label: 'Male' }, { key: 'female', label: 'Female' }] as const;

/** A text field with its unit written inside it, on the right. */
function UnitInput({ unit, ...props }: React.ComponentProps<typeof TextInput> & { unit: string }) {
  return (
    <View style={styles.unitInput}>
      <TextInput {...props} style={styles.unitInputField} placeholderTextColor={AUTH.placeholder} keyboardAppearance="dark" />
      <Text style={styles.unitSuffix}>{unit}</Text>
    </View>
  );
}

// Staggered entrance for each section of the form
const enter = (i: number) => FadeInDown.delay(60 * i).duration(320);

/**
 * Onboarding's one form: units and the profile fields the app actually uses
 * (sex and bodyweight feed the Strength Score). It replaced separate Units
 * and Personal Info screens.
 */
export default function OnboardingAboutYouScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const savedUnit: WeightUnit = user?.weight_unit === 'kg' ? 'kg' : 'lbs';

  const [weightUnit, setWeightUnit] = useState<WeightUnit>(savedUnit);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>('mi');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [weight, setWeight] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    AsyncStorage.getItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`).then(v => {
      if (v === 'km') setDistanceUnit('km');
    });
  }, [user?.id]);

  // Lengths follow the weight unit everywhere (body measurements are cm for
  // kg users, utils/bodyMetrics lengthUnitFor), so height does too
  const metric = weightUnit === 'kg';

  const goNext = () => navigation.navigate('Onboarding');

  const handleContinue = async () => {
    setSaving(true);
    if (user?.id) await AsyncStorage.setItem(`${GPS_DISTANCE_UNIT_KEY}_${user.id}`, distanceUnit);

    const updates: Record<string, unknown> = {};
    const unitChanged = weightUnit !== savedUnit;
    if (unitChanged) updates.weight_unit = weightUnit;
    if (name.trim()) updates.name = name.trim();
    if (gender) updates.gender = gender;
    if (birthDate) updates.birth_date = toLocalDateStr(birthDate);
    if (metric && heightCm) {
      updates.height = parseFloat(heightCm) / 2.54;
    } else if (!metric && (heightFt || heightIn)) {
      updates.height = parseInt(heightFt || '0', 10) * 12 + parseFloat(heightIn || '0');
    }

    // The unit the server ends up with: a weight is stored in it
    let unitNow = savedUnit;
    if (Object.keys(updates).length > 0) {
      let saved = false;
      try {
        const res = await apiFetch('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (res.ok) {
          saved = true;
          await updateUser(await res.json());
          unitNow = weightUnit;
        }
      } catch { /* not saved */ }
      // A local unit the server never accepted would label every weight wrong
      if (!saved && unitChanged) {
        setWeightUnit(savedUnit);
        Alert.alert("Couldn't Save Your Units", `You're set to ${savedUnit} for now. You can change it anytime in Settings.`);
      }
    }

    const typed = parseFloat(weight);
    if (weight && !isNaN(typed) && typed > 0) {
      // Typed in the unit picked here; store it in the one the server kept
      const value = unitNow === weightUnit
        ? typed
        : roundTenth(unitNow === 'kg' ? typed / LBS_PER_KG : typed * LBS_PER_KG);
      try {
        const res = await apiFetch('/api/bodyweight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weight: value, date: toLocalDateStr(new Date()) }),
        });
        if (res.ok) await updateUser({ bodyweight: value });
      } catch { /* optional; never blocks entry */ }
    }

    setSaving(false);
    goNext();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={goNext} style={styles.skipBtn} accessibilityRole="button">
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Animated.View entering={enter(0)}>
            <Text style={styles.title}>About You</Text>
            <Text style={styles.subtitle}>All optional, and you can change any of it later.</Text>
          </Animated.View>

          <Animated.View entering={enter(1)} style={styles.section}>
            <Text style={styles.label}>Units</Text>
            <View style={styles.row}>
              <View style={styles.half}>
                <SegmentedControl
                  options={WEIGHT_UNITS}
                  value={weightUnit}
                  onChange={setWeightUnit}
                  palette={AUTH_SEGMENTS}
                  size="md"
                />
              </View>
              <View style={styles.half}>
                <SegmentedControl
                  options={DISTANCE_UNITS}
                  value={distanceUnit}
                  onChange={setDistanceUnit}
                  palette={AUTH_SEGMENTS}
                  size="md"
                />
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={enter(2)} style={styles.section}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={AUTH.placeholder}
              keyboardAppearance="dark"
              autoComplete="name"
              textContentType="name"
              value={name}
              onChangeText={setName}
            />
          </Animated.View>

          <Animated.View entering={enter(3)} style={styles.section}>
            <Text style={styles.label}>Sex</Text>
            <SegmentedControl
              options={SEXES}
              value={gender}
              onChange={g => setGender(prev => (prev === g ? null : g))}
              palette={AUTH_SEGMENTS}
              size="md"
            />
            <Text style={styles.hint}>Used to compare your lifts with lifters of the same sex in your Strength Score.</Text>
          </Animated.View>

          <Animated.View entering={enter(4)} style={styles.section}>
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Bodyweight</Text>
                <UnitInput testID="bodyweight-input" unit={weightUnit} placeholder="0" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Height</Text>
                {metric ? (
                  <UnitInput testID="height-cm-input" unit="cm" placeholder="0" value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
                ) : (
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <UnitInput testID="height-ft-input" unit="ft" placeholder="0" value={heightFt} onChangeText={setHeightFt} keyboardType="number-pad" />
                    </View>
                    <View style={styles.half}>
                      <UnitInput testID="height-in-input" unit="in" placeholder="0" value={heightIn} onChangeText={setHeightIn} keyboardType="decimal-pad" />
                    </View>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={enter(5)} style={styles.section}>
            <Text style={styles.label}>Birthday</Text>
            <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
              <Text style={birthDate ? styles.inputText : styles.placeholderText}>
                {birthDate
                  ? birthDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                  : 'Select birthday'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.hint}>Strength Score adjusts for age.</Text>
          </Animated.View>

          {Platform.OS === 'ios' ? (
            <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
              <View style={styles.pickerModal}>
                <View style={styles.pickerCard}>
                  <TouchableOpacity style={styles.pickerDone} onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                  <DateTimePicker
                    value={birthDate ?? new Date(1990, 0, 1)}
                    mode="date"
                    display="spinner"
                    themeVariant="dark"
                    maximumDate={new Date(new Date().getFullYear() - 14, 11, 31)}
                    minimumDate={new Date(1920, 0, 1)}
                    onChange={(_, date) => { if (date) setBirthDate(date); }}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            showDatePicker && (
              <DateTimePicker
                value={birthDate ?? new Date(1990, 0, 1)}
                mode="date"
                display="default"
                maximumDate={new Date(new Date().getFullYear() - 14, 11, 31)}
                minimumDate={new Date(1920, 0, 1)}
                onChange={(_, date) => { setShowDatePicker(false); if (date) setBirthDate(date); }}
              />
            )
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.continueBtn} onPress={handleContinue} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color={AUTH.bg} /> : <Text style={styles.continueBtnText}>Continue</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  skipBtn: { paddingVertical: 6 },
  skipText: { fontSize: 15, color: AUTH.subtext, fontWeight: '500' },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: typography.fontSize.xxl, fontWeight: '700', color: AUTH.text, marginBottom: spacing.xs },
  subtitle: { fontSize: typography.fontSize.md, color: AUTH.subtext, marginBottom: spacing.md, lineHeight: 22 },

  section: { marginTop: spacing.md },
  label: { fontSize: typography.fontSize.sm, color: AUTH.text, marginBottom: spacing.xs, fontWeight: '600' },
  hint: { fontSize: typography.fontSize.xs, color: AUTH.subtext, marginTop: spacing.xs, lineHeight: 16 },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },

  input: {
    backgroundColor: AUTH.inputBg,
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: typography.fontSize.md,
    color: AUTH.text,
  },
  inputText: { fontSize: typography.fontSize.md, color: AUTH.text },
  placeholderText: { fontSize: typography.fontSize.md, color: AUTH.placeholder },

  unitInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH.inputBg,
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
  },
  unitInputField: { flex: 1, paddingVertical: 14, fontSize: typography.fontSize.md, color: AUTH.text },
  unitSuffix: { fontSize: typography.fontSize.sm, color: AUTH.subtext, marginLeft: spacing.xs },

  pickerModal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  pickerCard: { backgroundColor: AUTH.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: spacing.xl },
  pickerDone: { alignSelf: 'flex-end', padding: spacing.md },
  pickerDoneText: { fontSize: typography.fontSize.md, color: AUTH.accent, fontWeight: '600' },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm },
  continueBtn: { backgroundColor: AUTH.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  continueBtnText: { fontSize: typography.fontSize.md, fontWeight: '700', color: AUTH.bg },
});
