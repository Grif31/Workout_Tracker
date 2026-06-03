import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type WorkoutSet } from './types';

type Props = {
  set: WorkoutSet;
  setIndex: number;
  onChangeField: (field: string, value: string) => void;
  onDelete: () => void;
};

export default function CardioSetRow({ set, setIndex, onChangeField, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [running, setRunning] = useState(false);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);

  const fmtWatch = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startWatch = () => {
    startRef.current = Date.now() - elapsedSecs * 1000;
    timerRef.current = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    setRunning(true);
  };

  const stopWatch = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
    onChangeField('cardio_duration', (elapsedSecs / 60).toFixed(2));
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return (
    <Swipeable renderRightActions={() => (
      <TouchableOpacity style={styles.swipeDelete} onPress={onDelete}>
        <Text style={styles.swipeDeleteText}>Delete</Text>
      </TouchableOpacity>
    )}>
      <View style={styles.cardioSetBlock}>
        <Text style={[styles.setTypeBadgeNum, { color: colors.textSecondary, width: 20, textAlign: 'center' }]}>
          {setIndex + 1}
        </Text>
        <View style={{ flex: 1, gap: 6 }}>
          {/* Row 1: Duration + stopwatch */}
          <View style={styles.cardioRow}>
            <TextInput
              style={[styles.setInput, { flex: 1 }]}
              placeholder="min"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={running ? fmtWatch(elapsedSecs) : (set.cardio_duration || '')}
              onChangeText={val => !running && onChangeField('cardio_duration', val)}
              editable={!running}
            />
            <TouchableOpacity
              style={[styles.cardioTimerBtn, { borderColor: running ? colors.danger : colors.save }]}
              onPress={running ? stopWatch : startWatch}
            >
              <Ionicons
                name={running ? 'stop' : 'play'}
                size={14}
                color={running ? colors.danger : colors.save}
              />
              <Text style={{ fontSize: 12, fontWeight: '600', color: running ? colors.danger : colors.save }}>
                {running ? fmtWatch(elapsedSecs) : 'Start'}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Row 2: Distance + unit toggle + pace */}
          <View style={styles.cardioRow}>
            <TextInput
              style={[styles.setInput, { flex: 1 }]}
              placeholder="dist"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={set.distance || ''}
              onChangeText={val => onChangeField('distance', val)}
            />
            <View style={styles.cardioUnitToggle}>
              {['km', 'mi'].map(u => (
                <TouchableOpacity
                  key={u}
                  style={[styles.cardioUnitBtn, (set.distance_unit || 'km') === u && { backgroundColor: colors.accent }]}
                  onPress={() => onChangeField('distance_unit', u)}
                >
                  <Text style={{ fontSize: typography.fontSize.xs, fontWeight: '700', color: (set.distance_unit || 'km') === u ? '#fff' : colors.textSecondary }}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.setInput, { width: 64 }]}
              placeholder="pace"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              value={set.intensity || ''}
              onChangeText={val => onChangeField('intensity', val)}
            />
          </View>
        </View>
      </View>
    </Swipeable>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  setTypeBadgeNum: { fontSize: 12, fontWeight: '700', lineHeight: 14 },

  setInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    textAlign: 'center',
    fontSize: typography.fontSize.md,
    fontWeight: '600',
    color: colors.textPrimary,
    backgroundColor: colors.background,
    height: 44,
  },

  swipeDelete: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
  },
  swipeDeleteText: { color: '#fff', fontWeight: '700' },

  cardioSetBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  cardioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardioTimerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 44,
  },
  cardioUnitToggle: {
    flexDirection: 'row',
    borderRadius: spacing.xs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardioUnitBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
});
