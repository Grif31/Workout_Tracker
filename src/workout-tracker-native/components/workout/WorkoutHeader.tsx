import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Switch, StyleSheet, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type ExerciseEntry, fmtElapsed } from './types';

type Props = {
  workoutName: string;
  onWorkoutNameChange: (val: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  elapsed: number;
  onResetTimer: () => void;
  editMode?: boolean;
  settingsExpanded: boolean;
  onToggleSettings: () => void;
  autoStartRest: boolean;
  onAutoStartRestChange: (val: boolean) => void;
  vibrateOnComplete: boolean;
  onVibrateChange: (val: boolean) => void;
  showRpe: boolean;
  onShowRpeChange: (val: boolean) => void;
  templates: { id: number; name: string; exercises: any[] }[];
  onApplyTemplate: (template: any) => void;
  exercises: ExerciseEntry[];
  weightUnit: string;
};

export default function WorkoutHeader({
  workoutName,
  onWorkoutNameChange,
  notes,
  onNotesChange,
  selectedDate,
  onDateChange,
  elapsed,
  onResetTimer,
  editMode,
  settingsExpanded,
  onToggleSettings,
  autoStartRest,
  onAutoStartRestChange,
  vibrateOnComplete,
  onVibrateChange,
  showRpe,
  onShowRpeChange,
  templates,
  onApplyTemplate,
  exercises,
  weightUnit,
}: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const totalVolume = exercises.reduce((sum, ex) =>
    sum + ex.sets.reduce((s, set) => {
      const r = parseFloat(set.reps);
      const w = parseFloat(set.weight);
      return s + (isNaN(r) || isNaN(w) ? 0 : r * w);
    }, 0), 0);

  return (
    <View style={styles.formSection}>
      <TextInput
        style={styles.titleInput}
        placeholder="Workout Name"
        placeholderTextColor={colors.placeholder}
        value={workoutName}
        onChangeText={onWorkoutNameChange}
      />
      <TextInput
        style={styles.notesInput}
        placeholder="Add notes..."
        placeholderTextColor={colors.placeholder}
        value={notes}
        onChangeText={onNotesChange}
        multiline
      />

      {/* Date + Settings row */}
      <View style={styles.dateSettingsRow}>
        <TouchableOpacity style={styles.datePart} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.dateText}>
            {selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onToggleSettings} style={styles.settingsGearBtn} activeOpacity={0.7}>
          <Ionicons name="settings-outline" size={18} color={settingsExpanded ? colors.accent : colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <View style={{ backgroundColor: colors.surface, borderRadius: spacing.sm, overflow: 'hidden', marginBottom: spacing.sm }}>
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            themeVariant={mode === 'dark' ? 'dark' : 'light'}
            textColor={colors.textPrimary}
            accentColor={colors.accent}
            onChange={(_event: any, date?: Date) => {
              setShowDatePicker(false);
              if (date) onDateChange(date);
            }}
          />
        </View>
      )}

      {!editMode && (
        <View style={styles.timerCard}>
          <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.timerLabel}>Elapsed</Text>
          <Text style={styles.timerValue}>{fmtElapsed(elapsed)}</Text>
          <TouchableOpacity onPress={onResetTimer} style={styles.timerResetBtn}>
            <Ionicons name="refresh-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.timerResetText}>Reset</Text>
          </TouchableOpacity>
        </View>
      )}

      {settingsExpanded && (
        <View style={styles.settingsPanel}>
          <View style={styles.settingsItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>Auto-start rest timer</Text>
              <Text style={styles.settingsHint}>Start rest countdown when a set is checked off</Text>
            </View>
            <Switch
              value={autoStartRest}
              onValueChange={onAutoStartRestChange}
              trackColor={{ false: colors.border, true: colors.save }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.settingsItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>Vibrate when rest ends</Text>
              <Text style={styles.settingsHint}>Vibrate the phone when the rest countdown completes</Text>
            </View>
            <Switch
              value={vibrateOnComplete}
              onValueChange={onVibrateChange}
              trackColor={{ false: colors.border, true: colors.save }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.settingsItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>Track RPE (1–10)</Text>
              <Text style={styles.settingsHint}>Show an RPE input column on each strength set</Text>
            </View>
            <Switch
              value={showRpe}
              onValueChange={onShowRpeChange}
              trackColor={{ false: colors.border, true: colors.save }}
              thumbColor="#fff"
            />
          </View>
        </View>
      )}

      {!editMode && exercises.length === 0 && templates.length > 0 && (
        <View style={styles.templateSection}>
          <Text style={styles.templateSectionLabel}>Start from a template</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateScrollContent}>
            {templates.map(t => (
              <TouchableOpacity key={t.id} style={[styles.templateChip, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => onApplyTemplate(t)}>
                <Text style={[styles.templateChipName, { color: colors.textPrimary }]} numberOfLines={1}>{t.name}</Text>
                <Text style={[styles.templateChipSub, { color: colors.textSecondary }]}>{t.exercises.length} {t.exercises.length === 1 ? 'exercise' : 'exercises'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {exercises.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{exercises.length}</Text>
            <Text style={styles.summaryLabel}>{exercises.length === 1 ? 'Exercise' : 'Exercises'}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{Math.round(totalVolume).toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>Total {weightUnit}</Text>
          </View>
        </View>
      )}

      {exercises.length > 0 && <Text style={styles.sectionLabel}>Exercises</Text>}
    </View>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  formSection: { paddingHorizontal: spacing.md },

  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    marginBottom: 2,
  },
  notesInput: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    minHeight: 32,
  },

  dateSettingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  datePart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dateText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  settingsGearBtn: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },

  timerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  timerLabel: { fontSize: typography.fontSize.sm, color: colors.textSecondary, flex: 1 },
  timerValue: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary },
  timerResetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: spacing.sm },
  timerResetText: { fontSize: typography.fontSize.sm, color: colors.textSecondary },

  settingsPanel: {
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingsLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingsHint: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },

  templateSection: {
    marginBottom: spacing.md,
  },
  templateSectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  templateScrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  templateChip: {
    borderRadius: spacing.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 120,
    maxWidth: 180,
  },
  templateChipName: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
  templateChipSub: {
    fontSize: 11,
    marginTop: 2,
  },

  summaryBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  summaryLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
});
