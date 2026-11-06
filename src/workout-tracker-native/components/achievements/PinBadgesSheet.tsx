import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { MAX_PINS, type EarnedItem } from '../../utils/achievements';
import AchievementBadge from './AchievementBadge';

const BADGE = 64;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Every earned badge, in the order to list them */
  earned: EarnedItem[];
  /** What the profile shows now, so the sheet opens on it */
  current: string[];
  weightUnit: string;
  saving: boolean;
  /** Why the last save failed. Shown here: a toast would sit under the sheet */
  error?: string | null;
  onSave: (keys: string[]) => void;
};

/** Choose up to three earned badges for the profile (TODO §27 Phase 4). Tap order is display order. */
export default function PinBadgesSheet({ visible, onClose, earned, current, weightUnit, saving, error, onSave }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [picked, setPicked] = useState<string[]>(current);

  // Only on opening: `current` is a fresh array every time the screen renders
  useEffect(() => { if (visible) setPicked(current); }, [visible]);

  const toggle = (key: string) => setPicked(prev => (
    prev.includes(key) ? prev.filter(k => k !== key) : prev.length < MAX_PINS ? [...prev, key] : prev
  ));
  const full = picked.length >= MAX_PINS;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} accessibilityLabel="Close">
        <View style={styles.sheet} onStartShouldSetResponder={() => true} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">Pin to your profile</Text>
            <Text style={styles.count}>{picked.length} of {MAX_PINS}</Text>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.grid}>
            {earned.map(item => {
              const at = picked.indexOf(item.key);
              const on = at >= 0;
              const disabled = !on && full;
              return (
                <TouchableOpacity
                  key={item.key} style={[styles.cell, disabled && styles.dim]} onPress={() => toggle(item.key)}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled }}
                  accessibilityLabel={on ? `${item.title}, pinned ${at + 1} of ${MAX_PINS}` : item.title}
                >
                  <View>
                    <AchievementBadge badgeKey={item.key} threshold={item.threshold} weightUnit={weightUnit} size={BADGE} />
                    {on && (
                      <View style={[styles.order, { backgroundColor: colors.accent }]}>
                        <Text style={styles.orderText}>{at + 1}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.name} numberOfLines={2}>{item.title}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {!!error && <Text style={[styles.error, { color: colors.danger }]} accessibilityLiveRegion="polite">{error}</Text>}
          <TouchableOpacity
            style={[styles.save, { backgroundColor: colors.accent }, saving && styles.dim]}
            onPress={() => onSave(picked)} disabled={saving} accessibilityRole="button"
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '80%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xl,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md, backgroundColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.xs, marginBottom: spacing.md },
  title: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  count: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  list: { flexGrow: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, paddingBottom: spacing.md },
  cell: { width: '25%', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 2 },
  dim: { opacity: 0.4 },
  order: {
    position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  orderText: { color: colors.accentText, fontSize: typography.fontSize.xs, fontWeight: '800' },
  name: { fontSize: typography.fontSize.xs, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  error: { fontSize: typography.fontSize.sm, textAlign: 'center', marginTop: spacing.xs },
  save: { marginTop: spacing.sm, borderRadius: radius.full, paddingVertical: spacing.sm + 4, alignItems: 'center' },
  saveText: { color: colors.accentText, fontSize: typography.fontSize.md, fontWeight: '700' },
});
