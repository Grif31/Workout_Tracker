/**
 * The card under the muscle volume chart: fatigue monitor and push / pull / legs
 * balance for Premium, a single locked prompt for a free account.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MuscleInsightsCard from '../components/MuscleInsightsCard';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const base = {
  muscleSets: { Chest: 6, Triceps: 3, Back: 9, Biceps: 3, Quads: 8 },
  weeklyHistory: {} as Record<string, number[]>,
  setsToDate: 41,
  lastWeekSetsToDate: 30,
  onUnlock: jest.fn(),
};

describe('MuscleInsightsCard, premium', () => {
  it('shows the fatigue banner and the balance', () => {
    const r = render(<MuscleInsightsCard {...base} isPremium />);
    expect(r.getByText('Volume is up 37% on last week')).toBeTruthy();
    expect(r.getByText('Push / Pull / Legs')).toBeTruthy();
    expect(r.getByText('Pull : Push 1.3 : 1')).toBeTruthy();
  });

  it('warns when pulling is well under pushing', () => {
    const r = render(<MuscleInsightsCard {...base} isPremium muscleSets={{ Chest: 12, Back: 6 }} />);
    expect(r.getByText('Pull : Push 0.5 : 1')).toBeTruthy();
    expect(r.getByText(/Pulling less than pushing/)).toBeTruthy();
  });

  it('drops the banner when last week is too thin to compare against', () => {
    const r = render(<MuscleInsightsCard {...base} isPremium lastWeekSetsToDate={4} />);
    expect(r.queryByText(/on last week/)).toBeNull();
    expect(r.getByText('Push / Pull / Legs')).toBeTruthy();
  });

  it('renders nothing for a week with nothing to say', () => {
    const r = render(<MuscleInsightsCard {...base} isPremium muscleSets={{ Chest: 2 }} lastWeekSetsToDate={0} />);
    expect(r.toJSON()).toBeNull();
  });
});

describe('MuscleInsightsCard, free', () => {
  beforeEach(() => base.onUnlock.mockClear());

  it('names a muscle under its minimum for two weeks and opens the paywall', () => {
    const r = render(<MuscleInsightsCard {...base} isPremium={false} weeklyHistory={{ Chest: [10, 10, 4, 5] }} />);
    expect(r.getByText(/Chest has been under its minimum for 2 weeks/)).toBeTruthy();
    fireEvent.press(r.getByRole('button'));
    expect(base.onUnlock).toHaveBeenCalled();
  });

  it('shows none of the Premium content', () => {
    const r = render(<MuscleInsightsCard {...base} isPremium={false} weeklyHistory={{ Chest: [10, 10, 4, 5] }} />);
    expect(r.queryByText('Push / Pull / Legs')).toBeNull();
    expect(r.queryByText(/on last week/)).toBeNull();
  });

  it('shows nothing when no muscle has lagged', () => {
    const r = render(<MuscleInsightsCard {...base} isPremium={false} weeklyHistory={{ Chest: [10, 10, 12, 12] }} />);
    expect(r.toJSON()).toBeNull();
  });
});
