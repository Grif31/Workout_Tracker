import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { type WorkoutSet, colStyles } from './types';
import SwipeToDelete from './SwipeToDelete';

type Props = {
  set: WorkoutSet;
  setIndex: number;
  onChangeField: (field: string, value: string) => void;
  onToggleDone: () => void;
  onDelete: () => void;
};

function CardioSetRow({ set, setIndex, onChangeField, onToggleDone, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isDone = set.done ?? false;

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
    // Rounded, not toFixed: a 4:00 bout reads "4", not "4.00"
    onChangeField('cardio_duration', String(Math.round((elapsedSecs / 60) * 100) / 100));
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const unit = set.distance_unit || 'mi';

  return (
    <SwipeToDelete onDelete={onDelete} deleteLabel={`Delete bout ${setIndex + 1}`}>
      <View style={[styles.cardioSetBlock, isDone && styles.cardioSetBlockDone]}>
        <View style={[styles.setBadge, colStyles.setType]}>
          <Text style={styles.setBadgeNum}>{setIndex + 1}</Text>
        </View>
        <View style={styles.cardioFields}>
          <View style={styles.cardioRow}>
            <TextInput
              style={[styles.setInput, styles.flexInput, isDone && styles.setInputDone]}
              placeholder="min"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              accessibilityLabel={`Bout ${setIndex + 1} duration, minutes`}
              value={running ? fmtWatch(elapsedSecs) : (set.cardio_duration || '')}
              onChangeText={val => !running && onChangeField('cardio_duration', val)}
              editable={!running && !isDone}
            />
            <TouchableOpacity
              style={[styles.cardioTimerBtn, { borderColor: running ? colors.danger : colors.save }, isDone && styles.setInputDone]}
              onPress={running ? stopWatch : startWatch}
              disabled={isDone}
              accessibilityRole="button"
              accessibilityLabel={running ? 'Stop stopwatch' : 'Start stopwatch'}
            >
              <Ionicons
                name={running ? 'stop' : 'play'}
                size={14}
                color={running ? colors.danger : colors.save}
              />
              <Text style={[styles.cardioTimerText, { color: running ? colors.danger : colors.save }]}>
                {running ? fmtWatch(elapsedSecs) : 'Start'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardioRow}>
            <TextInput
              style={[styles.setInput, styles.flexInput, isDone && styles.setInputDone]}
              placeholder="dist"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              accessibilityLabel={`Bout ${setIndex + 1} distance`}
              editable={!isDone}
              value={set.distance || ''}
              onChangeText={val => onChangeField('distance', val)}
            />
            <View style={[styles.cardioUnitToggle, isDone && styles.setInputDone]}>
              {['km', 'mi'].map(u => (
                <TouchableOpacity
                  key={u}
                  style={[styles.cardioUnitBtn, unit === u && { backgroundColor: colors.accent }]}
                  onPress={() => onChangeField('distance_unit', u)}
                  disabled={isDone}
                  accessibilityRole="button"
                  accessibilityLabel={u === 'km' ? 'Kilometers' : 'Miles'}
                  accessibilityState={{ selected: unit === u }}
                >
                  <Text style={[styles.cardioUnitText, { color: unit === u ? colors.accentText : colors.textSecondary }]}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.setInput, styles.paceInput, isDone && styles.setInputDone]}
              placeholder="pace"
              placeholderTextColor={colors.placeholder}
              keyboardType="decimal-pad"
              accessibilityLabel={`Bout ${setIndex + 1} pace`}
              editable={!isDone}
              value={set.intensity || ''}
              onChangeText={val => onChangeField('intensity', val)}
            />
          </View>
        </View>
        <TouchableOpacity
          style={[styles.checkBtn, colStyles.check]}
          onPress={onToggleDone}
          // Checking off mid-stopwatch would log the bout before its time is written
          disabled={running}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isDone, disabled: running }}
          accessibilityLabel={`Bout ${setIndex + 1} done`}
        >
          <Ionicons
            name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
            size={30}
            color={isDone ? colors.save : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
    </SwipeToDelete>
  );
}

export default React.memo(CardioSetRow);

// The stopwatch spans the unit toggle and pace box below it, so the duration
// and distance inputs line up in one column.
const UNIT_TOGGLE_WIDTH = 72;
const PACE_WIDTH = 64;
const FIELD_GAP = 6;

const createStyles = (colors: Colors) => StyleSheet.create({
  // Same bordered badge as a strength set's number, minus the set-type colour:
  // cardio bouts have no set types.
  setBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setBadgeNum: { fontSize: 12, fontWeight: '700', lineHeight: 14, color: colors.textSecondary },

  setInput: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
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
  flexInput: { flex: 1 },
  paceInput: { width: PACE_WIDTH },

  // Bottom margin must stay spacing.sm, the height SwipeToDelete's action expects
  cardioSetBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  cardioSetBlockDone: { backgroundColor: colors.save + '14', borderRadius: spacing.xs },
  setInputDone: { opacity: 0.5 },
  cardioFields: { flex: 1, gap: FIELD_GAP, marginLeft: spacing.xs },
  // Centred on both lines of fields, in the same column as a strength set's check
  checkBtn: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  cardioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FIELD_GAP,
  },
  cardioTimerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: spacing.xs,
    width: UNIT_TOGGLE_WIDTH + FIELD_GAP + PACE_WIDTH,
    height: 44,
  },
  cardioTimerText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  cardioUnitToggle: {
    flexDirection: 'row',
    width: UNIT_TOGGLE_WIDTH,
    height: 44,
    borderRadius: spacing.xs,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  cardioUnitBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  cardioUnitText: { fontSize: typography.fontSize.xs, fontWeight: '700' },
});
