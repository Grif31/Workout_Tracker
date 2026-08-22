import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadPrPins, togglePrPin, pinMatches, pinSlotKey, MAX_PR_PINS } from '../utils/prPins';

describe('prPins', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns an empty list when nothing is stored', async () => {
    expect(await loadPrPins(1)).toEqual([]);
  });

  it('adds and removes a pin', async () => {
    await togglePrPin(1, { id: 7, name: 'Bench Press' });
    expect(await loadPrPins(1)).toEqual([{ id: 7, name: 'Bench Press' }]);
    await togglePrPin(1, { id: 7, name: 'Bench Press' });
    expect(await loadPrPins(1)).toEqual([]);
  });

  it('keeps pins per-user', async () => {
    await togglePrPin(1, { id: 7, name: 'Bench Press' });
    expect(await loadPrPins(2)).toEqual([]);
  });

  it('refuses to add beyond the pin cap', async () => {
    for (let i = 0; i < MAX_PR_PINS; i++) {
      await togglePrPin(1, { id: i, name: `Lift ${i}` });
    }
    const result = await togglePrPin(1, { id: 99, name: 'One Too Many' });
    expect(result).toBeNull();
    expect((await loadPrPins(1)).length).toBe(MAX_PR_PINS);
  });

  it('still allows unpinning at the cap', async () => {
    for (let i = 0; i < MAX_PR_PINS; i++) {
      await togglePrPin(1, { id: i, name: `Lift ${i}` });
    }
    const result = await togglePrPin(1, { id: 0, name: 'Lift 0' });
    expect(result).not.toBeNull();
    expect((await loadPrPins(1)).length).toBe(MAX_PR_PINS - 1);
  });

  it('survives corrupted stored JSON', async () => {
    await AsyncStorage.setItem('pr_dashboard_pins_1', 'not json{');
    expect(await loadPrPins(1)).toEqual([]);
  });

  it('pins two different PR types on the same exercise independently', async () => {
    await togglePrPin(1, { id: 7, name: 'Bench Press', prType: 'max_weight', weightContext: null });
    await togglePrPin(1, { id: 7, name: 'Bench Press', prType: 'max_reps', weightContext: 185 });
    expect(await loadPrPins(1)).toEqual([
      { id: 7, name: 'Bench Press', prType: 'max_weight', weightContext: null },
      { id: 7, name: 'Bench Press', prType: 'max_reps', weightContext: 185 },
    ]);
  });

  it('unpins only the matching type+context, leaving the other pin on the same exercise', async () => {
    await togglePrPin(1, { id: 7, name: 'Bench Press', prType: 'max_weight', weightContext: null });
    await togglePrPin(1, { id: 7, name: 'Bench Press', prType: 'max_reps', weightContext: 185 });
    await togglePrPin(1, { id: 7, name: 'Bench Press', prType: 'max_weight', weightContext: null });
    expect(await loadPrPins(1)).toEqual([
      { id: 7, name: 'Bench Press', prType: 'max_reps', weightContext: 185 },
    ]);
  });

  it('treats different weight contexts of the same type as separate pins', async () => {
    await togglePrPin(1, { id: 7, name: 'Bench Press', prType: 'max_reps', weightContext: 135 });
    await togglePrPin(1, { id: 7, name: 'Bench Press', prType: 'max_reps', weightContext: 185 });
    expect((await loadPrPins(1)).length).toBe(2);
  });
});

describe('pinMatches', () => {
  it('matches on exact id + type + context', () => {
    const pin = { id: 7, name: 'Bench Press', prType: 'max_reps' as const, weightContext: 185 };
    expect(pinMatches(pin, { id: 7, prType: 'max_reps', weightContext: 185 })).toBe(true);
    expect(pinMatches(pin, { id: 7, prType: 'max_reps', weightContext: 135 })).toBe(false);
    expect(pinMatches(pin, { id: 7, prType: 'max_weight', weightContext: 185 })).toBe(false);
    expect(pinMatches(pin, { id: 9, prType: 'max_reps', weightContext: 185 })).toBe(false);
  });

  it('loosely matches a legacy pin (no prType) against any type on the same exercise', () => {
    const legacy = { id: 7, name: 'Bench Press' };
    expect(pinMatches(legacy, { id: 7, prType: 'max_weight', weightContext: null })).toBe(true);
    expect(pinMatches(legacy, { id: 7, prType: 'max_reps', weightContext: 185 })).toBe(true);
    expect(pinMatches(legacy, { id: 9, prType: 'max_weight', weightContext: null })).toBe(false);
  });
});

describe('pinSlotKey', () => {
  it('produces distinct keys for different types/contexts on the same exercise', () => {
    const a = pinSlotKey({ id: 7, name: 'Bench Press', prType: 'max_weight', weightContext: null });
    const b = pinSlotKey({ id: 7, name: 'Bench Press', prType: 'max_reps', weightContext: 185 });
    const c = pinSlotKey({ id: 7, name: 'Bench Press', prType: 'max_reps', weightContext: 135 });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('produces the same key for equivalent pins', () => {
    const a = pinSlotKey({ id: 7, name: 'Bench Press', prType: 'max_reps', weightContext: 185 });
    const b = pinSlotKey({ id: 7, name: 'Bench Press (renamed)', prType: 'max_reps', weightContext: 185 });
    expect(a).toBe(b);
  });
});
