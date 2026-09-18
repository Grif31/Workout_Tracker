import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DASHBOARD_CARDS,
  DEFAULT_DASHBOARD_ORDER,
  type DashboardCardId,
} from '../constants/dashboardCards';

/** Per-user, suffixed `_${uid}` like the app's other per-user keys. */
export const DASHBOARD_LAYOUT_KEY = 'dashboard_layout';

export type DashboardLayout = {
  order: DashboardCardId[];
  hidden: DashboardCardId[];
};

const VALID_IDS = new Set<string>(DASHBOARD_CARDS.map(c => c.id));

export const defaultLayout = (): DashboardLayout => ({
  order: [...DEFAULT_DASHBOARD_ORDER],
  hidden: [],
});

/**
 * A stored layout, repaired against the current card list.
 *
 * A saved order outlives releases: cards get added and removed, so ids the
 * app no longer knows are dropped, and cards added since the layout was
 * saved are slotted back at their default position (rather than appended,
 * which would push every new card to the bottom) and stay visible.
 */
export function normalizeLayout(raw: unknown): DashboardLayout {
  const stored = (raw ?? {}) as Partial<DashboardLayout>;
  const savedOrder = Array.isArray(stored.order) ? stored.order : [];
  const savedHidden = Array.isArray(stored.hidden) ? stored.hidden : [];

  const order: DashboardCardId[] = [];
  for (const id of savedOrder) {
    if (VALID_IDS.has(id) && !order.includes(id)) order.push(id);
  }
  DEFAULT_DASHBOARD_ORDER.forEach((id, defaultIdx) => {
    if (!order.includes(id)) order.splice(Math.min(defaultIdx, order.length), 0, id);
  });

  const hidden = savedHidden.filter(
    (id, i) => VALID_IDS.has(id) && savedHidden.indexOf(id) === i,
  );
  return { order, hidden };
}

/** Cards to render, in order, with hidden ones removed. */
export function visibleCards(layout: DashboardLayout): DashboardCardId[] {
  return layout.order.filter(id => !layout.hidden.includes(id));
}

export async function loadDashboardLayout(userId?: number | string): Promise<DashboardLayout> {
  if (userId == null) return defaultLayout();
  try {
    const raw = await AsyncStorage.getItem(`${DASHBOARD_LAYOUT_KEY}_${userId}`);
    return normalizeLayout(raw ? JSON.parse(raw) : null);
  } catch {
    // Unreadable or corrupt storage shouldn't cost the user their Dashboard
    return defaultLayout();
  }
}

export async function saveDashboardLayout(
  userId: number | string | undefined,
  layout: DashboardLayout,
): Promise<void> {
  if (userId == null) return;
  await AsyncStorage.setItem(`${DASHBOARD_LAYOUT_KEY}_${userId}`, JSON.stringify(layout));
}
