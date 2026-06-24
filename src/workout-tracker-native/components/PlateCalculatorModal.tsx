import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../context/ThemeContext';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import {
  type BarType,
  BAR_WEIGHTS_LBS, BAR_WEIGHTS_KG,
  PLATE_CONFIG_LBS, PLATE_CONFIG_KG,
  plateCalc,
} from '../utils/plateCalc';

const BAR_KEY    = 'plate_calc_bar';
const PLATES_KEY = 'plate_calc_plates';

const BAR_OPTIONS: { type: BarType; label: string; lbs: number; kg: number }[] = [
  { type: 'standard', label: 'Standard', lbs: 45, kg: 20 },
  { type: 'short',    label: 'Short',    lbs: 35, kg: 15 },
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isKg = weightUnit === 'kg';
  const plateConfigs = isKg ? PLATE_CONFIG_KG : PLATE_CONFIG_LBS;
  const barWeights   = isKg ? BAR_WEIGHTS_KG  : BAR_WEIGHTS_LBS;
  const defaultPlates = plateConfigs.map(p => p.weight);

  const [barType, setBarType]           = useState<BarType>('standard');
  const [enabledPlates, setEnabledPlates] = useState<number[]>(defaultPlates);
  const [loaded, setLoaded]             = useState(false);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.multiGet([BAR_KEY, PLATES_KEY]).then(pairs => {
      const barVal    = pairs[0][1];
      const platesVal = pairs[1][1];
      if (barVal) setBarType(barVal as BarType);
      if (platesVal) {
        try { setEnabledPlates(JSON.parse(platesVal)); } catch {}
      }
      setLoaded(true);
    });
  }, [visible]);

  const changeBarType = useCallback((t: BarType) => {
    setBarType(t);
    AsyncStorage.setItem(BAR_KEY, t);
  }, []);

  const togglePlate = useCallback((weight: number) => {
    setEnabledPlates(prev => {
      const next = prev.includes(weight)
        ? prev.filter(w => w !== weight)
        : [...prev, weight];
      AsyncStorage.setItem(PLATES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

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

  const summaryText = (): string => {
    if (targetNum <= 0) return 'Enter a weight to calculate';
    if (targetNum < barWeight) return `Weight is below bar weight (${barWeight} ${weightUnit})`;
    if (expandedOneSide.length === 0 && result.remainder === 0) return 'Just the bar';
    const parts = result.plates.map(({ plate, count }) =>
      `${count} × ${plate}`
    );
    let text = parts.join('  ·  ') + ' per side';
    if (result.remainder > 0) text += `  ⚠ +${result.remainder} ${weightUnit} unloaded`;
    return text;
  };

  const renderPlate = (weight: number, idx: number) => {
    const cfg = configMap.get(weight);
    const h = cfg?.height ?? 40;
    const bg = cfg?.color ?? colors.textSecondary;
    return (
      <View key={idx} style={[styles.plate, { height: h, backgroundColor: bg }]}>
        <Text style={styles.plateLabel}>{weight}</Text>
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
        style={StyleSheet.absoluteFillObject}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Plate Calculator</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
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
        <Text style={[styles.summary, { color: result.remainder > 0 ? colors.danger : colors.textSecondary }]}>
          {summaryText()}
        </Text>

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
    width: 22,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
    overflow: 'hidden',
  },
  plateLabel: {
    color: colors.accentText,
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
    gap: 4,
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
