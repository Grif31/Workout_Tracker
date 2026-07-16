import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Modal, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { equipmentTypes } from '../constants/equipmentTypes';

export type NewExerciseType = 'strength' | 'duration';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, muscle: string, equipment: string, exerciseType: NewExerciseType) => void;
  muscleGroups: string[];
};

const LOGGING_TYPES: { value: NewExerciseType; label: string; hint: string }[] = [
  { value: 'strength', label: 'Reps & Weight', hint: 'e.g. Bench Press' },
  { value: 'duration', label: 'Timed Hold', hint: 'e.g. Plank' },
];

export default function NewExerciseForm({ visible, onClose, onSave, muscleGroups }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [equipment, setEquipment] = useState('');
  const [exerciseType, setExerciseType] = useState<NewExerciseType>('strength');

  const toggle = (group: string) => {
    setSelected(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  };

  const canSave = name.trim().length > 0 && selected.length > 0 && equipment.length > 0;

  const reset = () => {
    setName('');
    setSelected([]);
    setEquipment('');
    setExerciseType('strength');
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave(name.trim(), selected.join(', '), equipment, exerciseType);
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.topbar}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>New Exercise</Text>
            <TouchableOpacity onPress={handleSave} disabled={!canSave}>
              <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Save</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Exercise name"
            placeholderTextColor={colors.placeholder}
            value={name}
            onChangeText={setName}
            autoFocus
          />

          <Text style={styles.sectionTitle}>Logging</Text>
          <View style={styles.equipmentGrid}>
            {LOGGING_TYPES.map(t => {
              const active = exerciseType === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.equipmentChip, active && { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}
                  onPress={() => setExerciseType(t.value)}
                >
                  <Text style={[styles.equipmentChipText, active && { color: colors.accent, fontWeight: '700' }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Equipment</Text>
          <View style={styles.equipmentGrid}>
            {equipmentTypes.map(eq => {
              const active = equipment === eq;
              return (
                <TouchableOpacity
                  key={eq}
                  style={[styles.equipmentChip, active && { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}
                  onPress={() => setEquipment(active ? '' : eq)}
                >
                  <Text style={[styles.equipmentChipText, active && { color: colors.accent, fontWeight: '700' }]}>
                    {eq}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>
            Muscle Groups
            {selected.length > 0 && (
              <Text style={styles.selectedCount}> · {selected.length} selected</Text>
            )}
          </Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {muscleGroups.map(group => {
              const active = selected.includes(group);
              return (
                <TouchableOpacity
                  key={group}
                  style={[styles.muscleItem, active && { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}
                  onPress={() => toggle(group)}
                >
                  <Text style={[styles.muscleText, active && { color: colors.accent, fontWeight: '700' }]}>
                    {group}
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '88%',
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
  },
  topbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    minWidth: 52,
  },
  saveText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: typography.fontSize.md,
    minWidth: 52,
    textAlign: 'right',
  },
  saveTextDisabled: {
    opacity: 0.35,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: spacing.sm,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontSize: typography.fontSize.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  selectedCount: {
    color: colors.accent,
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: 0,
  },
  equipmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  equipmentChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  equipmentChipText: {
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
  },
  list: {
    flexGrow: 0,
  },
  muscleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  muscleText: {
    fontSize: typography.fontSize.md,
    color: colors.textPrimary,
  },
});
