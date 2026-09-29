import React from 'react';
import { Linking } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { useWidgetLinks } from '../navigation/useWidgetLinks';
import { upNextStartLink, WIDGET_LINKS } from '../utils/widgetProps';

jest.mock('../navigation/navigationRef', () => ({
  navigationRef: { isReady: () => true, navigate: jest.fn() },
}));
jest.mock('../utils/api', () => ({ apiFetch: jest.fn() }));

const { navigationRef } = jest.requireMock('../navigation/navigationRef');
const { apiFetch } = jest.requireMock('../utils/api');

const ROUTINE = {
  id: 12,
  name: 'Push Pull Legs',
  days: [
    { day_order: 2, label: 'Pull', workout_template: { exercises: [{ id: 5, name: 'Deadlift', muscle_group: 'Back' }], programming_json: null } },
    { day_order: 1, label: 'Push', workout_template: { exercises: [{ id: 7, name: 'Bench Press', muscle_group: 'Chest' }], programming_json: null } },
  ],
};

let urlListener: ((e: { url: string }) => void) | null = null;

function Probe() {
  useWidgetLinks();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest.spyOn(Linking, 'addEventListener').mockImplementation(((_: string, cb: any) => {
    urlListener = cb;
    return { remove: jest.fn() };
  }) as any);
});

async function tap(url: string) {
  render(<Probe />);
  await waitFor(() => expect(urlListener).not.toBeNull());
  urlListener!({ url });
}

describe('useWidgetLinks', () => {
  it('Start opens a new workout with that routine day filled in, days in order', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(ROUTINE) });
    await tap(upNextStartLink(12, 1));
    await waitFor(() => expect(navigationRef.navigate).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith('/api/routines/12');
    const [tab, params] = navigationRef.navigate.mock.calls[0];
    expect(tab).toBe('DashboardTab');
    expect(params).toMatchObject({ screen: 'WorkoutLog', initial: false, params: { editMode: false } });
    // Day index 1 is Pull: the second by day_order, not the second in the response
    expect(params.params.prefill.name).toBe('Pull');
    expect(params.params.prefill.exercises.map((e: any) => e.name)).toEqual(['Deadlift']);
  });

  it('lands on Home when the day is gone', async () => {
    apiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(ROUTINE) });
    await tap(upNextStartLink(12, 5));
    await waitFor(() => expect(navigationRef.navigate).toHaveBeenCalledWith('DashboardTab'));
  });

  it('lands on Home when the routine can\'t be fetched', async () => {
    apiFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    await tap(upNextStartLink(12, 0));
    await waitFor(() => expect(navigationRef.navigate).toHaveBeenCalledWith('DashboardTab'));
  });

  it('opens Coach, Greek Rank and Home for the other widgets', async () => {
    await tap(WIDGET_LINKS.coach);
    expect(navigationRef.navigate).toHaveBeenCalledWith('TrainingTab');
    urlListener!({ url: WIDGET_LINKS.greekRank });
    expect(navigationRef.navigate).toHaveBeenCalledWith('ProfileTab', { screen: 'GreekRank', initial: false });
    urlListener!({ url: WIDGET_LINKS.home });
    expect(navigationRef.navigate).toHaveBeenCalledWith('DashboardTab');
  });
});
