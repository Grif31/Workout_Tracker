import {
  summarizeHeartRate,
  MIN_PLAUSIBLE_BPM,
  MAX_PLAUSIBLE_BPM,
} from '../utils/heartRate';

const s = (...bpms: number[]) => bpms.map(quantity => ({ quantity }));

describe('summarizeHeartRate', () => {
  it('returns null when there is nothing to summarise', () => {
    expect(summarizeHeartRate([])).toBeNull();
    expect(summarizeHeartRate(null)).toBeNull();
    expect(summarizeHeartRate(undefined)).toBeNull();
  });

  it('averages and peaks across samples', () => {
    expect(summarizeHeartRate(s(120, 130, 140))).toEqual({ avg: 130, max: 140 });
  });

  it('rounds the average to a whole bpm', () => {
    // mean is 130.333...
    expect(summarizeHeartRate(s(130, 130, 131))).toEqual({ avg: 130, max: 131 });
  });

  it('drops implausible samples instead of letting them skew the average', () => {
    // A loose strap emits 0s; without filtering the average would be 60.
    expect(summarizeHeartRate(s(0, 120, 0))).toEqual({ avg: 120, max: 120 });
    expect(summarizeHeartRate(s(120, 1000))).toEqual({ avg: 120, max: 120 });
  });

  it('returns null when every sample is implausible', () => {
    // Must stay null, not 0 — the backend treats null as "no wearable".
    expect(summarizeHeartRate(s(0, 0, 900))).toBeNull();
  });

  it('keeps samples exactly on the plausible bounds', () => {
    expect(summarizeHeartRate(s(MIN_PLAUSIBLE_BPM))).toEqual({
      avg: MIN_PLAUSIBLE_BPM,
      max: MIN_PLAUSIBLE_BPM,
    });
    expect(summarizeHeartRate(s(MAX_PLAUSIBLE_BPM))).toEqual({
      avg: MAX_PLAUSIBLE_BPM,
      max: MAX_PLAUSIBLE_BPM,
    });
  });

  it('ignores NaN and non-finite readings', () => {
    expect(summarizeHeartRate(s(NaN, 140, Infinity))).toEqual({ avg: 140, max: 140 });
  });

  it('survives malformed sample objects', () => {
    const malformed = [null, undefined, {}, { quantity: 150 }] as any;
    expect(summarizeHeartRate(malformed)).toEqual({ avg: 150, max: 150 });
  });
});
