import React from 'react';
import { render } from '@testing-library/react-native';
import DistanceDetailModal, { type DistanceEntry } from '../components/DistanceDetailModal';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

// Rank boundaries mirror _TIER_BOUNDARIES (Beginner 10 ... Legend 95), with
// paces chosen so each 5K time is a round number.
const thresholds = [
  { percentile: 10, rank: 'Beginner', pace_min_per_km: 7.0 },     // 35:00
  { percentile: 30, rank: 'Intermediate', pace_min_per_km: 6.0 }, // 30:00
  { percentile: 60, rank: 'Advanced', pace_min_per_km: 5.2 },     // 26:00
  { percentile: 80, rank: 'Elite', pace_min_per_km: 4.5 },        // 22:30
  { percentile: 95, rank: 'Legend', pace_min_per_km: 3.8 },       // 19:00
];

const fiveK: DistanceEntry = {
  label: '5K',
  distance_km: 5,
  pace_min_per_km: 5.0, // 25:00
  percentile: 68.75,
  rank: { label: 'Advanced', tier: 1, display: 'Advanced I' },
  tier: 'core',
  thresholds,
};

function renderModal(distance: DistanceEntry) {
  return render(<DistanceDetailModal visible onClose={jest.fn()} distance={distance} distanceUnit="mi" />);
}

describe('DistanceDetailModal', () => {
  it('lists every rank with the time it takes at this distance', () => {
    const { getByText } = renderModal(fiveK);
    expect(getByText('35:00')).toBeTruthy();
    expect(getByText('30:00')).toBeTruthy();
    expect(getByText('26:00')).toBeTruthy();
    expect(getByText('22:30')).toBeTruthy();
    expect(getByText('19:00')).toBeTruthy();
    // Novice has no boundary of its own: anything slower than Beginner
    expect(getByText('Slower than 35:00')).toBeTruthy();
  });

  it('highlights the current rank', () => {
    const { getByTestId, queryByTestId } = renderModal(fiveK);
    expect(getByTestId('distance-tier-Advanced-current')).toBeTruthy();
    expect(queryByTestId('distance-tier-Elite-current')).toBeNull();
  });

  it('shows the best time with pace, and how much faster the next rank is', () => {
    const { getByText } = renderModal(fiveK);
    // 5:00/km is 8:03/mi
    expect(getByText(/Best time: 25:00\s+·\s+8:03\/mi/)).toBeTruthy();
    // Elite needs 4:30/km, 2:30 faster over 5K
    expect(getByText(/2:30.*faster to reach Elite/)).toBeTruthy();
  });

  it('shows times without pace for speed distances', () => {
    const quarter: DistanceEntry = {
      ...fiveK,
      label: '400m',
      distance_km: 0.4,
      tier: 'speed',
      thresholds: [{ percentile: 80, rank: 'Elite', pace_min_per_km: 3.75 }], // 1:30
    };
    const { getByText, queryByText } = renderModal(quarter);
    expect(getByText('Best time: 2:00')).toBeTruthy();
    expect(getByText('1:30')).toBeTruthy();
    expect(queryByText(/\/mi/)).toBeNull();
  });
});
