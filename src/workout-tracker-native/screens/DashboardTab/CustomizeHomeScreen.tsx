import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme, type Colors } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import DraggableList from '../../components/DraggableList';
import { DASHBOARD_CARDS, type DashboardCardId } from '../../constants/dashboardCards';
import {
  defaultLayout,
  loadDashboardLayout,
  saveDashboardLayout,
  type DashboardLayout,
} from '../../utils/dashboardLayout';
import { DashboardStackParamsList } from '../../navigation/types';

type Props = NativeStackScreenProps<DashboardStackParamsList, 'CustomizeHome'>;

const ROW_HEIGHT = 64;

export default function CustomizeHomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [layout, setLayout] = useState<DashboardLayout | null>(null);

  useFocusEffect(useCallback(() => {
    loadDashboardLayout(user?.id).then(setLayout);
  }, [user?.id]));

  // Saved on every change: the Dashboard re-reads on focus, so backing out
  // with the header arrow keeps the new layout either way.
  const persist = (next: DashboardLayout) => {
    setLayout(next);
    saveDashboardLayout(user?.id, next);
  };

  const reorder = (from: number, to: number) => {
    if (!layout) return;
    const order = [...layout.order];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    persist({ ...layout, order });
  };

  const toggle = (id: DashboardCardId) => {
    if (!layout) return;
    const hidden = layout.hidden.includes(id)
      ? layout.hidden.filter(h => h !== id)
      : [...layout.hidden, id];
    persist({ ...layout, hidden });
  };

  const cards = layout
    ? layout.order.map(id => DASHBOARD_CARDS.find(c => c.id === id)!).filter(Boolean)
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Customize Home</Text>
        <TouchableOpacity onPress={() => persist(defaultLayout())}>
          <Text style={[styles.resetText, { color: colors.accent }]}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.hint}>
          Press and hold a card to drag it into a new order. Turn one off to hide it from Home.
        </Text>

        {layout && (
          <DraggableList
            data={cards}
            keyExtractor={c => c.id}
            rowHeight={ROW_HEIGHT}
            gap={spacing.sm}
            onReorder={reorder}
            renderItem={card => {
              const isHidden = layout.hidden.includes(card.id);
              return (
                <View style={[styles.row, isHidden && styles.rowHidden]} testID={`customize-row-${card.id}`}>
                  <Ionicons name="reorder-three" size={22} color={colors.textSecondary} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{card.title}</Text>
                    <Text style={styles.rowDescription} numberOfLines={1}>{card.description}</Text>
                  </View>
                  <Switch
                    value={!isHidden}
                    onValueChange={() => toggle(card.id)}
                    trackColor={{ true: colors.accent, false: colors.border }}
                    thumbColor={colors.surface}
                  />
                </View>
              );
            }}
          />
        )}

        <Text style={styles.footnote}>
          The greeting, your streak, Log Workout and Track Activity always stay at the top.
        </Text>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.textPrimary },
    resetText: { fontSize: typography.fontSize.md, fontWeight: '600' },
    scroll: { padding: spacing.md, gap: spacing.md },
    hint: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
    row: {
      height: ROW_HEIGHT,
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surface, borderRadius: radius.md,
      borderWidth: 1, borderColor: colors.border,
    },
    rowHidden: { opacity: 0.55 },
    rowText: { flex: 1 },
    rowTitle: { fontSize: typography.fontSize.md, fontWeight: '600', color: colors.textPrimary },
    rowDescription: { fontSize: typography.fontSize.xs, color: colors.textSecondary, marginTop: 2 },
    footnote: { fontSize: typography.fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
  });
