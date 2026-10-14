/**
 * The premium stats under the muscle chart, as one card of labelled sections:
 * weekly load, push / pull / legs, and workout density. (The lock that covers
 * the card for free accounts is tested with the Coach tab.)
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import AdvancedStatsCard from '../components/AdvancedStatsCard';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const buckets = [
  { label: '9/1', density: 0 }, { label: '9/8', density: 40.4 }, { label: '9/15', density: 0 }, { label: '9/22', density: 50.2 },
];
const base = {
  muscleSets: { Chest: 6, Triceps: 3, Back: 9, Biceps: 3, Quads: 8 },
  setsToDate: 41,
  lastWeekSetsToDate: 30,
  densityBuckets: buckets,
  hasDensity: true,
  weightUnit: 'lbs',
};

describe('AdvancedStatsCard', () => {
  it('has a labelled section for each stat', () => {
    const r = render(<AdvancedStatsCard {...base} />);
    expect(r.getByText('Weekly load')).toBeTruthy();
    expect(r.getByText('Push / Pull / Legs')).toBeTruthy();
    expect(r.getByText('Workout density')).toBeTruthy();
  });

  describe('weekly load', () => {
    it('leads with the change as a number and says what it means', () => {
      const r = render(<AdvancedStatsCard {...base} />);
      expect(r.getByText('+37%')).toBeTruthy();
      expect(r.getByText('vs last week')).toBeTruthy();
      expect(r.getByText('Big jump this week')).toBeTruthy();
      expect(r.getByLabelText('Volume is up 37% on last week')).toBeTruthy();
    });

    it('shows a drop with its minus sign', () => {
      const r = render(<AdvancedStatsCard {...base} setsToDate={11} />);
      expect(r.getByText('-63%')).toBeTruthy();
      expect(r.getByText('Well below last week')).toBeTruthy();
    });

    it('is left out when last week is too thin to compare against', () => {
      const r = render(<AdvancedStatsCard {...base} lastWeekSetsToDate={4} />);
      expect(r.queryByText('Weekly load')).toBeNull();
      expect(r.getByText('Push / Pull / Legs')).toBeTruthy();
    });
  });

  describe('push / pull / legs', () => {
    it('shows the split and the pull:push ratio', () => {
      const r = render(<AdvancedStatsCard {...base} />);
      expect(r.getByText('Pull : Push 1.3 : 1')).toBeTruthy();
      expect(r.getByText('Push 9')).toBeTruthy();
      expect(r.getByText('Pull 12')).toBeTruthy();
    });

    it('warns when pulling is well under pushing', () => {
      const r = render(<AdvancedStatsCard {...base} muscleSets={{ Chest: 12, Back: 6 }} />);
      expect(r.getByText('Pull : Push 0.5 : 1')).toBeTruthy();
      expect(r.getByText(/Pulling less than pushing/)).toBeTruthy();
    });

    it('is left out for a week with only a couple of sets', () => {
      const r = render(<AdvancedStatsCard {...base} muscleSets={{ Chest: 2 }} />);
      expect(r.queryByText('Push / Pull / Legs')).toBeNull();
    });
  });

  describe('workout density', () => {
    it('summarises the timed periods, ignoring ones with no timed workouts', () => {
      const r = render(<AdvancedStatsCard {...base} />);
      expect(r.getByText('lbs lifted per minute, timed workouts only. Latest 50, average 45.')).toBeTruthy();
      expect(r.getByLabelText('Density by period, lbs per minute')).toBeTruthy();
    });

    it('uses the kg unit', () => {
      expect(render(<AdvancedStatsCard {...base} weightUnit="kg" />).getByText(/^kg lifted per minute/)).toBeTruthy();
    });

    it('says so when the range has no timed workouts', () => {
      const r = render(<AdvancedStatsCard {...base} densityBuckets={buckets.map(b => ({ ...b, density: 0 }))} />);
      expect(r.getByText('No timed workouts in this range yet.')).toBeTruthy();
    });

    it('labels every other period once there are many', () => {
      const many = Array.from({ length: 13 }, (_, i) => ({ label: `L${i}`, density: 10 + i }));
      const r = render(<AdvancedStatsCard {...base} densityBuckets={many} />);
      expect(r.getByText('L12')).toBeTruthy();
      expect(r.getByText('L10')).toBeTruthy();
      expect(r.queryByText('L11')).toBeNull();
    });

    it('is left out until the user has timed workouts', () => {
      expect(render(<AdvancedStatsCard {...base} hasDensity={false} />).queryByText('Workout density')).toBeNull();
    });
  });

  it('renders nothing when there is nothing to show', () => {
    const r = render(<AdvancedStatsCard {...base} muscleSets={{ Chest: 2 }} lastWeekSetsToDate={0} hasDensity={false} />);
    expect(r.toJSON()).toBeNull();
  });
});
