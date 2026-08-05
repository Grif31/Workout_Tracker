import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';

// Generic muscle-selection bottom sheet — reused for both blank-template
// creation and AI-generate flows, which differ only in copy, muscle list,
// and submit behavior.
type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  muscles: string[];
  selected: string[];
  onToggle: (muscle: string) => void;
  buttonLabel: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
};

export default function MusclePickerModal({
  visible, onClose, title, subtitle, muscles, selected, onToggle, buttonLabel, onSubmit, submitDisabled,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.chips}>
            {muscles.map(mg => {
              const on = selected.includes(mg);
              return (
                <TouchableOpacity
                  key={mg}
                  style={[styles.chip, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent + '22' : colors.background }]}
                  onPress={() => onToggle(mg)}
                >
                  <Text style={[styles.chipText, { color: on ? colors.accent : colors.textSecondary }]}>{mg}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.save, opacity: submitDisabled ? 0.6 : 1 }]}
            onPress={onSubmit}
            disabled={submitDisabled}
          >
            <Text style={styles.submitBtnText}>{buttonLabel}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md, backgroundColor: colors.border },
  title: { fontSize: typography.fontSize.lg, fontWeight: '700', marginBottom: spacing.xs, color: colors.textPrimary },
  subtitle: { fontSize: typography.fontSize.sm, marginBottom: spacing.md, lineHeight: 20, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1 },
  chipText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  submitBtn: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  submitBtnText: { color: colors.accentText, fontWeight: '700', fontSize: typography.fontSize.md },
});
