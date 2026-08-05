import { plateCalc, PLATE_CONFIG_LBS, PLATE_CONFIG_KG, BAR_WEIGHTS_LBS, BAR_WEIGHTS_KG } from '../utils/plateCalc';

const LBS_PLATES = PLATE_CONFIG_LBS.map(p => p.weight);
const KG_PLATES = PLATE_CONFIG_KG.map(p => p.weight);

describe('plateCalc', () => {
  it('splits weight evenly per side and greedily allocates largest plates first', () => {
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
});
