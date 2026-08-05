import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Routine = { id: number; name: string; day_count: number };

type Props = {
  visible: boolean;
  routines: Routine[];
  onSelect: (routineId: number) => void;
  onClose: () => void;
};

export default function RoutinePickerModal({ visible, routines, onSelect, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.box}>
          <Text style={styles.title}>Select Active Routine</Text>
          <FlatList
            data={routines}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.item} onPress={() => onSelect(item.id)}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemSub}>{item.day_count} {item.day_count === 1 ? 'day' : 'days'}</Text>
              </TouchableOpacity>
            )}
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
  item: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  itemSub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  cancel: { marginTop: spacing.md, padding: spacing.md, alignItems: 'center' },
  cancelText: { fontSize: typography.fontSize.md, color: colors.danger, fontWeight: '600' },
});
