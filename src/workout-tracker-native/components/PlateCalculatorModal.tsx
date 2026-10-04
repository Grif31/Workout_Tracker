import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import {
  type BarType,
  BAR_WEIGHTS_LBS, BAR_WEIGHTS_KG,
  PLATE_CONFIG_LBS, PLATE_CONFIG_KG,
  plateCalc, enabledPlatesFor, togglePlateSetting,
} from '../utils/plateCalc';

const BAR_KEY    = 'plate_calc_bar';
const PLATES_KEY = 'plate_calc_plates';

const PLATE_WIDTH = 22;
const PLATE_GAP = 2;
// Rod minimum plus both collars, the diagram's fixed middle
const DIAGRAM_MIDDLE = 30 + 2 * 10;

const BAR_OPTIONS: { type: BarType; label: string; lbs: number; kg: number }[] = [
  { type: 'standard', label: 'Standard', lbs: 45, kg: 20 },
  { type: 'short',    label: "Women's",  lbs: 35, kg: 15 },
  { type: 'ez',       label: 'EZ Bar',   lbs: 20, kg: 10 },
  { type: 'none',     label: 'No Bar',   lbs: 0,  kg: 0  },
];

type Props = {
  visible: boolean;
  targetWeight: string;
  weightUnit: string;
  onClose: () => void;
};

export default function PlateCalculatorModal({ visible, targetWeight, weightUnit, onClose }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const barKey    = `${BAR_KEY}_${user?.id}`;
  const platesKey = `${PLATES_KEY}_${user?.id}`;

  const isKg = weightUnit === 'kg';
  const plateConfigs = isKg ? PLATE_CONFIG_KG : PLATE_CONFIG_LBS;
  const barWeights   = isKg ? BAR_WEIGHTS_KG  : BAR_WEIGHTS_LBS;
  const unit = isKg ? 'kg' : 'lbs';

  const [barType, setBarType]   = useState<BarType>('standard');
  // The stored plate setting as-is: it holds both units' lists
  const [platesRaw, setPlatesRaw] = useState<string | null>(null);
  const enabledPlates = useMemo(() => enabledPlatesFor(platesRaw, unit), [platesRaw, unit]);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.multiGet([barKey, platesKey]).then(pairs => {
      const barVal = pairs[0][1];
      if (barVal) setBarType(barVal as BarType);
      setPlatesRaw(pairs[1][1]);
    });
  }, [visible]);

  const changeBarType = useCallback((t: BarType) => {
    setBarType(t);
    AsyncStorage.setItem(barKey, t);
  }, [barKey]);

  const togglePlate = useCallback((weight: number) => {
    setPlatesRaw(prev => {
      const next = togglePlateSetting(prev, unit, weight);
      AsyncStorage.setItem(platesKey, next);
      return next;
    });
  }, [platesKey, unit]);

  const targetNum = parseFloat(targetWeight) || 0;
  const barWeight = barWeights[barType];

  const result = useMemo(
    () => plateCalc(targetNum, barWeight, enabledPlates),
    [targetNum, barWeight, enabledPlates],
  );

  // Build expanded plate lists for the diagram
  const configMap = useMemo(
    () => new Map(plateConfigs.map(p => [p.weight, p])),
    [plateConfigs],
  );
  const expandedOneSide = result.plates.flatMap(({ plate, count }) =>
    Array(count).fill(plate)
  );
  const leftPlates  = [...expandedOneSide].reverse(); // outer → inner (toward bar)
  const rightPlates = [...expandedOneSide];           // inner (near bar) → outer
  // Narrow the plates when a heavy load wouldn't fit across the sheet
  const sideSpace = (windowWidth - 2 * spacing.md - 2 * spacing.sm - DIAGRAM_MIDDLE) / 2;
  const plateWidth = Math.max(
    8,
    Math.min(PLATE_WIDTH, Math.floor(sideSpace / Math.max(1, expandedOneSide.length)) - PLATE_GAP),
  );
  const fmt = (n: number) => String(Math.round(n * 100) / 100);

  const summaryText = (): string => {
    if (targetNum <= 0) return 'Enter a weight to calculate';
    if (targetNum < barWeight) return `Weight is below bar weight (${barWeight} ${weightUnit})`;
    if (expandedOneSide.length === 0 && result.remainder === 0) return 'Just the bar';
    if (expandedOneSide.length === 0) return 'Your plates are too heavy for this weight';
    const parts = result.plates.map(({ plate, count }) =>
      `${count} × ${plate}`
    );
    return parts.join('  ·  ') + ' per side';
  };
  // What the bar actually weighs when the target can't be made exactly
  const closest = targetNum >= barWeight && result.remainder > 0
    ? targetNum - 2 * result.remainder
    : null;

  const renderPlate = (weight: number, idx: number) => {
    const cfg = configMap.get(weight);
    const h = cfg?.height ?? 40;
    const bg = cfg?.color ?? colors.textSecondary;
    return (
      <View key={idx} style={[styles.plate, { height: h, width: plateWidth, backgroundColor: bg }]}>
        {plateWidth >= 14 && <Text style={styles.plateLabel}>{weight}</Text>}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Plate Calculator</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Target weight */}
        <Text style={[styles.targetWeight, { color: colors.textPrimary }]}>
          {targetNum > 0 ? `${targetNum} ${weightUnit}` : '—'}
        </Text>

        {/* Bar selector */}
        <View style={styles.barRow}>
          {BAR_OPTIONS.map(opt => {
            const w = isKg ? opt.kg : opt.lbs;
            const active = barType === opt.type;
            return (
              <TouchableOpacity
                key={opt.type}
                style={[
                  styles.barChip,
                  { borderColor: active ? colors.accent : colors.border,
                    backgroundColor: active ? colors.accent + '22' : colors.background },
                ]}
                onPress={() => changeBarType(opt.type)}
              >
                <Text style={[styles.barChipName, { color: active ? colors.accent : colors.textPrimary }]}>
                  {opt.label}
                </Text>
                {w > 0 && (
                  <Text style={[styles.barChipWeight, { color: active ? colors.accent : colors.textSecondary }]}>
                    {w} {weightUnit}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Bar diagram */}
        <View style={styles.diagram}>
          {/* Left plates (outer → inner) */}
          <View style={styles.plateSide}>
            {leftPlates.map((w, i) => renderPlate(w, i))}
          </View>

          {/* Left collar */}
          {expandedOneSide.length > 0 && (
            <View style={[styles.collar, { backgroundColor: colors.textSecondary }]} />
          )}

          {/* Bar rod */}
          <View style={[styles.barRod, { backgroundColor: colors.textSecondary + '80' }]} />

          {/* Right collar */}
          {expandedOneSide.length > 0 && (
            <View style={[styles.collar, { backgroundColor: colors.textSecondary }]} />
          )}

          {/* Right plates (inner → outer) */}
          <View style={styles.plateSide}>
            {rightPlates.map((w, i) => renderPlate(w, i))}
          </View>
        </View>

        {/* Summary text */}
        <Text style={[styles.summary, { color: colors.textSecondary }, closest != null && styles.summaryTight]}>
          {summaryText()}
        </Text>
        {closest != null && (
          <Text style={[styles.summary, { color: colors.danger }]}>
            {`Can't make ${fmt(targetNum)} ${weightUnit} exactly. Closest: ${fmt(closest)} ${weightUnit}`}
          </Text>
        )}

        {/* Available plates */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Your Plates</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.platesRow}>
          {plateConfigs.map(cfg => {
            const on = enabledPlates.includes(cfg.weight);
            return (
              <TouchableOpacity
                key={cfg.weight}
                style={[
                  styles.plateChip,
                  {
                    backgroundColor: on ? cfg.color + '22' : colors.background,
                    borderColor: on ? cfg.color : colors.border,
                  },
                ]}
                onPress={() => togglePlate(cfg.weight)}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${cfg.weight} ${weightUnit} plates`}
              >
                <View style={[styles.plateChipDot, { backgroundColor: cfg.color }]} />
                <Text style={[styles.plateChipText, { color: on ? colors.textPrimary : colors.textSecondary }]}>
                  {cfg.weight} {weightUnit}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: typography.fontSize.md,
    fontWeight: '700',
  },
  targetWeight: {
    fontSize: typography.fontSize.xxl,
    fontWeight: '800',
    textAlign: 'center',
    marginVertical: spacing.sm,
  },

  // Bar selector
  barRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  barChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: spacing.xs,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  barChipName: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
  },
  barChipWeight: {
    fontSize: 10,
    marginTop: 1,
  },

  // Diagram
  diagram: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  plateSide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plate: {
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: PLATE_GAP / 2,
    overflow: 'hidden',
  },
  // White reads on every plate colour; the accent text colour flips with the theme
  plateLabel: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    transform: [{ rotate: '90deg' }],
  },
  collar: {
    width: 8,
    height: 22,
    borderRadius: 2,
    marginHorizontal: 1,
  },
  barRod: {
    flex: 1,
    height: 12,
    minWidth: 30,
    borderRadius: 2,
  },

  // Summary
  summary: {
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
    fontWeight: '500',
  },
  summaryTight: { marginBottom: spacing.xs },

  // Plate chips
  sectionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  platesRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  plateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  plateChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  plateChipText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
});
