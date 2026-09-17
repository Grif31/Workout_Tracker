import React from 'react';
import { Alert, Image } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { createMockNavigation, createMockRoute } from './testUtils';
import MeasurementsScreen from '../screens/ProfileTab/MeasurementsScreen';
import { toLocalDateStr } from '../utils/date';

jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

const { updateUser } = require('../context/AuthContext').useAuth();
const nav = createMockNavigation();
const route = createMockRoute('Measurements');

type Handler = (init: any) => { status: number; body?: any } | Error;
let routes: Record<string, Handler>;

const BW_LOGS = [
  { id: 2, weight: 186.4, date: '2026-09-15T00:00:00' },
  { id: 1, weight: 188, date: '2026-09-01T00:00:00' },
];
const MEASUREMENTS = [
  { id: 5, date: '2026-09-10T00:00:00', waist: 32.5, chest: 41, right_arm: null, left_arm: null, right_leg: null, left_leg: null },
];
const PHOTOS = [
  { id: 9, date: '2026-09-12T00:00:00', photo_url: 'https://x/static/progress_photos/1_1.jpg', notes: null },
];

function installServer() {
  routes = {
    'GET /api/bodyweight': () => ({ status: 200, body: BW_LOGS }),
    'GET /api/measurements': () => ({ status: 200, body: MEASUREMENTS }),
    'GET /api/progress-photos': () => ({ status: 200, body: PHOTOS }),
  };
  (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    const handler = routes[`${init.method ?? 'GET'} ${path}`];
    if (!handler) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    const result = handler(init);
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve({ ok: result.status < 300, status: result.status, json: () => Promise.resolve(result.body ?? {}) });
  });
}

const calls = (method: string, path: string) =>
  (global.fetch as jest.Mock).mock.calls.filter(([url, init]) =>
    (init?.method ?? 'GET') === method && String(url).endsWith(path));

function spyAlerts(pick?: string) {
  return jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: any[]) => {
    if (pick) buttons?.find(b => b.text === pick)?.onPress?.();
  });
}

async function renderLoaded() {
  const utils = render(<MeasurementsScreen navigation={nav as any} route={route as any} />);
  await waitFor(() => expect(utils.getByText('History')).toBeTruthy());
  return utils;
}

const pressAdd = (r: ReturnType<typeof render>) => fireEvent.press(r.UNSAFE_getAllByProps({ name: 'add' })[0]);
const photoImages = (r: ReturnType<typeof render>, uri: string) =>
  r.UNSAFE_getAllByType(Image).filter(i => i.props.source?.uri === uri);
const pressTrash = (r: ReturnType<typeof render>, index = 0) =>
  fireEvent.press(r.UNSAFE_getAllByProps({ name: 'trash-outline' })[index]);

describe('MeasurementsScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    installServer();
    alertSpy = spyAlerts();
  });
  afterEach(() => alertSpy.mockRestore());

  describe('bodyweight', () => {
    it('shows the latest weight and the history', async () => {
      const r = await renderLoaded();
      // Current card plus its history row, then the older row.
      expect(r.getAllByText('186.4 lbs')).toHaveLength(2);
      expect(r.getByText('188 lbs')).toBeTruthy();
    });

    it("saves a weight for today's local date and makes it current", async () => {
      routes['POST /api/bodyweight'] = () => ({ status: 201, body: { id: 3, weight: 184.2, date: '2026-09-17T00:00:00' } });
      const r = await renderLoaded();

      pressAdd(r);
      fireEvent.changeText(r.getByPlaceholderText('Weight (lbs)'), '184.2');
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      const [[, init]] = calls('POST', '/api/bodyweight');
      expect(JSON.parse(init.body)).toEqual({ weight: 184.2, date: toLocalDateStr(new Date()) });
      await waitFor(() => expect(r.getAllByText('184.2 lbs')).toHaveLength(2));
      expect(updateUser).toHaveBeenCalledWith({ bodyweight: 184.2 });
      expect(r.queryByPlaceholderText('Weight (lbs)')).toBeNull();
    });

    it.each(['', 'abc', '0', '-5'])('rejects %p without calling the server', async input => {
      const r = await renderLoaded();
      pressAdd(r);
      fireEvent.changeText(r.getByPlaceholderText('Weight (lbs)'), input);
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      expect(alertSpy).toHaveBeenCalledWith('Invalid weight', expect.any(String));
      expect(calls('POST', '/api/bodyweight')).toHaveLength(0);
    });

    it('keeps the dialog open and the old weight when saving fails', async () => {
      routes['POST /api/bodyweight'] = () => ({ status: 500 });
      const r = await renderLoaded();

      pressAdd(r);
      fireEvent.changeText(r.getByPlaceholderText('Weight (lbs)'), '184');
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Save Bodyweight", expect.any(String)));
      expect(r.getByPlaceholderText('Weight (lbs)').props.value).toBe('184');
      expect(updateUser).not.toHaveBeenCalled();
    });

    it('deletes an entry and falls back to the next latest weight', async () => {
      alertSpy.mockRestore();
      alertSpy = spyAlerts('Delete');
      routes['DELETE /api/bodyweight/2'] = () => ({ status: 200 });
      const r = await renderLoaded();

      await act(async () => { pressTrash(r, 0); });

      expect(calls('DELETE', '/api/bodyweight/2')).toHaveLength(1);
      await waitFor(() => expect(r.queryByText('186.4 lbs')).toBeNull());
      expect(updateUser).toHaveBeenCalledWith({ bodyweight: 188 });
    });

    it('clears the bodyweight when the last entry is deleted', async () => {
      alertSpy.mockRestore();
      alertSpy = spyAlerts('Delete');
      routes['GET /api/bodyweight'] = () => ({ status: 200, body: [BW_LOGS[0]] });
      routes['DELETE /api/bodyweight/2'] = () => ({ status: 200 });
      const r = await renderLoaded();

      await act(async () => { pressTrash(r, 0); });
      await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ bodyweight: null }));
    });

    it('keeps the entry and says so when the delete fails', async () => {
      alertSpy.mockRestore();
      alertSpy = spyAlerts('Delete');
      routes['DELETE /api/bodyweight/2'] = () => ({ status: 500 });
      const r = await renderLoaded();

      await act(async () => { pressTrash(r, 0); });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Delete Entry", expect.any(String)));
      expect(r.getAllByText('186.4 lbs').length).toBeGreaterThan(0);
      expect(updateUser).not.toHaveBeenCalled();
    });

    it('does not delete when cancelled', async () => {
      alertSpy.mockRestore();
      alertSpy = spyAlerts('Cancel');
      const r = await renderLoaded();
      await act(async () => { pressTrash(r, 0); });
      expect(calls('DELETE', '/api/bodyweight/2')).toHaveLength(0);
    });
  });

  describe('measurements', () => {
    const openTab = async (r: ReturnType<typeof render>) => {
      fireEvent.press(r.getAllByText('Measurements')[1]);
      await waitFor(() => expect(r.getByText('R Arm')).toBeTruthy());
    };

    it('saves only the filled-in fields, sending blanks as null', async () => {
      routes['POST /api/measurements'] = () => ({
        status: 201,
        body: { id: 6, date: '2026-09-17T00:00:00', waist: 31.5, chest: null, right_arm: 15, left_arm: null, right_leg: null, left_leg: null },
      });
      const r = await renderLoaded();
      await openTab(r);

      pressAdd(r);
      fireEvent.changeText(r.getByPlaceholderText('Waist (optional)'), '31.5');
      fireEvent.changeText(r.getByPlaceholderText('Right Arm (optional)'), '15');
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      const [[, init]] = calls('POST', '/api/measurements');
      expect(JSON.parse(init.body)).toEqual({
        waist: 31.5, chest: null, right_arm: 15, left_arm: null, right_leg: null, left_leg: null,
        date: toLocalDateStr(new Date()),
      });
      await waitFor(() => expect(r.getByText(/Waist: 31\.5/)).toBeTruthy());
    });

    it('refuses to save an empty measurement', async () => {
      const r = await renderLoaded();
      await openTab(r);
      pressAdd(r);
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      expect(alertSpy).toHaveBeenCalledWith('Empty', expect.any(String));
      expect(calls('POST', '/api/measurements')).toHaveLength(0);
    });

    it('alerts when saving fails', async () => {
      routes['POST /api/measurements'] = () => ({ status: 400 });
      const r = await renderLoaded();
      await openTab(r);
      pressAdd(r);
      fireEvent.changeText(r.getByPlaceholderText('Waist (optional)'), '31');
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Save Measurement", expect.any(String)));
    });

    it('deletes a measurement, and alerts instead when the delete fails', async () => {
      alertSpy.mockRestore();
      alertSpy = spyAlerts('Delete');
      routes['DELETE /api/measurements/5'] = () => ({ status: 500 });
      const r = await renderLoaded();
      await openTab(r);

      await act(async () => { pressTrash(r, 0); });
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Delete Measurement", expect.any(String)));
      expect(r.getByText(/Waist: 32\.5/)).toBeTruthy();

      routes['DELETE /api/measurements/5'] = () => ({ status: 200 });
      await act(async () => { pressTrash(r, 0); });
      await waitFor(() => expect(r.queryByText(/Waist: 32\.5/)).toBeNull());
    });
  });

  describe('progress photos', () => {
    const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
    const openTab = async (r: ReturnType<typeof render>) => {
      fireEvent.press(r.getByText('Photos'));
      await waitFor(() => expect(r.queryByText('History')).toBeNull());
    };

    it('uploads a picked photo and adds it to the grid', async () => {
      picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ status: 'granted' } as any);
      picker.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false, assets: [{ uri: 'file:///tmp/IMG_0042.png' }],
      } as any);
      routes['POST /api/progress-photos'] = () => ({
        status: 201, body: { id: 10, date: '2026-09-17T00:00:00', photo_url: 'https://x/static/progress_photos/1_2.png', notes: null },
      });
      const append = jest.spyOn(FormData.prototype, 'append');
      const r = await renderLoaded();
      await openTab(r);

      await act(async () => { pressAdd(r); });

      expect(calls('POST', '/api/progress-photos')).toHaveLength(1);
      expect(append).toHaveBeenCalledWith('photo', { uri: 'file:///tmp/IMG_0042.png', name: 'IMG_0042.png', type: 'image/png' });
      append.mockRestore();
      await waitFor(() => expect(photoImages(r, 'https://x/static/progress_photos/1_2.png')).toHaveLength(1));
      expect(photoImages(r, PHOTOS[0].photo_url)).toHaveLength(1);
    });

    it('does not upload without photo library permission', async () => {
      picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as any);
      const r = await renderLoaded();
      await openTab(r);

      await act(async () => { pressAdd(r); });

      expect(alertSpy).toHaveBeenCalledWith('Permission required', expect.any(String));
      expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
      expect(calls('POST', '/api/progress-photos')).toHaveLength(0);
    });

    it('does nothing when the picker is cancelled', async () => {
      picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ status: 'granted' } as any);
      picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true } as any);
      const r = await renderLoaded();
      await openTab(r);

      await act(async () => { pressAdd(r); });
      expect(calls('POST', '/api/progress-photos')).toHaveLength(0);
    });

    it('alerts when the upload fails', async () => {
      picker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ status: 'granted' } as any);
      picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///tmp/a.jpg' }] } as any);
      routes['POST /api/progress-photos'] = () => ({ status: 400 });
      const r = await renderLoaded();
      await openTab(r);

      await act(async () => { pressAdd(r); });
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Upload Photo", expect.any(String)));
    });

    it('deletes a photo from the full-screen view', async () => {
      alertSpy.mockRestore();
      alertSpy = spyAlerts('Delete');
      routes['DELETE /api/progress-photos/9'] = () => ({ status: 200 });
      const r = await renderLoaded();
      await openTab(r);

      fireEvent.press(photoImages(r, PHOTOS[0].photo_url)[0]);
      await act(async () => { fireEvent.press(r.getByText('Delete')); });

      expect(calls('DELETE', '/api/progress-photos/9')).toHaveLength(1);
      await waitFor(() => expect(r.getByText(/No progress photos yet/)).toBeTruthy());
    });

    it('keeps the photo open and says so when the delete fails', async () => {
      alertSpy.mockRestore();
      alertSpy = spyAlerts('Delete');
      routes['DELETE /api/progress-photos/9'] = () => ({ status: 500 });
      const r = await renderLoaded();
      await openTab(r);

      fireEvent.press(photoImages(r, PHOTOS[0].photo_url)[0]);
      await act(async () => { fireEvent.press(r.getByText('Delete')); });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Delete Photo", expect.any(String)));
      expect(r.getByText('Delete')).toBeTruthy();
    });
  });
});
