import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, Platform, Modal, Animated,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type ExerciseEntry, fmtElapsed } from './types';
import MuscleDiagram from '../MuscleDiagram';

type Props = {
  workoutName: string;
  onWorkoutNameChange: (val: string) => void;
  notes: string;
  onNotesChange: (val: string) => void;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  elapsed: number;
  timerPaused: boolean;
  onToggleTimer: () => void;
  onResetTimer: () => void;
  editMode?: boolean;
  autoStartRest: boolean;
  onAutoStartRestChange: (val: boolean) => void;
  vibrateOnComplete: boolean;
  onVibrateChange: (val: boolean) => void;
  showRpe: boolean;
  onShowRpeChange: (val: boolean) => void;
  showPlateCalc: boolean;
  onShowPlateCalcChange: (val: boolean) => void;
  exercises: ExerciseEntry[];
  weightUnit: string;
  activeMuscles: string[];
};

export default function WorkoutHeader({
  workoutName,
  onWorkoutNameChange,
  notes,
  onNotesChange,
  selectedDate,
  onDateChange,
  elapsed,
  timerPaused,
  onToggleTimer,
  onResetTimer,
  editMode,
  autoStartRest,
  onAutoStartRestChange,
  vibrateOnComplete,
  onVibrateChange,
  showRpe,
  onShowRpeChange,
  showPlateCalc,
  onShowPlateCalcChange,
  exercises,
  weightUnit,
  activeMuscles,
}: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [diagramModalVisible, setDiagramModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (timerPaused) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [timerPaused]);

  const totalVolume = exercises.reduce((sum, ex) =>
    sum + ex.sets.reduce((s, set) => {
      const r = parseFloat(set.reps);
      const w = parseFloat(set.weight);
      return s + (isNaN(r) || isNaN(w) ? 0 : r * w);
    }, 0), 0);

  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);

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
        <TouchableOpacity style={styles.datePart} onPress={() => setShowDatePicker(v => !v)}>
          <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.dateText}>
            {selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <Ionicons name={showDatePicker ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSettingsModalVisible(true)} style={styles.settingsGearBtn} activeOpacity={0.7}>
          <Ionicons name="settings-outline" size={18} color={settingsModalVisible ? colors.accent : colors.textSecondary} />
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
        <View style={styles.timerDiagramRow}>
          <TouchableOpacity style={[styles.timerCard, { flex: 1 }]} onPress={onToggleTimer} activeOpacity={0.7}>
            <Text style={styles.timerLabel}>Duration</Text>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={styles.timerMain}>
                {timerPaused
                  ? <Animated.View style={[styles.playTriangle, { opacity: pulseAnim }]} />
                  : <Text style={styles.timerValue}>{fmtElapsed(elapsed)}</Text>
                }
              </View>
              <TouchableOpacity onPress={onResetTimer} style={styles.timerResetBtn} hitSlop={8}>
                <Ionicons name="refresh-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.timerResetText}>Reset</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.diagramThumb, { flex: 1 }]}
            onPress={() => setDiagramModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.diagramThumbLabel}>Muscles</Text>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', marginTop: -8 }}>
              <MuscleDiagram muscles={activeMuscles} scale={0.18} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={diagramModalVisible} transparent animationType="slide" onRequestClose={() => setDiagramModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDiagramModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Muscles Targeted</Text>
            {activeMuscles.length > 0 ? (
              <>
                <MuscleDiagram muscles={activeMuscles} />
                <Text style={styles.modalMuscleList}>{activeMuscles.join(' · ')}</Text>
              </>
            ) : (
              <Text style={styles.modalEmpty}>Add exercises to see targeted muscles</Text>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={settingsModalVisible} transparent animationType="slide" onRequestClose={() => setSettingsModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSettingsModalVisible(false)}>
          <View style={styles.settingsSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Workout Settings</Text>
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
            <View style={styles.settingsDivider} />
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
            <View style={styles.settingsDivider} />
            <View style={styles.settingsItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Track RPE</Text>
                <Text style={styles.settingsHint}>Show an RPE input column on each strength set</Text>
              </View>
              <Switch
                value={showRpe}
                onValueChange={onShowRpeChange}
                trackColor={{ false: colors.border, true: colors.save }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.settingsDivider} />
            <View style={styles.settingsItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Show plate calculator</Text>
                <Text style={styles.settingsHint}>Show a plate calculator button while logging sets</Text>
              </View>
              <Switch
                value={showPlateCalc}
                onValueChange={onShowPlateCalcChange}
                trackColor={{ false: colors.border, true: colors.save }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>


      {exercises.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{exercises.length}</Text>
            <Text style={styles.summaryLabel}>{exercises.length === 1 ? 'Exercise' : 'Exercises'}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalSets}</Text>
            <Text style={styles.summaryLabel}>{totalSets === 1 ? 'Set' : 'Sets'}</Text>
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
    fontSize: typography.fontSize.xl,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  dateText: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  settingsGearBtn: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },

  timerCard: {
    paddingHorizontal: 0,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  timerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    minHeight: 40,
  },
  timerValue: { fontSize: 32, fontWeight: '700', color: colors.textPrimary },
  timerLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  timerResetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center' },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderLeftWidth: 20,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.accentText,
  },
  timerResetText: { fontSize: typography.fontSize.xs, color: colors.textSecondary },

  settingsSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl * 2,
    gap: spacing.md,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: colors.border,
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
    fontSize: typography.fontSize.xs,
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
    fontSize: typography.fontSize.xs,
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
  summaryLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },

  timerDiagramRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    height: 80,
  },
  diagramThumb: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  diagramThumbLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl * 2,
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: colors.border,
    borderRadius: 2, alignSelf: 'center',
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalMuscleList: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  modalEmpty: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
