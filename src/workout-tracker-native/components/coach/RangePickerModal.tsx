import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export type ChartRange = '30d' | '3m' | '6m' | '1y';

export const CHART_RANGES: readonly ChartRange[] = ['30d', '3m', '6m', '1y'];

const RANGE_LABELS: Record<ChartRange, string> = {
  '30d': 'Last 30 Days',
  '3m': 'Last 3 Months',
  '6m': 'Last 6 Months',
  '1y': 'Last Year',
};

/** Where the button that opened the menu sits, from measureInWindow. */
export type MenuAnchor = { x: number; y: number; width: number; height: number };

// Gap between the button and the menu, and the margin kept from the screen edge.
const ANCHOR_GAP = 4;
const EDGE_MARGIN = 16;

type Props = {
  visible: boolean;
  chartRange: ChartRange;
  anchor: MenuAnchor | null;
  onSelect: (range: ChartRange) => void;
  onClose: () => void;
};

export default function RangePickerModal({ visible, chartRange, anchor, onSelect, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [menuHeight, setMenuHeight] = useState(0);

  // Opens just under the button, right edges aligned. Flips above it when the
  // chart sits low enough that the menu would run off the bottom of the screen.
  let position = null;
  if (anchor) {
    const below = anchor.y + anchor.height + ANCHOR_GAP;
    const fitsBelow = below + menuHeight <= windowHeight - EDGE_MARGIN;
    position = {
      top: fitsBelow ? below : Math.max(EDGE_MARGIN, anchor.y - ANCHOR_GAP - menuHeight),
      right: Math.max(EDGE_MARGIN, windowWidth - (anchor.x + anchor.width)),
    };
  }

  return (
    // statusBarTranslucent puts the modal in the same full-window coordinate
    // space measureInWindow reports in; without it Android lays the modal out
    // below the status bar and the menu lands one status bar too low.
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View
          testID="range-menu"
          // Hidden until both the button's position and the menu's own height
          // are known (a frame), so it never flashes in the wrong spot first.
          style={[styles.box, position, (!position || menuHeight === 0) && styles.measuring]}
          onLayout={e => setMenuHeight(e.nativeEvent.layout.height)}
        >
          {CHART_RANGES.map(r => (
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  box: { position: 'absolute', backgroundColor: colors.surface, borderRadius: spacing.sm, borderWidth: 1, borderColor: colors.border, minWidth: 160, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 8 },
  measuring: { opacity: 0 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12 },
  itemActive: { backgroundColor: colors.accent + '18' },
  itemText: { fontSize: typography.fontSize.sm, color: colors.textPrimary },
  itemTextActive: { color: colors.accent, fontWeight: '600' },
});
