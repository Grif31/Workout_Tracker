import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/api';
import { COACH_PROFILE_KEY } from '../coach/CoachProfileModal';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export type SwapCandidate = {
  id: number;
  name: string;
  muscle_group?: string;
  equipment?: string;
  image_url?: string;
  exercise_type?: string;
  bodyweight_load_factor?: number | null;
  same_movement?: boolean;
};

type Props = {
  /** The exercise being swapped; null keeps the sheet closed */
  exercise: { name: string; exercise_template_id?: number } | null;
  onPick: (candidate: SwapCandidate) => void;
  onClose: () => void;
};

/** Alternatives to an exercise: same primary muscle on other equipment, minus whatever loads an injury in the coach profile. */
export default function SwapExerciseModal({ exercise, onPick, onClose }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [alternatives, setAlternatives] = useState<SwapCandidate[] | null>(null);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const templateId = exercise?.exercise_template_id;

  useEffect(() => {
    if (!exercise || !templateId) return;
    let cancelled = false;
    setAlternatives(null);
    setFailed(false);
    (async () => {
      try {
        // The coach profile lives on the device only, so the injuries ride along on the request
        let flagged: string[] = [];
        try {
          const raw = await AsyncStorage.getItem(`${COACH_PROFILE_KEY}_${user?.id}`);
          const parsed = raw ? JSON.parse(raw) : null;
          if (Array.isArray(parsed?.avoid)) flagged = parsed.avoid.filter((a: unknown) => typeof a === 'string' && a !== 'none');
        } catch { }
        const res = await apiFetch(`/api/exercises/${templateId}/alternatives?avoid=${encodeURIComponent(flagged.join(','))}`);
        if (!res.ok) throw new Error('bad status');
        const data = await res.json();
        if (cancelled) return;
        setAvoid(flagged);
        setAlternatives(data.alternatives ?? []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [exercise, templateId, user?.id]);

  return (
    <Modal visible={!!exercise} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>Swap {exercise?.name}</Text>
              <Text style={styles.sub}>
                {avoid.length > 0 ? 'Same muscle, other equipment, skipping what loads your flagged injuries.' : 'Same muscle, other equipment.'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close swap list">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {failed ? (
            <Text style={styles.empty}>Couldn't load alternatives. Check your connection and try again.</Text>
          ) : alternatives === null ? (
            <ActivityIndicator style={{ marginVertical: spacing.xl }} color={colors.accent} />
          ) : alternatives.length === 0 ? (
            <Text style={styles.empty}>
              {avoid.length > 0 ? 'Nothing else fits your flagged injuries for this muscle.' : 'No other equipment options for this muscle.'}
            </Text>
          ) : (
            <FlatList
              data={alternatives}
              keyExtractor={a => String(a.id)}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => onPick(item)} accessibilityRole="button" accessibilityLabel={`Swap to ${item.name}, ${item.equipment ?? 'no equipment'}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.detail}>{[item.equipment, item.same_movement ? 'Same movement' : null].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Ionicons name="swap-horizontal" size={18} color={colors.accent} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  sub: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  name: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
  detail: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 1 },
  empty: { fontSize: typography.fontSize.sm, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.xl },
});
