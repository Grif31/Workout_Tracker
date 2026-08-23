import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Dimensions, StyleSheet } from 'react-native';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type MuscleStandard = { mev: number; mav: number; mrv: number };

type Props = {
  visible: boolean;
  onClose: () => void;
  muscleStandards: Record<string, MuscleStandard>;
};

export default function WorkingSetsInfoModal({ visible, onClose, muscleStandards }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.modalBox, { maxHeight: Dimensions.get('window').height * 0.8, overflow: 'hidden' }]}>
          <Text style={styles.modalTitle}>Working Sets & Volume Zones</Text>
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.body}>
              A "working set" is a set taken close to failure; warmups don't count. Your weekly working sets per muscle are compared against three volume landmarks from exercise science:
            </Text>
            <Text style={styles.body}>
              <Text style={styles.bold}>MEV</Text> (Minimum Effective Volume): the least volume that still grows the muscle.{'\n'}
              <Text style={styles.bold}>MAV</Text> (Maximum Adaptive Volume): the sweet spot for the most growth per set.{'\n'}
              <Text style={styles.bold}>MRV</Text> (Maximum Recoverable Volume): the ceiling before fatigue outpaces recovery.
            </Text>

            <Text style={styles.tableTitle}>Weekly Set Guidelines</Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.tableMuscleCell, styles.tableHeaderText]}>Muscle</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText]}>MEV</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText]}>MAV</Text>
                <Text style={[styles.tableCell, styles.tableHeaderText]}>MRV</Text>
              </View>
              {Object.entries(muscleStandards).map(([muscle, std]) => (
                <View key={muscle} style={[styles.tableRow, styles.tableRowDivider]}>
                  <Text style={[styles.tableCell, styles.tableMuscleCell]}>{muscle}</Text>
                  <Text style={styles.tableCell}>{std.mev}</Text>
                  <Text style={styles.tableCell}>{std.mav}</Text>
                  <Text style={styles.tableCell}>{std.mrv}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.body, { marginBottom: spacing.md }]}>
              These are general starting points, not a personal prescription. Your real numbers shift with training experience, sleep, nutrition, stress, and genetics. A beginner may grow well below MEV; a more advanced lifter may need to push toward MRV to keep progressing.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: spacing.lg, borderTopRightRadius: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xl },
  modalTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  body: { fontSize: typography.fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },
  bold: { fontWeight: '700', color: colors.textPrimary },
  tableTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.xs },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: spacing.sm, overflow: 'hidden', marginBottom: spacing.md },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  tableRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tableCell: { flex: 1, fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  tableMuscleCell: { flex: 1.4, textAlign: 'left', color: colors.textPrimary, fontWeight: '600' },
  tableHeaderText: { fontWeight: '700', color: colors.textPrimary, fontSize: typography.fontSize.xs, textTransform: 'uppercase' },
});
