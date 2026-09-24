import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CARD_SIZES,
  DASHBOARD_CARDS,
  DEFAULT_DASHBOARD_ORDER,
  FIXED_HOME_ORDER,
  defaultSizeFor,
  type CardSize,
  type DashboardCardId,
} from '../constants/dashboardCards';

/** Per-user, suffixed `_${uid}` like the app's other per-user keys. */
export const DASHBOARD_LAYOUT_KEY = 'dashboard_layout';

export type DashboardLayout = {
  order: DashboardCardId[];
  hidden: DashboardCardId[];
  /** Only cards sized away from their default need an entry. */
  sizes: Partial<Record<DashboardCardId, CardSize>>;
};

/** A rendered row: one full-width card, or one or two half-width ones. */
export type DashboardRow = { ids: DashboardCardId[]; size: CardSize };

const VALID_IDS = new Set<string>(DASHBOARD_CARDS.map(c => c.id));

export const defaultLayout = (): DashboardLayout => ({
  order: [...DEFAULT_DASHBOARD_ORDER],
  hidden: [],
  sizes: {},
});

/** Home while customization is held back; see HOME_CUSTOMIZATION_ENABLED. */
export const fixedHomeLayout = (): DashboardLayout => ({
  order: [...FIXED_HOME_ORDER],
  hidden: [],
  sizes: {},
});

/** The width a card renders at, falling back to its default. */
export function cardSize(layout: DashboardLayout, id: DashboardCardId): CardSize {
  return layout.sizes?.[id] ?? defaultSizeFor(id);
}

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

  // A stored size outlives releases too: a card that loses its compact variant
  // must fall back to a width it can actually render, not keep a size nothing
  // draws any more.
  const savedSizes = (stored.sizes ?? {}) as Record<string, string>;
  const sizes: Partial<Record<DashboardCardId, CardSize>> = {};
  for (const [id, size] of Object.entries(savedSizes)) {
    if (!VALID_IDS.has(id)) continue;
    const allowed = CARD_SIZES[id as DashboardCardId] ?? [];
    if (allowed.includes(size as CardSize)) sizes[id as DashboardCardId] = size as CardSize;
  }

  return { order, hidden, sizes };
}

/**
 * Visible cards grouped into the rows they render as.
 *
 * A half-width card pairs with the next half-width one; everything else takes
 * the row to itself. A trailing half with no partner stays half width rather
 * than quietly stretching — the size the user picked is the size they get.
 */
export function packRows(layout: DashboardLayout): DashboardRow[] {
  const visible = visibleCards(layout);
  const rows: DashboardRow[] = [];
  for (let i = 0; i < visible.length; i++) {
    const id = visible[i];
    if (cardSize(layout, id) !== 'half') {
      rows.push({ ids: [id], size: 'full' });
      continue;
    }
    const next = visible[i + 1];
    if (next && cardSize(layout, next) === 'half') {
      rows.push({ ids: [id, next], size: 'half' });
      i++;
    } else {
      rows.push({ ids: [id], size: 'half' });
    }
  }
  return rows;
}

/** Cards to render, in order, with hidden ones removed. */
export function visibleCards(layout: DashboardLayout): DashboardCardId[] {
  return layout.order.filter(id => !layout.hidden.includes(id));
}

/**
 * The day filter to apply to the workouts list.
 *
 * Hiding the calendar takes away the only control for clearing a selected day,
 * so a selection made before it was hidden would leave the list stuck on that
 * day for as long as the screen stays mounted. The selection is kept rather
 * than cleared, so turning the calendar back on restores it.
 */
export function activeDayFilter(layout: DashboardLayout, selectedDate: string | null): string | null {
  return visibleCards(layout).includes('weekCalendar') ? selectedDate : null;
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
