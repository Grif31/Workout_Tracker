import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { radius } from '../../theme/spacing';

export type CoachProfile = {
  goal: string;
  experience: string;
  equipment: string;
  days_per_week: number;
  session_length_min: number;
  avoid: string[];
  notes: string;
};

const COACH_PROFILE_KEY = 'coach_profile';
const LEGACY_KEY = 'coach_settings';

const DEFAULT_PROFILE: CoachProfile = {
  goal: 'general',
  experience: 'beginner',
  equipment: 'full_gym',
  days_per_week: 3,
  session_length_min: 60,
  avoid: [],
  notes: '',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (profile: CoachProfile) => void;
};

function Chip({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        chipStyles.chip,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.accent + '22' : colors.surface,
        },
      ]}
    >
      <Text style={[chipStyles.text, { color: active ? colors.accent : colors.textSecondary, fontWeight: active ? '700' : '500' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  text: { fontSize: typography.fontSize.sm },
});

export default function CoachProfileModal({ visible, onClose, onSave }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [profile, setProfile] = useState<CoachProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.multiGet([COACH_PROFILE_KEY, LEGACY_KEY]).then(([newRaw, legacyRaw]) => {
      if (newRaw[1]) {
        try { setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(newRaw[1]) }); return; } catch { }
      }
      // Migrate from old coach_settings key
      if (legacyRaw[1]) {
        try {
          const s = JSON.parse(legacyRaw[1]);
          setProfile({
            ...DEFAULT_PROFILE,
            goal: s.goal ?? DEFAULT_PROFILE.goal,
            experience: s.exp ?? DEFAULT_PROFILE.experience,
            equipment: s.equipment ?? DEFAULT_PROFILE.equipment,
            days_per_week: s.days ?? DEFAULT_PROFILE.days_per_week,
            session_length_min: s.sessionLength ? parseInt(s.sessionLength, 10) : DEFAULT_PROFILE.session_length_min,
            avoid: s.avoid && s.avoid !== 'none' ? [s.avoid] : [],
            notes: '',
          });
        } catch { }
      }
    });
  }, [visible]);

  const set = <K extends keyof CoachProfile>(key: K, value: CoachProfile[K]) =>
    setProfile(p => ({ ...p, [key]: value }));

  const toggleAvoid = (item: string) =>
    setProfile(p => ({
      ...p,
      avoid: p.avoid.includes(item) ? p.avoid.filter(x => x !== item) : [...p.avoid, item],
    }));

  const handleSave = async () => {
    await AsyncStorage.setItem(COACH_PROFILE_KEY, JSON.stringify(profile));
    onSave(profile);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Coach Profile</Text>
          <TouchableOpacity onPress={handleSave} hitSlop={8}>
            <Text style={styles.saveBtn}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Training Goal */}
          <Text style={styles.sectionLabel}>Training Goal</Text>
          <View style={styles.chipRow}>
            {[
              { value: 'hypertrophy', label: 'Hypertrophy' },
              { value: 'strength', label: 'Strength' },
              { value: 'endurance', label: 'Endurance' },
              { value: 'general', label: 'General' },
            ].map(({ value, label }) => (
              <Chip key={value} label={label} active={profile.goal === value} onPress={() => set('goal', value)} />
            ))}
          </View>

          {/* Experience Level */}
          <Text style={styles.sectionLabel}>Experience Level</Text>
          <View style={styles.chipRow}>
            {[
              { value: 'beginner', label: 'Beginner' },
              { value: 'intermediate', label: 'Intermediate' },
              { value: 'advanced', label: 'Advanced' },
            ].map(({ value, label }) => (
              <Chip key={value} label={label} active={profile.experience === value} onPress={() => set('experience', value)} />
            ))}
          </View>

          {/* Equipment */}
          <Text style={styles.sectionLabel}>Equipment</Text>
          <View style={styles.chipRow}>
            {[
              { value: 'full_gym', label: 'Full Gym' },
              { value: 'home_barbell', label: 'Home Barbell' },
              { value: 'dumbbells', label: 'Dumbbells' },
              { value: 'bodyweight', label: 'Bodyweight' },
            ].map(({ value, label }) => (
              <Chip key={value} label={label} active={profile.equipment === value} onPress={() => set('equipment', value)} />
            ))}
          </View>

          {/* Days per week */}
          <Text style={styles.sectionLabel}>Days Per Week</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => set('days_per_week', Math.max(1, profile.days_per_week - 1))}
            >
              <Text style={styles.stepperBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{profile.days_per_week}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => set('days_per_week', Math.min(7, profile.days_per_week + 1))}
            >
              <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Session Length */}
          <Text style={styles.sectionLabel}>Session Length</Text>
          <View style={styles.chipRow}>
            {[
              { value: 30, label: '30 min' },
              { value: 45, label: '45 min' },
              { value: 60, label: '60 min' },
              { value: 90, label: '90 min' },
            ].map(({ value, label }) => (
              <Chip
                key={value}
                label={label}
                active={profile.session_length_min === value}
                onPress={() => set('session_length_min', value)}
              />
            ))}
          </View>

          {/* Avoid / Injuries */}
          <Text style={styles.sectionLabel}>Avoid (Injuries)</Text>
          <View style={styles.chipRow}>
            {[
              { value: 'lower_back', label: 'Lower Back' },
              { value: 'knees', label: 'Knees' },
              { value: 'shoulders', label: 'Shoulders' },
            ].map(({ value, label }) => (
              <Chip
                key={value}
                label={label}
                active={profile.avoid.includes(value)}
                onPress={() => toggleAvoid(value)}
              />
            ))}
          </View>

          {/* Notes */}
          <Text style={styles.sectionLabel}>Notes to Coach</Text>
          <TextInput
            style={styles.notesInput}
            value={profile.notes}
            onChangeText={v => set('notes', v)}
            placeholder="Goals, preferences, anything your coach should know…"
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <TouchableOpacity style={styles.saveBlock} onPress={handleSave}>
            <Text style={styles.saveBlockText}>Save Profile</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  saveBtn: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.accent },
  content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: spacing.xl * 2 },
  sectionLabel: {
    fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.md, marginBottom: spacing.xs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stepperBtn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 22, color: colors.accent, fontWeight: '600', lineHeight: 26 },
  stepperValue: { fontSize: 32, fontWeight: '700', color: colors.textPrimary, minWidth: 36, textAlign: 'center' },
  notesInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, color: colors.textPrimary,
    fontSize: typography.fontSize.sm, minHeight: 90,
  },
  saveBlock: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.lg,
  },
  saveBlockText: { color: colors.accentText, fontSize: typography.fontSize.md, fontWeight: '700' },
});
