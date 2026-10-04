import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Routine = { id: number; name: string; day_count: number };

type Props = {
  visible: boolean;
  routines: Routine[];
  activeRoutineId?: number | null;
  onSelect: (routineId: number) => void;
  onClose: () => void;
};

export default function RoutinePickerModal({ visible, routines, activeRoutineId, onSelect, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.box}>
          <Text style={styles.title}>Select Active Routine</Text>
          <FlatList
            data={routines}
            keyExtractor={item => item.id.toString()}
            ListEmptyComponent={
              <Text style={styles.empty}>No routines yet. Create one or generate one with AI first.</Text>
            }
            renderItem={({ item }) => {
              const active = item.id === activeRoutineId;
              return (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => onSelect(item.id)}
                  accessibilityState={{ selected: active }}
                >
                  <View style={styles.itemText}>
                    <Text style={[styles.itemName, active && styles.itemNameActive]}>{item.name}</Text>
                    <Text style={styles.itemSub}>
                      {item.day_count} {item.day_count === 1 ? 'day' : 'days'}{active ? ' · Active' : ''}
                    </Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={20} color={colors.accent} />}
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  box: { backgroundColor: colors.surface, borderTopLeftRadius: spacing.md, borderTopRightRadius: spacing.md, padding: spacing.lg, maxHeight: '60%' },
  title: { fontSize: typography.fontSize.md, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemText: { flex: 1 },
  itemName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  itemNameActive: { color: colors.accent },
  empty: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },
  itemSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  cancel: { marginTop: spacing.md, padding: spacing.md, alignItems: 'center' },
  cancelText: { fontSize: typography.fontSize.md, color: colors.danger, fontWeight: '600' },
});
