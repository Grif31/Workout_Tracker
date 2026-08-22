import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PREventItem } from './prFormat';

// Exercises (optionally a specific PR type on that exercise) pinned to the PR
// Dashboard's "Pinned Progression" section. Shared between PRDashboardScreen
// (renders the section) and PRProgressionScreen (owns the pin/unpin toggle).
export const PR_DASHBOARD_PINS_KEY = 'pr_dashboard_pins';
export const MAX_PR_PINS = 6;

export type PRPin = {
  id: number;
  name: string;
  // Omitted on pins created before per-type pinning shipped — those fall
  // back to pickDefaultPrSeries's auto-pick, same as before.
  prType?: PREventItem['pr_type'];
  weightContext?: number | null;
};

export async function loadPrPins(userId: number): Promise<PRPin[]> {
  try {
    const raw = await AsyncStorage.getItem(`${PR_DASHBOARD_PINS_KEY}_${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Whether `pin` occupies the same slot as `target` (exercise + specific PR
 * type + context). A legacy pin with no `prType` loosely matches any type on
 * that exercise, so it can still show as "pinned" and be replaced by a
 * type-specific pin on the next tap.
 */
export function pinMatches(
  pin: PRPin,
  target: { id: number; prType?: PREventItem['pr_type']; weightContext?: number | null },
): boolean {
  if (pin.id !== target.id) return false;
  if (pin.prType == null || target.prType == null) return true;
  if (pin.prType !== target.prType) return false;
  return (pin.weightContext ?? null) === (target.weightContext ?? null);
}

/** Toggles a pin. Returns the new list, or null when adding would exceed MAX_PR_PINS. */
export async function togglePrPin(userId: number, pin: PRPin): Promise<PRPin[] | null> {
  const pins = await loadPrPins(userId);
  const existing = pins.findIndex(p => pinMatches(p, pin));
  let next: PRPin[];
  if (existing >= 0) {
    next = pins.filter((_, i) => i !== existing);
  } else {
    if (pins.length >= MAX_PR_PINS) return null;
    next = [...pins, pin];
  }
  await AsyncStorage.setItem(`${PR_DASHBOARD_PINS_KEY}_${userId}`, JSON.stringify(next));
  return next;
}

/** Stable key for a pin's slot — exercise + type + context — since a single
 * exercise can now have more than one pin (different PR types). */
export function pinSlotKey(pin: PRPin): string {
  return `${pin.id}:${pin.prType ?? ''}:${pin.weightContext ?? ''}`;
}
