import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadPrPins, togglePrPin, MAX_PR_PINS } from '../utils/prPins';

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
});
