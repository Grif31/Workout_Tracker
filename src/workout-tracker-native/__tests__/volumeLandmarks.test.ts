import fs from 'fs';
import path from 'path';
import { MUSCLE_STANDARDS, volumeZone } from '../constants/volumeLandmarks';

// The AI coach flags muscles against MUSCLE_MEV / MUSCLE_MRV in ai_routes.py
// while the chart colors bars from MUSCLE_STANDARDS. If they drift, the coach
// calls a muscle overreached that the chart shows as fine.
const SOURCE = path.join(__dirname, '..', '..', 'routes', 'ai_routes.py');

function parsePythonDict(source: string, name: string): Record<string, number> {
  const block = new RegExp(`${name} = \\{([\\s\\S]*?)\\}`).exec(source);
  if (!block) throw new Error(`${name} not found in ai_routes.py`);
  return Object.fromEntries(
    [...block[1].matchAll(/'([^']+)'\s*:\s*(\d+)/g)].map(m => [m[1], Number(m[2])]),
  );
}

describe('volume landmarks match the AI coach', () => {
  const source = fs.readFileSync(SOURCE, 'utf8');
  const pick = (key: 'mev' | 'mrv') =>
    Object.fromEntries(Object.entries(MUSCLE_STANDARDS).map(([m, s]) => [m, s[key]]));

  it('uses the same MEV as MUSCLE_MEV', () => {
    expect(parsePythonDict(source, 'MUSCLE_MEV')).toEqual(pick('mev'));
  });

  it('uses the same MRV as MUSCLE_MRV', () => {
    expect(parsePythonDict(source, 'MUSCLE_MRV')).toEqual(pick('mrv'));
  });
});

describe('volumeZone', () => {
  const chest = MUSCLE_STANDARDS.Chest; // MEV 8, MAV 16, MRV 20

  it('counts down to MEV during the week instead of judging it', () => {
    expect(volumeZone(6, chest, false)).toEqual({ kind: 'toGo', label: '2 to go', remaining: 2 });
    // Half sets from secondary muscles
    expect(volumeZone(6.5, chest, false).label).toBe('1.5 to go');
  });

  it('gives the verdict once the week is over', () => {
    expect(volumeZone(6, chest, true)).toEqual({ kind: 'below', label: 'Below target' });
  });

  it('is on track from MEV through MAV, then high', () => {
    expect(volumeZone(8, chest, false).kind).toBe('onTrack');
    expect(volumeZone(16, chest, false).kind).toBe('onTrack');
    expect(volumeZone(17, chest, false).kind).toBe('high');
  });

  it('calls reaching MRV the limit, and only going past it over', () => {
    expect(volumeZone(20, chest, false)).toEqual({ kind: 'atLimit', label: 'At limit' });
    expect(volumeZone(21, chest, false)).toEqual({ kind: 'over', label: 'Over limit' });
  });

  it('has nothing to say about an untrained muscle', () => {
    expect(volumeZone(0, chest, false).kind).toBe('none');
  });
});

describe('computeBarChartMax', () => {
  const { computeBarChartMax } = require('../utils/prFormat');
  const ticks = (peak: number) => {
    const max = computeBarChartMax(peak, 4);
    return [1, 2, 3, 4].map(i => (max / 4) * i);
  };

  it('keeps every tick a whole number', () => {
    for (const peak of [0.4, 3.3, 11, 37 * 1.1, 44.4, 999, 12_345 * 1.1]) {
      expect(ticks(peak).every(Number.isInteger)).toBe(true);
    }
  });

  it('leaves room above the tallest bar without overshooting much', () => {
    expect(computeBarChartMax(3.3, 4)).toBe(4);
    expect(computeBarChartMax(40.7, 4)).toBe(48);
    expect(computeBarChartMax(13_580, 4)).toBe(16_000);
  });
});
