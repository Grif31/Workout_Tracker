import { bestPerformanceLeg, gateRequirementText, type GreekRankData } from '../utils/greekRank';

function data(overrides: Partial<GreekRankData> = {}): GreekRankData {
  return {
    greek_rank: 'Olympian',
    greek_score: 85,
    score_rank: 'Titan',
    held_by_gate: true,
    next_gate: { rank: 'Titan', required_percentile: 50, met: false },
    gates: { Titan: 50, 'Aretē': 80 },
    components: { consistency: 100, dedication: 80, volume: 70 },
    weights: { consistency: 0.4, dedication: 0.3, volume: 0.3 },
    performance: { strength: null, endurance: null, best: null },
    profile_missing: [],
    ...overrides,
  };
}

describe('bestPerformanceLeg', () => {
  it('picks the higher score', () => {
    expect(bestPerformanceLeg({ strength: 41, endurance: 67, best: 67 })).toBe('endurance');
    expect(bestPerformanceLeg({ strength: 72, endurance: 30, best: 72 })).toBe('strength');
  });

  it('gives a tie to Strength, matching the backend', () => {
    expect(bestPerformanceLeg({ strength: 55, endurance: 55, best: 55 })).toBe('strength');
  });

  it('handles one or both scores missing', () => {
    expect(bestPerformanceLeg({ strength: null, endurance: 67, best: 67 })).toBe('endurance');
    expect(bestPerformanceLeg({ strength: 72, endurance: null, best: 72 })).toBe('strength');
    expect(bestPerformanceLeg({ strength: null, endurance: null, best: null })).toBeNull();
  });
});

describe('gateRequirementText', () => {
  it('asks for gender first, since no score can exist without it', () => {
    expect(gateRequirementText(data({ profile_missing: ['gender'] }), 'Titan'))
      .toBe('Add your gender to your profile to unlock Titan');
  });

  it('points a user without bodyweight at bodyweight or a run', () => {
    expect(gateRequirementText(data({ profile_missing: ['bodyweight'] }), 'Titan'))
      .toBe('Log your bodyweight to score your lifts, or log a run, to unlock Titan');
  });

  it('asks for a scored lift or run when the profile is complete but nothing scores', () => {
    expect(gateRequirementText(data(), 'Titan'))
      .toBe('Log a lift that counts toward your Strength Score, or a run, to unlock Titan');
  });

  it('names the percentile once a score exists but falls short', () => {
    const d = data({ performance: { strength: 41, endurance: null, best: 41 } });
    expect(gateRequirementText(d, 'Titan'))
      .toBe('Reach the 50th percentile in Strength or Endurance to unlock Titan');
  });

  it('returns null for a met gate or an ungated rank', () => {
    const d = data({ performance: { strength: null, endurance: 67, best: 67 } });
    expect(gateRequirementText(d, 'Titan')).toBeNull();
    expect(gateRequirementText(d, 'Olympian')).toBeNull();
    expect(gateRequirementText(d, 'Aretē')).toBe('Reach the 80th percentile in Strength or Endurance to unlock Aretē');
  });
});
