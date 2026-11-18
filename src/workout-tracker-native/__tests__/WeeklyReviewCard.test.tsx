/**
 * The weekly review on Coach and in Weekly Summary: a premium account reads all
 * three parts, a free account reads the first with one Upgrade button under it,
 * and a week is only ever asked for once.
 */
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockUser } from './testUtils';
import WeeklyReviewCard, { WEEKLY_REVIEW_KEY } from '../components/WeeklyReviewCard';
import { COACH_PROFILE_KEY } from '../utils/coachProfile';
import { syncServerPremium } from '../utils/premiumSync';

jest.mock('../utils/premiumSync', () => ({ syncServerPremium: jest.fn() }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const WEEK = '2026-09-28';
const KEY = `${WEEKLY_REVIEW_KEY}_${mockUser.id}`;
const REVIEW = {
  went_well: { title: 'Three Workouts Logged', body: 'You hit your goal.' },
  lagged: { title: 'Back Volume Was Low', body: 'Back had 4 sets.' },
  next_change: { title: 'Add Two Back Sets', body: 'Add rows to pull day.' },
};

function installServer(response: { ok?: boolean; body: any } = { body: { review: REVIEW } }) {
  (global.fetch as jest.Mock) = jest.fn(() =>
    Promise.resolve({ ok: response.ok ?? true, status: response.ok === false ? 500 : 200, json: () => Promise.resolve(response.body) }));
}
const reviewCalls = () => (global.fetch as jest.Mock).mock.calls.filter(c => String(c[0]).includes('/api/ai/weekly-review'));

async function renderCard(isPremium: boolean, weekStart = WEEK) {
  const onUnlock = jest.fn();
  const utils = render(<WeeklyReviewCard weekStart={weekStart} isPremium={isPremium} onUnlock={onUnlock} />);
  await act(async () => {});
  return { ...utils, onUnlock };
}

describe('WeeklyReviewCard', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    installServer();
  });

  it('shows all three parts to a premium account and saves them for the week', async () => {
    const r = await renderCard(true);
    await act(async () => { fireEvent.press(r.getByText("Get Review")); });
    expect(await r.findByText('You hit your goal.')).toBeTruthy();
    expect(r.getByText('Back had 4 sets.')).toBeTruthy();
    expect(r.getByText('Add rows to pull day.')).toBeTruthy();
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ weekStart: WEEK, review: REVIEW, locked: [] });
  });

  it('shows a free account the first part and one Upgrade button for the rest', async () => {
    const r = await renderCard(false);
    await act(async () => { fireEvent.press(r.getByText("Get Review")); });
    expect(await r.findByText('You hit your goal.')).toBeTruthy();
    expect(r.queryByText('Back had 4 sets.')).toBeNull();
    expect(r.queryByText('Add rows to pull day.')).toBeNull();
    expect(r.queryByText('Lagged')).toBeNull();

    fireEvent.press(r.getByText('Upgrade'));
    expect(r.onUnlock).toHaveBeenCalled();
  });

  it('has no Upgrade button for a premium account', async () => {
    const r = await renderCard(true);
    await act(async () => { fireEvent.press(r.getByText("Get Review")); });
    expect(await r.findByText('Add rows to pull day.')).toBeTruthy();
    expect(r.queryByText('Upgrade')).toBeNull();
  });

  it('labels the week it covers', async () => {
    const r = await renderCard(true, '2026-10-12');
    expect(r.getByText('Oct 12 to 18')).toBeTruthy();
    r.unmount();
    expect((await renderCard(true, '2026-09-28')).getByText('Sep 28 to Oct 4')).toBeTruthy();
  });

  it('picks up a review saved elsewhere when told to reload', async () => {
    const onUnlock = jest.fn();
    const r = render(<WeeklyReviewCard weekStart={WEEK} isPremium onUnlock={onUnlock} reloadToken={1} />);
    await act(async () => {});
    expect(r.getByText('Get Review')).toBeTruthy();
    await AsyncStorage.setItem(KEY, JSON.stringify({ weekStart: WEEK, review: REVIEW, locked: [] }));
    r.rerender(<WeeklyReviewCard weekStart={WEEK} isPremium onUnlock={onUnlock} reloadToken={2} />);
    expect(await r.findByText('You hit your goal.')).toBeTruthy();
    expect(reviewCalls()).toHaveLength(0);
  });

  it("falls back to the first part that survived the Coach's fact check", async () => {
    installServer({ body: { review: { lagged: REVIEW.lagged, next_change: REVIEW.next_change } } });
    const r = await renderCard(false);
    await act(async () => { fireEvent.press(r.getByText("Get Review")); });
    expect(await r.findByText('Back had 4 sets.')).toBeTruthy();
    expect(r.queryByText('Add rows to pull day.')).toBeNull();
    expect(r.getByText('Upgrade')).toBeTruthy();
  });

  it('brings the saved review back without asking again, and unlocks it on upgrade', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ weekStart: WEEK, review: REVIEW }));
    const free = await renderCard(false);
    expect(await free.findByText('You hit your goal.')).toBeTruthy();
    expect(free.queryByText('Add rows to pull day.')).toBeNull();
    free.unmount();

    const premium = await renderCard(true);
    expect(await premium.findByText('Add rows to pull day.')).toBeTruthy();
    expect(reviewCalls()).toHaveLength(0);
  });

  it('offers the upgrade when the server held parts back for a free account', async () => {
    installServer({ body: { review: { went_well: REVIEW.went_well }, locked: ['lagged', 'next_change'] } });
    const r = await renderCard(false);
    await act(async () => { fireEvent.press(r.getByText("Get Review")); });
    expect(await r.findByText('You hit your goal.')).toBeTruthy();
    expect(r.getByText('Upgrade')).toBeTruthy();
    expect(r.queryByText('Back had 4 sets.')).toBeNull();
  });

  it('asks again after an upgrade, since the saved review was trimmed', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ weekStart: WEEK, review: { went_well: REVIEW.went_well }, locked: ['lagged', 'next_change'] }));
    const free = await renderCard(false);
    expect(await free.findByText('You hit your goal.')).toBeTruthy();
    free.unmount();
    const premium = await renderCard(true);
    expect(premium.getByText("Get Review")).toBeTruthy();
    expect(premium.queryByText('You hit your goal.')).toBeNull();
  });

  it('tells the server and says to retry when Premium has not reached it yet', async () => {
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    installServer({ body: { review: { went_well: REVIEW.went_well }, locked: ['lagged', 'next_change'] } });
    const r = await renderCard(true);
    await act(async () => { fireEvent.press(r.getByText("Get Review")); });
    expect(syncServerPremium).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Almost There', expect.stringContaining('Premium'));
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    alertSpy.mockRestore();
  });

  it('ignores a review saved for another week', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ weekStart: '2026-09-21', review: REVIEW }));
    const r = await renderCard(true);
    expect(r.getByText("Get Review")).toBeTruthy();
    expect(r.queryByText('You hit your goal.')).toBeNull();
  });

  it('sends the coach profile and the week with the request', async () => {
    await AsyncStorage.setItem(`${COACH_PROFILE_KEY}_${mockUser.id}`, JSON.stringify({ goal: 'strength', experience: 'advanced', avoid: ['knees'] }));
    const r = await renderCard(true);
    await act(async () => { fireEvent.press(r.getByText("Get Review")); });
    await waitFor(() => expect(reviewCalls()).toHaveLength(1));
    expect(JSON.parse(reviewCalls()[0][1].body)).toEqual({ experience: 'advanced', goal: 'strength', avoid: ['knees'], notes: '', week_start: WEEK });
  });

  it('sends only the week when the device has no profile, so the server reads its own', async () => {
    const r = await renderCard(true);
    await act(async () => { fireEvent.press(r.getByText("Get Review")); });
    await waitFor(() => expect(reviewCalls()).toHaveLength(1));
    expect(JSON.parse(reviewCalls()[0][1].body)).toEqual({ week_start: WEEK });
  });

  it('turns the button into a pulsing star while writing, and ignores a second tap', async () => {
    let finish: (v: any) => void = () => {};
    (global.fetch as jest.Mock) = jest.fn(() => new Promise(res => { finish = res; }));
    const r = await renderCard(true);
    await act(async () => { fireEvent.press(r.getByLabelText("Get weekly review")); });

    const writing = r.getByLabelText("Writing weekly review");
    await act(async () => { fireEvent.press(writing); });
    expect(reviewCalls()).toHaveLength(1);

    await act(async () => { finish({ ok: true, status: 200, json: () => Promise.resolve({ review: REVIEW }) }); });
    expect(await r.findByText('You hit your goal.')).toBeTruthy();
    expect(r.queryByLabelText("Writing weekly review")).toBeNull();
  });

  it('returns the star to a button when the request fails', async () => {
    installServer({ ok: false, body: { message: 'nope' } });
    const r = await renderCard(true);
    await act(async () => { fireEvent.press(r.getByLabelText("Get weekly review")); });
    expect(await r.findByLabelText("Get weekly review")).toBeTruthy();
    expect(r.queryByLabelText("Writing weekly review")).toBeNull();
  });

  it('offers a retry, and saves nothing, when no part could be backed by the data', async () => {
    installServer({ body: { review: {} } });
    const r = await renderCard(true);
    await act(async () => { fireEvent.press(r.getByText("Get Review")); });
    expect(await r.findByText('Try Again')).toBeTruthy();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});
