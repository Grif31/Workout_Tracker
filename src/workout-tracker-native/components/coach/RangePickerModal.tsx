import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export type ChartRange = '30d' | '6m' | '1y';

const RANGE_LABELS: Record<ChartRange, string> = {
  '30d': 'Last 30 Days',
  '6m': 'Last 6 Months',
  '1y': 'Last Year',
};

type Props = {
  visible: boolean;
  chartRange: ChartRange;
  onSelect: (range: ChartRange) => void;
  onClose: () => void;
};

export default function RangePickerModal({ visible, chartRange, onSelect, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.box}>
          {(['30d', '6m', '1y'] as ChartRange[]).map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.item, chartRange === r && styles.itemActive]}
              onPress={() => { onSelect(r); onClose(); }}
            >
              <Text style={[styles.itemText, chartRange === r && styles.itemTextActive]}>
                {RANGE_LABELS[r]}
              </Text>
              {chartRange === r && <Ionicons name="checkmark" size={16} color={colors.accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  box: { position: 'absolute', top: 120, right: 16, backgroundColor: colors.surface, borderRadius: spacing.sm, borderWidth: 1, borderColor: colors.border, minWidth: 160, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12 },
  itemActive: { backgroundColor: colors.accent + '18' },
  itemText: { fontSize: typography.fontSize.sm, color: colors.textPrimary },
  itemTextActive: { color: colors.accent, fontWeight: '600' },
});
