import React from 'react';
import { render } from '@testing-library/react-native';
import LiftDetailModal, { type LiftEntry } from '../components/LiftDetailModal';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

// Rank boundaries mirror _TIER_BOUNDARIES (Beginner 10 ... Legend 95)
const bench: LiftEntry = {
  exercise: 'Bench Press',
  percentile: 64,
  rank: { label: 'Advanced', tier: 1, display: 'Advanced I' },
  estimated_1rm: 205,
  thresholds: [
    { percentile: 10, rank: 'Beginner', weight: 95 },
    { percentile: 30, rank: 'Intermediate', weight: 145 },
    { percentile: 60, rank: 'Advanced', weight: 195 },
    { percentile: 80, rank: 'Elite', weight: 240 },
    { percentile: 95, rank: 'Legend', weight: 290 },
  ],
  has_data: true,
};

function renderModal(lift: LiftEntry) {
  return render(<LiftDetailModal visible onClose={jest.fn()} lift={lift} weightUnit="lbs" />);
}

describe('LiftDetailModal', () => {
  it('lists every rank with the weight it takes', () => {
    const { getByText } = renderModal(bench);
    expect(getByText('Weight By Rank')).toBeTruthy();
    for (const w of ['95 lbs', '145 lbs', '195 lbs', '240 lbs', '290 lbs']) {
      expect(getByText(w)).toBeTruthy();
    }
    // Novice has no boundary of its own: anything below Beginner
    expect(getByText('Below 95 lbs')).toBeTruthy();
  });

  it('highlights the current rank', () => {
    const { getByTestId, queryByTestId } = renderModal(bench);
    expect(getByTestId('lift-tier-Advanced-current')).toBeTruthy();
    expect(queryByTestId('lift-tier-Elite-current')).toBeNull();
  });

  it('still shows how far the next rank is', () => {
    const { getByText } = renderModal(bench);
    expect(getByText(/35 lbs.*to Elite/)).toBeTruthy();
  });

  it('labels a logged single as a 1RM, not an estimate', () => {
    const { getByText, queryByText } = renderModal({ ...bench, is_true_1rm: true });
    expect(getByText('1RM: 205 lbs')).toBeTruthy();
    expect(queryByText(/Est\. 1RM/)).toBeNull();
  });

  it('labels an Epley estimate as estimated', () => {
    const { getByText } = renderModal({ ...bench, is_true_1rm: false });
    expect(getByText('Est. 1RM: 205 lbs')).toBeTruthy();
  });

  it('omits the list when there are no thresholds (no bodyweight)', () => {
    const { queryByText } = renderModal({ ...bench, thresholds: [] });
    expect(queryByText('Weight By Rank')).toBeNull();
  });
});
