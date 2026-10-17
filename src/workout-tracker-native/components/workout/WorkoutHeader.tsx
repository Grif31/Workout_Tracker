import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Modal, Animated, ScrollView,
} from 'react-native';
import ThemedSwitch from '../ThemedSwitch';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { fmtElapsed } from './types';
import MuscleDiagram from '../MuscleDiagram';
import MuscleSetBreakdown from '../MuscleSetBreakdown';
import { muscleShading, type MuscleSetCount } from '../../utils/muscleSetCounts';

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
  repeatLastSet: boolean;
  onRepeatLastSetChange: (val: boolean) => void;
  prefillPreviousSets: boolean;
  onPrefillPreviousSetsChange: (val: boolean) => void;
  onReorderPress: () => void;
  exerciseCount: number;
  totalSets: number;
  totalVolume: number;
  weightUnit: string;
  muscleCounts: MuscleSetCount[];
};

function WorkoutHeader({
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
  repeatLastSet,
  onRepeatLastSetChange,
  prefillPreviousSets,
  onPrefillPreviousSetsChange,
  onReorderPress,
  exerciseCount,
  totalSets,
  totalVolume,
  weightUnit,
  muscleCounts,
}: Props) {
  const { colors, mode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const thumbShading = useMemo(() => muscleShading(muscleCounts, colors.accent), [muscleCounts, colors.accent]);
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
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', marginTop: -spacing.sm }}>
              <MuscleDiagram muscles={thumbShading.muscles} muscleColors={thumbShading.muscleColors} scale={0.18} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={diagramModalVisible} transparent animationType="slide" onRequestClose={() => setDiagramModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDiagramModalVisible(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Muscles Targeted</Text>
            {muscleCounts.length > 0 ? (
              <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
                <MuscleSetBreakdown counts={muscleCounts} />
              </ScrollView>
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
              <ThemedSwitch
                value={autoStartRest}
                onValueChange={onAutoStartRestChange}
              />
            </View>
            <View style={styles.settingsDivider} />
            <View style={styles.settingsItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Vibrate when rest ends</Text>
                <Text style={styles.settingsHint}>Vibrate the phone when the rest countdown completes</Text>
              </View>
              <ThemedSwitch
                value={vibrateOnComplete}
                onValueChange={onVibrateChange}
              />
            </View>
            <View style={styles.settingsDivider} />
            <View style={styles.settingsItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Track RPE</Text>
                <Text style={styles.settingsHint}>Show an RPE input column on each strength set</Text>
              </View>
              <ThemedSwitch
                value={showRpe}
                onValueChange={onShowRpeChange}
              />
            </View>
            <View style={styles.settingsDivider} />
            <View style={styles.settingsItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Show plate calculator</Text>
                <Text style={styles.settingsHint}>Show a plate calculator button while logging sets</Text>
              </View>
              <ThemedSwitch
                value={showPlateCalc}
                onValueChange={onShowPlateCalcChange}
              />
            </View>
            <View style={styles.settingsDivider} />
            <View style={styles.settingsItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Repeat last set</Text>
                <Text style={styles.settingsHint}>Automatically repeat the last set when adding new sets</Text>
              </View>
              <ThemedSwitch
                value={repeatLastSet}
                onValueChange={onRepeatLastSetChange}
              />
            </View>
            <View style={styles.settingsDivider} />
            <View style={styles.settingsItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Prefill previous sets</Text>
                <Text style={styles.settingsHint}>Pre-fill a new exercise's sets with your last session's reps and weight</Text>
              </View>
              <ThemedSwitch
                value={prefillPreviousSets}
                onValueChange={onPrefillPreviousSetsChange}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>


      {exerciseCount > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{exerciseCount}</Text>
            <Text style={styles.summaryLabel}>{exerciseCount === 1 ? 'Exercise' : 'Exercises'}</Text>
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

      {exerciseCount > 0 && (
        <View style={styles.exercisesSectionRow}>
          <Text style={styles.sectionLabel}>Exercises</Text>
          {exerciseCount > 1 && (
            <TouchableOpacity onPress={onReorderPress} style={styles.reorderBtn} hitSlop={8}>
              <Ionicons name="reorder-three-outline" size={16} color={colors.accent} />
              <Text style={[styles.reorderBtnText, { color: colors.accent }]}>Reorder</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default React.memo(WorkoutHeader);

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
  timerResetBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'center' },
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

  exercisesSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reorderBtnText: { fontSize: typography.fontSize.sm, fontWeight: '600' },

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
    maxHeight: '85%',
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
  modalScroll: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  modalScrollContent: { paddingBottom: spacing.sm },
  modalEmpty: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
