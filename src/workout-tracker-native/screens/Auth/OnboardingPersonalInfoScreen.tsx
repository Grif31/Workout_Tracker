import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../context/AuthContext';
import { OnboardingStackParamsList } from '../../navigation/types';
import { AUTH } from '../../theme/authColors';
import { apiFetch } from '../../utils/api';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { toLocalDateStr } from '../../utils/date';

type Props = NativeStackScreenProps<OnboardingStackParamsList, 'OnboardingPersonalInfo'>;

export default function OnboardingPersonalInfoScreen({ navigation }: Props) {
  const { user, updateUser } = useAuth();
  const weightUnit = user?.weight_unit === 'kg' ? 'kg' : 'lbs';

  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  // Lengths follow the weight unit everywhere (body measurements are cm for
  // kg users, utils/bodyMetrics lengthUnitFor), so height does too
  const useMetricHeight = weightUnit === 'kg';

  const goNext = () => navigation.navigate('Onboarding');

  const handleContinue = async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (name.trim()) updates.name = name.trim();
      if (gender) updates.gender = gender;
      if (birthDate) updates.birth_date = toLocalDateStr(birthDate);
      if (useMetricHeight && heightCm) {
        updates.height = parseFloat(heightCm) / 2.54;
      } else if (!useMetricHeight && (heightFt || heightIn)) {
        updates.height = parseInt(heightFt || '0', 10) * 12 + parseFloat(heightIn || '0');
      }

      if (Object.keys(updates).length > 0) {
        const res = await apiFetch('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (res.ok) await updateUser(await res.json());
      }

      const parsedWeight = parseFloat(weight);
      if (weight && !isNaN(parsedWeight) && parsedWeight > 0) {
        const res = await apiFetch('/api/bodyweight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weight: parsedWeight, date: toLocalDateStr(new Date()) }),
        });
        if (res.ok) await updateUser({ bodyweight: parsedWeight });
      }
    } catch {
      // best-effort — this is all optional info, never block entry to the app
    } finally {
      setSaving(false);
      goNext();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={AUTH.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={goNext} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Tell Us About Yourself</Text>
        <Text style={styles.subtitle}>Totally optional. You can add or edit this anytime from your profile.</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={AUTH.placeholder}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Birthday</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
          <Text style={birthDate ? styles.inputText : styles.placeholderText}>
            {birthDate
              ? birthDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
              : 'Select birthday'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Personalizes your Strength Score's age adjustment.</Text>

        {Platform.OS === 'ios' ? (
          <Modal visible={showDatePicker} transparent animationType="slide">
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
              onChange={(_, date) => {
                setShowDatePicker(false);
                if (date) setBirthDate(date);
              }}
            />
          )
        )}

        <Text style={styles.label}>Weight ({weightUnit})</Text>
        <TextInput
          style={styles.input}
          placeholder={`Your weight in ${weightUnit}`}
          placeholderTextColor={AUTH.placeholder}
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Sex</Text>
        <View style={styles.row}>
          {([['male', 'Male'], ['female', 'Female']] as const).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              style={[styles.input, styles.choice, gender === value && styles.choiceOn]}
              onPress={() => setGender(g => (g === value ? null : value))}
              accessibilityRole="button"
              accessibilityState={{ selected: gender === value }}
            >
              <Text style={[styles.inputText, gender === value && styles.choiceOnText]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.hint}>Used to compare your lifts with lifters of the same sex in your Strength Score.</Text>

        <Text style={styles.label}>Height</Text>
        {useMetricHeight ? (
          <TextInput
            style={styles.input}
            placeholder="cm"
            placeholderTextColor={AUTH.placeholder}
            value={heightCm}
            onChangeText={setHeightCm}
            keyboardType="decimal-pad"
          />
        ) : (
          <View style={styles.row}>
            <View style={styles.halfInputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="ft"
                placeholderTextColor={AUTH.placeholder}
                value={heightFt}
                onChangeText={setHeightFt}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.halfInputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="in"
                placeholderTextColor={AUTH.placeholder}
                value={heightIn}
                onChangeText={setHeightIn}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        )}
      </ScrollView>

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
  skipBtn: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  skipText: { fontSize: 15, color: AUTH.subtext, fontWeight: '500' },

  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  title: { fontSize: typography.fontSize.xxl, fontWeight: '700', color: AUTH.text },
  subtitle: { fontSize: typography.fontSize.md, color: AUTH.subtext, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 22 },

  label: { fontSize: typography.fontSize.sm, color: AUTH.text, marginBottom: spacing.xs, fontWeight: '500' },
  input: {
    backgroundColor: AUTH.inputBg,
    borderWidth: 1,
    borderColor: AUTH.border,
    borderRadius: spacing.sm,
    padding: spacing.md,
    fontSize: typography.fontSize.md,
    color: AUTH.text,
    marginBottom: spacing.md,
  },
  inputText: { fontSize: typography.fontSize.md, color: AUTH.text },
  placeholderText: { fontSize: typography.fontSize.md, color: AUTH.placeholder },
  hint: { fontSize: typography.fontSize.sm, color: AUTH.subtext, marginTop: -spacing.sm, marginBottom: spacing.md },

  row: { flexDirection: 'row', gap: spacing.sm },
  choice: { flex: 1, alignItems: 'center' },
  choiceOn: { borderColor: AUTH.accent, backgroundColor: AUTH.accent + '22' },
  choiceOnText: { color: AUTH.accent, fontWeight: '700' },
  halfInputWrapper: { flex: 1 },

  pickerModal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  pickerCard: { backgroundColor: AUTH.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: spacing.xl },
  pickerDone: { alignItems: 'flex-end', padding: spacing.md },
  pickerDoneText: { color: AUTH.accent, fontWeight: '600', fontSize: typography.fontSize.md },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm },
  continueBtn: {
    backgroundColor: AUTH.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueBtnText: { fontSize: typography.fontSize.md, fontWeight: '700', color: AUTH.bg },
});
