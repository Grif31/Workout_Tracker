import {
  plateCalc, enabledPlatesFor, togglePlateSetting,
  PLATE_CONFIG_LBS, PLATE_CONFIG_KG, BAR_WEIGHTS_LBS, BAR_WEIGHTS_KG,
} from '../utils/plateCalc';

const LBS_PLATES = PLATE_CONFIG_LBS.map(p => p.weight);
const KG_PLATES = PLATE_CONFIG_KG.map(p => p.weight);

describe('plateCalc', () => {
  it('splits weight evenly per side, largest plates first', () => {
    const { plates, remainder } = plateCalc(225, BAR_WEIGHTS_LBS.standard, LBS_PLATES);
    // (225 - 45) / 2 = 90 per side -> two 45s
    expect(plates).toEqual([{ plate: 45, count: 2 }]);
    expect(remainder).toBe(0);
  });

  it('mixes plate sizes to hit an uneven per-side target', () => {
    const { plates, remainder } = plateCalc(185, BAR_WEIGHTS_LBS.standard, LBS_PLATES);
    // (185 - 45) / 2 = 70 per side -> 45 + 25
    expect(plates).toEqual([
      { plate: 45, count: 1 },
      { plate: 25, count: 1 },
    ]);
    expect(remainder).toBe(0);
  });

  it('reports a remainder when the target cannot be hit exactly', () => {
    const { plates, remainder } = plateCalc(226, BAR_WEIGHTS_LBS.standard, LBS_PLATES);
    // (226 - 45) / 2 = 90.5 per side -> two 45s, 0.5 left over
    expect(plates).toEqual([{ plate: 45, count: 2 }]);
    expect(remainder).toBe(0.5);
  });

  it('returns no plates when target equals bar weight', () => {
    const { plates, remainder } = plateCalc(45, BAR_WEIGHTS_LBS.standard, LBS_PLATES);
    expect(plates).toEqual([]);
    expect(remainder).toBe(0);
  });

  it('returns no plates when target is below bar weight', () => {
    const { plates, remainder } = plateCalc(30, BAR_WEIGHTS_LBS.standard, LBS_PLATES);
    expect(plates).toEqual([]);
    expect(remainder).toBe(0);
  });

  it('handles a bare bar (barType "none", zero bar weight)', () => {
    const { plates, remainder } = plateCalc(100, BAR_WEIGHTS_LBS.none, LBS_PLATES);
    // 100 / 2 = 50 per side -> 45 + 5
    expect(plates).toEqual([
      { plate: 45, count: 1 },
      { plate: 5, count: 1 },
    ]);
    expect(remainder).toBe(0);
  });

  it('only uses plates present in the available set', () => {
    const { plates, remainder } = plateCalc(135, BAR_WEIGHTS_LBS.standard, [45, 10]);
    // (135 - 45) / 2 = 45 per side, no 25/5/2.5 available -> one 45
    expect(plates).toEqual([{ plate: 45, count: 1 }]);
    expect(remainder).toBe(0);
  });

  it('does not double-count floating point drift across fractional kg plates', () => {
    const { plates, remainder } = plateCalc(66.25, BAR_WEIGHTS_KG.standard, KG_PLATES);
    // (66.25 - 20) / 2 = 23.125 per side -> 20 + 2.5 + 0.625 remainder
    expect(plates).toEqual([
      { plate: 20, count: 1 },
      { plate: 2.5, count: 1 },
    ]);
    expect(remainder).toBe(0.625);
  });

  it('handles an ez-curl bar with a lighter bar weight', () => {
    const { plates, remainder } = plateCalc(65, BAR_WEIGHTS_LBS.ez, LBS_PLATES);
    // (65 - 20) / 2 = 22.5 per side -> 10 + 10 + 2.5
    expect(plates).toEqual([
      { plate: 10, count: 2 },
      { plate: 2.5, count: 1 },
    ]);
    expect(remainder).toBe(0);
  });

  it('finds an exact load the biggest-plate-first approach misses', () => {
    // 50/side from 45s, 25s and 10s: 25 + 25, not one 45 and 5 short
    const { plates, remainder } = plateCalc(145, BAR_WEIGHTS_LBS.standard, [45, 25, 10]);
    expect(plates).toEqual([{ plate: 25, count: 2 }]);
    expect(remainder).toBe(0);
  });

  it('uses the fewest plates when several loads are exact', () => {
    // 60/side: 35 + 25 rather than 45 + 10 + 5
    const { plates } = plateCalc(165, BAR_WEIGHTS_LBS.standard, LBS_PLATES);
    expect(plates).toEqual([{ plate: 35, count: 1 }, { plate: 25, count: 1 }]);
  });

  it('loads 25 kg plates first on a kg bar', () => {
    // 80/side: 3 × 25 + 5
    const { plates, remainder } = plateCalc(180, BAR_WEIGHTS_KG.standard, KG_PLATES);
    expect(plates).toEqual([{ plate: 25, count: 3 }, { plate: 5, count: 1 }]);
    expect(remainder).toBe(0);
  });

  it('gets as close as possible without going over', () => {
    // 21/side from 10s and 5s only: 20, 1 short per side
    const { plates, remainder } = plateCalc(62, BAR_WEIGHTS_LBS.ez, [10, 5]);
    expect(plates).toEqual([{ plate: 10, count: 2 }]);
    expect(remainder).toBe(1);
  });
});

describe('enabledPlatesFor', () => {
  it('starts with every plate on', () => {
    expect(enabledPlatesFor(null, 'kg')).toEqual(KG_PLATES);
    expect(enabledPlatesFor(null, 'lbs')).toEqual(LBS_PLATES);
  });

  it("ignores an old saved list that names the other unit's plates", () => {
    // Saved in lbs, then the user switched to kg: 45 kg plates don't exist
    expect(enabledPlatesFor(JSON.stringify([45, 25, 10]), 'kg')).toEqual(KG_PLATES);
    expect(enabledPlatesFor(JSON.stringify([45, 25, 10]), 'lbs')).toEqual([45, 25, 10]);
  });

  it('keeps an old kg list and switches the newly added 25 kg plate on', () => {
    expect(enabledPlatesFor(JSON.stringify([20, 10, 5]), 'kg')).toEqual([25, 20, 10, 5]);
  });

  it("keeps each unit's choices separately once toggled", () => {
    let raw = togglePlateSetting(null, 'lbs', 35);
    raw = togglePlateSetting(raw, 'kg', 1.25);
    expect(enabledPlatesFor(raw, 'lbs')).toEqual(LBS_PLATES.filter(w => w !== 35));
    expect(enabledPlatesFor(raw, 'kg')).toEqual(KG_PLATES.filter(w => w !== 1.25));
    raw = togglePlateSetting(raw, 'lbs', 35);
    expect(enabledPlatesFor(raw, 'lbs')).toEqual(LBS_PLATES);
  });
});
