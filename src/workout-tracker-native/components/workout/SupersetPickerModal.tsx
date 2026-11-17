import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import type { ExerciseEntry } from './types';
import { canJoinSuperset } from '../../utils/supersets';

type Props = {
  /** Index of the exercise being paired; null keeps the sheet closed */
  anchorIdx: number | null;
  exercises: ExerciseEntry[];
  onPick: (partnerIdx: number) => void;
  onClose: () => void;
};

/** The other exercises an exercise can be supersetted with. Cardio and the anchor's own superset are left out. */
export default function SupersetPickerModal({ anchorIdx, exercises, onPick, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const anchor = anchorIdx !== null ? exercises[anchorIdx] : undefined;

  const candidates = useMemo(() => {
    if (!anchor) return [];
    return exercises
      .map((ex, idx) => ({ ex, idx }))
      .filter(({ ex, idx }) =>
        idx !== anchorIdx && canJoinSuperset(ex)
        && (anchor.superset_group == null || ex.superset_group !== anchor.superset_group));
  }, [anchor, anchorIdx, exercises]);

  const adding = anchor?.superset_group != null;

  return (
    <Modal visible={!!anchor} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {adding ? 'Add to superset' : `Superset ${anchor?.name ?? ''} with`}
              </Text>
              <Text style={styles.sub}>You'll alternate sets between them and rest after each round.</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close superset list">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={candidates}
            keyExtractor={c => c.ex.uid}
            style={{ maxHeight: 360 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => onPick(item.idx)}
                accessibilityRole="button"
                accessibilityLabel={`Superset with ${item.ex.name}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.ex.name}</Text>
                  {!!(item.ex.muscle_group || item.ex.equipment) && (
                    <Text style={styles.detail}>{[item.ex.muscle_group, item.ex.equipment].filter(Boolean).join(' · ')}</Text>
                  )}
                </View>
                <Ionicons name="link" size={18} color={colors.accent} />
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  sub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  name: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  detail: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 1 },
});
