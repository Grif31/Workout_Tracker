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
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

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
// The picker is mocked to a host element; call its onChange like the native side would.
const pickDate = (r: ReturnType<typeof render>, date: Date) =>
  act(() => { r.UNSAFE_getByType('DateTimePicker' as any).props.onChange({}, date); });

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

    it('shows the 7-day average of recent weigh-ins', async () => {
      routes['GET /api/bodyweight'] = () => ({ status: 200, body: [
        { id: 3, weight: 185, date: '2026-09-15T00:00:00' },
        { id: 2, weight: 186, date: '2026-09-12T00:00:00' },
        // 8 days before the latest: outside its window
        { id: 1, weight: 200, date: '2026-09-07T00:00:00' },
      ] });
      const r = await renderLoaded();
      expect(r.getByText('7-day avg 185.5 lbs')).toBeTruthy();
    });

    it('edits an entry from its history row', async () => {
      routes['PUT /api/bodyweight/1'] = () => ({ status: 200, body: { id: 1, weight: 187.5, date: '2026-09-01T00:00:00' } });
      const r = await renderLoaded();

      fireEvent.press(r.getByText('188 lbs'));
      expect(r.getByText('Edit Weight')).toBeTruthy();
      expect(r.getByPlaceholderText('Weight (lbs)').props.value).toBe('188');
      fireEvent.changeText(r.getByPlaceholderText('Weight (lbs)'), '187.5');
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      const [[, init]] = calls('PUT', '/api/bodyweight/1');
      expect(JSON.parse(init.body)).toEqual({ weight: 187.5, date: '2026-09-01' });
      expect(calls('POST', '/api/bodyweight')).toHaveLength(0);
      await waitFor(() => expect(r.getByText('187.5 lbs')).toBeTruthy());
      // The edited entry is older, so the current weight stays the newest one
      expect(updateUser).toHaveBeenCalledWith({ bodyweight: 186.4 });
    });

    it('logs a backdated weight without making it current', async () => {
      routes['POST /api/bodyweight'] = () => ({ status: 201, body: { id: 3, weight: 190, date: '2026-08-20T00:00:00' } });
      const r = await renderLoaded();

      pressAdd(r);
      fireEvent.changeText(r.getByPlaceholderText('Weight (lbs)'), '190');
      await pickDate(r, new Date(2026, 7, 20));
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      const [[, init]] = calls('POST', '/api/bodyweight');
      expect(JSON.parse(init.body).date).toBe('2026-08-20');
      expect(updateUser).toHaveBeenCalledWith({ bodyweight: 186.4 });
      // Sorted into history below the newer entries, not prepended
      await waitFor(() => expect(r.getByText('190 lbs')).toBeTruthy());
      const rows = r.getAllByText(/^\d+(\.\d)? lbs$/).map(t => [].concat(t.props.children).join(''));
      expect(rows.slice(-3)).toEqual(['186.4 lbs', '188 lbs', '190 lbs']);
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
      fireEvent.changeText(r.getByLabelText('Waist'), '31.5');
      fireEvent.changeText(r.getByLabelText('Right Arm'), '15');
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
      fireEvent.changeText(r.getByLabelText('Waist'), '31');
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Save Measurement", expect.any(String)));
    });

    it('shows each measurement with its unit and change since last and since start', async () => {
      routes['GET /api/measurements'] = () => ({ status: 200, body: [
        { id: 7, date: '2026-09-10T00:00:00', waist: 32, chest: null, right_arm: null, left_arm: null, right_leg: null, left_leg: null },
        { id: 6, date: '2026-08-10T00:00:00', waist: 32.5, chest: 41, right_arm: null, left_arm: null, right_leg: null, left_leg: null },
        { id: 5, date: '2026-07-10T00:00:00', waist: 33.5, chest: 40, right_arm: null, left_arm: null, right_leg: null, left_leg: null },
      ] });
      const r = await renderLoaded();
      await openTab(r);

      expect(r.getByText('−0.5 since last')).toBeTruthy();
      expect(r.getByText('−1.5 since start')).toBeTruthy();
      // Chest's latest comes from the newest entry that has it, not a blank
      expect(r.getByText('+1 since last')).toBeTruthy();
      expect(r.getAllByText(/^\s*in$/).length).toBe(2);
    });

    it('edits a measurement, clearing a field left blank', async () => {
      routes['PUT /api/measurements/5'] = () => ({
        status: 200,
        body: { id: 5, date: '2026-09-10T00:00:00', waist: 32, chest: null, right_arm: null, left_arm: null, right_leg: null, left_leg: null },
      });
      const r = await renderLoaded();
      await openTab(r);

      fireEvent.press(r.getByText(/Waist: 32\.5/));
      expect(r.getByText('Edit Measurements')).toBeTruthy();
      expect(r.getByLabelText('Waist').props.value).toBe('32.5');
      fireEvent.changeText(r.getByLabelText('Waist'), '32');
      fireEvent.changeText(r.getByLabelText('Chest'), '');
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      const [[, init]] = calls('PUT', '/api/measurements/5');
      expect(JSON.parse(init.body)).toEqual({
        waist: 32, chest: null, right_arm: null, left_arm: null, right_leg: null, left_leg: null,
        date: '2026-09-10',
      });
      await waitFor(() => expect(r.getByText(/^Waist: 32$/)).toBeTruthy());
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
      expect(calls('POST', '/api/progress-photos')).toHaveLength(0);
      fireEvent.changeText(r.getByPlaceholderText('Notes (optional)'), '  Week 4, morning  ');
      await act(async () => { fireEvent.press(r.getByText('Upload')); });

      expect(calls('POST', '/api/progress-photos')).toHaveLength(1);
      expect(append).toHaveBeenCalledWith('photo', { uri: 'file:///tmp/IMG_0042.png', name: 'IMG_0042.png', type: 'image/png' });
      expect(append).toHaveBeenCalledWith('notes', 'Week 4, morning');
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
      await act(async () => { fireEvent.press(r.getByText('Upload')); });
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Upload Photo", expect.any(String)));
      // The picked photo stays staged so the upload can be retried
      expect(r.getByText('Upload')).toBeTruthy();
    });

    it('compares two photos side by side, older on the left', async () => {
      const older = { id: 8, date: '2026-08-13T00:00:00', photo_url: 'https://x/static/progress_photos/1_0.jpg', notes: 'Start' };
      routes['GET /api/progress-photos'] = () => ({ status: 200, body: [PHOTOS[0], older] });
      const r = await renderLoaded();
      await openTab(r);

      fireEvent.press(r.getByText('Compare'));
      fireEvent.press(photoImages(r, PHOTOS[0].photo_url)[0]);
      fireEvent.press(photoImages(r, older.photo_url)[0]);

      expect(r.getByText('30 days apart')).toBeTruthy();
      const uris = r.UNSAFE_getAllByType(Image).map(i => i.props.source?.uri);
      const pair = uris.slice(-2);
      expect(pair).toEqual([older.photo_url, PHOTOS[0].photo_url]);
      expect(r.getByText('Start')).toBeTruthy();
      // Selecting photos in compare mode never opens the single-photo view
      expect(r.queryByText('Delete')).toBeNull();

      fireEvent.press(r.getByLabelText('Close comparison'));
      expect(r.queryByText('30 days apart')).toBeNull();
      expect(r.getByText('Compare')).toBeTruthy();
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
