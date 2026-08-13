import AsyncStorage from '@react-native-async-storage/async-storage';

// Exercises pinned to the PR Dashboard's "Pinned Progression" section.
// Shared between PRDashboardScreen (renders the section) and
// PRProgressionScreen (owns the pin/unpin toggle).
export const PR_DASHBOARD_PINS_KEY = 'pr_dashboard_pins';
export const MAX_PR_PINS = 6;

export type PRPin = { id: number; name: string };

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

/** Toggles a pin. Returns the new list, or null when adding would exceed MAX_PR_PINS. */
export async function togglePrPin(userId: number, pin: PRPin): Promise<PRPin[] | null> {
  const pins = await loadPrPins(userId);
  const existing = pins.findIndex(p => p.id === pin.id);
  let next: PRPin[];
  if (existing >= 0) {
    next = pins.filter(p => p.id !== pin.id);
  } else {
    if (pins.length >= MAX_PR_PINS) return null;
    next = [...pins, pin];
  }
  await AsyncStorage.setItem(`${PR_DASHBOARD_PINS_KEY}_${userId}`, JSON.stringify(next));
  return next;
}
