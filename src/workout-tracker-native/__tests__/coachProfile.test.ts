/**
 * The coach profile moved from the device only to the server too. What must
 * hold: nobody loses the profile they set (a copy older builds wrote is
 * uploaded, never overwritten by the server's empty answer), a reinstall gets
 * it back, and an edit made offline survives the next sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../utils/api';
import {
  COACH_PROFILE_KEY, DEFAULT_PROFILE, loadCoachProfile, saveCoachProfile, syncCoachProfile, type CoachProfile,
} from '../utils/coachProfile';

jest.mock('../utils/api', () => ({ apiFetch: jest.fn() }));

const UID = 42;
const KEY = `${COACH_PROFILE_KEY}_${UID}`;
const MINE: CoachProfile = {
  goal: 'strength', experience: 'advanced', equipment: 'home_barbell',
  days_per_week: 4, session_length_min: 75, avoid: ['knees'], notes: 'Left wrist.',
};
const SERVERS: CoachProfile = { ...MINE, goal: 'hypertrophy', avoid: [] };

const respond = (status: number, body: any = {}) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });
const mockApi = jest.mocked(apiFetch);
const stored = async () => JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
const calls = (method: string) => mockApi.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);
const flush = () => new Promise(r => setTimeout(r, 0));

function server({ get = respond(200, { profile: null }), put = respond(200, { profile: {} }) } = {}) {
  mockApi.mockImplementation(async (_path: string, init?: any) => (init?.method === 'PUT' ? put : get) as any);
}

describe('coach profile sync', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('uploads a copy an older build wrote, and does not pull over it', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(MINE));
    server({ get: respond(200, { profile: SERVERS }) });

    expect(await syncCoachProfile(UID)).toEqual(MINE);
    expect(calls('GET')).toHaveLength(0);
    expect(JSON.parse(calls('PUT')[0][1]!.body as string)).toEqual(MINE);
    expect(await stored()).toEqual({ ...MINE, synced: true });
  });

  it('gives a reinstall the server copy back', async () => {
    server({ get: respond(200, { profile: { ...SERVERS, updated_at: '2026-11-11T10:00:00' } }) });
    expect(await syncCoachProfile(UID)).toEqual(SERVERS);
    expect(await stored()).toEqual({ ...SERVERS, synced: true });
    expect(await loadCoachProfile(UID)).toEqual(SERVERS);
  });

  it('pulls an edit made on another phone over a synced copy', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...MINE, synced: true }));
    server({ get: respond(200, { profile: SERVERS }) });
    expect(await syncCoachProfile(UID)).toEqual(SERVERS);
    expect(calls('PUT')).toHaveLength(0);
  });

  it('leaves an account with no profile anywhere without one', async () => {
    server();
    expect(await syncCoachProfile(UID)).toBeNull();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(calls('PUT')).toHaveLength(0);
  });

  it('sends a synced copy again when the server has none', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...MINE, synced: true }));
    server();
    expect(await syncCoachProfile(UID)).toEqual(MINE);
    expect(calls('PUT')).toHaveLength(1);
  });

  it('keeps the device copy offline or on a server error', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...MINE, synced: true }));
    mockApi.mockRejectedValue(new Error('Network request failed'));
    expect(await syncCoachProfile(UID)).toEqual(MINE);
    server({ get: respond(500) });
    expect(await syncCoachProfile(UID)).toEqual(MINE);
    expect(await stored()).toEqual({ ...MINE, synced: true });
  });

  it('a save that could not upload is sent on the next sync, not pulled over', async () => {
    server({ put: respond(500), get: respond(200, { profile: SERVERS }) });
    await saveCoachProfile(UID, MINE);
    await flush();
    expect(await stored()).toEqual({ ...MINE, synced: false });

    server({ get: respond(200, { profile: SERVERS }) });
    expect(await syncCoachProfile(UID)).toEqual(MINE);
    expect(calls('GET')).toHaveLength(0);
    expect(await stored()).toEqual({ ...MINE, synced: true });
  });

  it('a save made while a pull is out is not overwritten by its answer', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...MINE, synced: true }));
    let answer: (v: any) => void = () => {};
    mockApi.mockImplementation((_p: string, init?: any) =>
      init?.method === 'PUT' ? Promise.resolve(respond(500) as any) : new Promise(res => { answer = res; }));
    const syncing = syncCoachProfile(UID);
    await flush();
    const edited = { ...MINE, notes: 'Edited while syncing.' };
    await saveCoachProfile(UID, edited);
    answer(respond(200, { profile: SERVERS }));

    expect(await syncing).toEqual(edited);
    expect(await stored()).toEqual({ ...edited, synced: false });
  });

  it('an upload that finishes after a newer save does not mark the newer one synced', async () => {
    let finishFirst: (v: any) => void = () => {};
    mockApi
      .mockImplementationOnce(() => new Promise(res => { finishFirst = res; }))
      .mockImplementation(async () => respond(500) as any);
    await saveCoachProfile(UID, MINE);
    const newer = { ...MINE, days_per_week: 5 };
    await saveCoachProfile(UID, newer);
    finishFirst(respond(200));
    await flush();
    expect(await stored()).toEqual({ ...newer, synced: false });
  });

  it('a save whose upload lands before a pull answers is not overwritten by the pull', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...MINE, synced: true }));
    let answer: (v: any) => void = () => {};
    mockApi.mockImplementation((_p: string, init?: any) =>
      init?.method === 'PUT' ? Promise.resolve(respond(200) as any) : new Promise(res => { answer = res; }));
    const syncing = syncCoachProfile(UID);
    await flush();
    const edited = { ...MINE, avoid: ['knees', 'shoulders'] };
    await saveCoachProfile(UID, edited);
    await flush();
    expect(await stored()).toEqual({ ...edited, synced: true });   // its own upload already finished

    answer(respond(200, { profile: SERVERS }));
    expect(await syncing).toEqual(edited);
    expect(await stored()).toEqual({ ...edited, synced: true });
  });

  it('two quick saves reach the server one after the other, newest last', async () => {
    const order: string[] = [];
    let finishFirst: (v: any) => void = () => {};
    mockApi
      .mockImplementationOnce((_p: string, init?: any) => {
        order.push(JSON.parse(init.body).notes);
        return new Promise(res => { finishFirst = res; });
      })
      .mockImplementation(async (_p: string, init?: any) => {
        order.push(JSON.parse(init.body).notes);
        return respond(200) as any;
      });
    await saveCoachProfile(UID, { ...MINE, notes: 'first' });
    await saveCoachProfile(UID, { ...MINE, notes: 'second' });
    await flush();
    expect(order).toEqual(['first']);   // the second waits its turn

    finishFirst(respond(200));
    await flush();
    await flush();
    expect(order).toEqual(['first', 'second']);
    expect(await stored()).toEqual({ ...MINE, notes: 'second', synced: true });
  });

  it('two syncs at once share one request', async () => {
    server({ get: respond(200, { profile: SERVERS }) });
    const [a, b] = await Promise.all([syncCoachProfile(UID), syncCoachProfile(UID)]);
    expect(a).toEqual(SERVERS);
    expect(b).toEqual(SERVERS);
    expect(calls('GET')).toHaveLength(1);
  });

  it('fills fields an old copy lacks with the defaults and drops unknown ones', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ goal: 'strength', avoid: ['knees'], stray: 1 }));
    expect(await loadCoachProfile(UID)).toEqual({ ...DEFAULT_PROFILE, goal: 'strength', avoid: ['knees'] });
  });

  it('does nothing without an account', async () => {
    expect(await syncCoachProfile(undefined)).toBeNull();
    await saveCoachProfile(undefined, MINE);
    expect(mockApi).not.toHaveBeenCalled();
  });
});
