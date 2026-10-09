/**
 * Strength gain rate: the Progress Rate card on Exercise Detail and the
 * plateau nudge on the Coach tab.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockUser } from './testUtils';
import ProgressRateCard from '../components/ProgressRateCard';
import PlateauNudge, { PLATEAU_DISMISSED_KEY, REMIND_AFTER_DAYS } from '../components/PlateauNudge';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const lift = (over: object = {}) => ({
  exercise_template_id: 3, exercise_name: 'Bench Press', sessions: 8, current_e1rm: 215,
  status: 'gaining', rate_per_month: 4.2, rate_pct_per_month: 2, ...over,
});

function installServer(exercises: object[], ok = true) {
  (global.fetch as jest.Mock) = jest.fn(() =>
    Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve({ weight_unit: 'lbs', exercises }) }));
}
const settle = () => act(async () => {});

describe('ProgressRateCard', () => {
  const renderCard = async (isPremium: boolean) => {
    const onUnlock = jest.fn();
    const r = render(<ProgressRateCard exerciseId={3} weightUnit="lbs" isPremium={isPremium} onUnlock={onUnlock} />);
    await settle();
    return { ...r, onUnlock };
  };

  it('asks for the one exercise', async () => {
    installServer([lift()]);
    await renderCard(true);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/stats/pr-velocity?exercise_template_id=3');
  });

  it('gives Premium the monthly rate in their unit', async () => {
    installServer([lift()]);
    const r = await renderCard(true);
    expect(r.getByText('+4.2 lbs/month')).toBeTruthy();
    expect(r.getByText(/about 2% a month/)).toBeTruthy();
  });

  it('says what a plateau and a decline mean', async () => {
    installServer([lift({ status: 'plateau', rate_per_month: 0.2, rate_pct_per_month: 0.1 })]);
    expect((await renderCard(true)).getByText(/Flat for 8 weeks/)).toBeTruthy();
    installServer([lift({ status: 'declining', rate_per_month: -3, rate_pct_per_month: -1.5 })]);
    const r = await renderCard(true);
    expect(r.getByText('-3 lbs/month')).toBeTruthy();
  });

  it('asks for more sessions when there is no rate yet', async () => {
    installServer([lift({ status: 'insufficient', rate_per_month: null, rate_pct_per_month: null })]);
    const r = await renderCard(true);
    expect(r.getByText('Not enough data yet')).toBeTruthy();
    expect(r.getByText(/few more days over several weeks/)).toBeTruthy();
  });

  it('shows a free account a locked card, not the rate', async () => {
    installServer([lift()]);
    const r = await renderCard(false);
    expect(r.queryByText('+4.2 lbs/month')).toBeNull();
    fireEvent.press(r.getByLabelText('Progress rate, premium'));
    expect(r.onUnlock).toHaveBeenCalled();
  });

  it('shows nothing for a lift with no recent history, or when the request fails', async () => {
    installServer([]);
    expect((await renderCard(true)).toJSON()).toBeNull();
    installServer([], false);
    expect((await renderCard(false)).toJSON()).toBeNull();
  });
});

describe('PlateauNudge', () => {
  const KEY = `${PLATEAU_DISMISSED_KEY}_${mockUser.id}`;
  const renderNudge = async (isPremium = true) => {
    const onOpenLift = jest.fn();
    const r = render(<PlateauNudge isPremium={isPremium} onOpenLift={onOpenLift} />);
    await settle();
    return { ...r, onOpenLift };
  };
  beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear(); });

  it('names the most-trained lift that has plateaued, and opens it', async () => {
    installServer([lift({ status: 'gaining', exercise_name: 'Squat', exercise_template_id: 9 }),
      lift({ status: 'plateau' }), lift({ status: 'plateau', exercise_name: 'Row', exercise_template_id: 5 })]);
    const r = await renderNudge();
    expect(r.getByText('Bench Press has plateaued')).toBeTruthy();
    fireEvent.press(r.getByText('See the lift'));
    expect(r.onOpenLift).toHaveBeenCalledWith({ exerciseId: 3, exerciseName: 'Bench Press' });
  });

  it('stays quiet when nothing has plateaued', async () => {
    installServer([lift(), lift({ status: 'insufficient', exercise_template_id: 4 })]);
    expect((await renderNudge()).toJSON()).toBeNull();
  });

  it('is dismissed for four weeks, then comes back if the lift is still flat', async () => {
    installServer([lift({ status: 'plateau' })]);
    const r = await renderNudge();
    await act(async () => { fireEvent.press(r.getByText('Not now')); });
    expect(r.queryByText('Bench Press has plateaued')).toBeNull();
    expect(Object.keys(JSON.parse((await AsyncStorage.getItem(KEY))!))).toEqual(['3']);
    r.unmount();

    expect((await renderNudge()).toJSON()).toBeNull();


    const longAgo = Date.now() - (REMIND_AFTER_DAYS + 1) * 24 * 60 * 60 * 1000;
    await AsyncStorage.setItem(KEY, JSON.stringify({ 3: longAgo }));
    expect((await renderNudge()).getByText('Bench Press has plateaued')).toBeTruthy();
  });

  it('moves on to the next flat lift after one is dismissed', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ 3: Date.now() }));
    installServer([lift({ status: 'plateau' }), lift({ status: 'plateau', exercise_name: 'Row', exercise_template_id: 5 })]);
    expect((await renderNudge()).getByText('Row has plateaued')).toBeTruthy();
  });

  it('does nothing for a free account, not even ask the server', async () => {
    installServer([lift({ status: 'plateau' })]);
    const r = await renderNudge(false);
    expect(r.toJSON()).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
