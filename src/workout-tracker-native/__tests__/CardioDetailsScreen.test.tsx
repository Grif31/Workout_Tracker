/**
 * Cardio Details: the map + stats view for a finished GPS activity. Its own
 * work is reading one workout, deriving the stat row from the single cardio
 * set, decoding the route, and renaming or deleting the activity.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute, mockUser } from './testUtils';
import CardioDetailsScreen from '../screens/DashboardTab/CardioDetailsScreen';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
// The options menu is a native action sheet: pick an entry by index.
let mockSheetChoice = 2;  // Cancel
jest.mock('@expo/react-native-action-sheet', () => ({
  useActionSheet: () => ({
    showActionSheetWithOptions: (_opts: any, cb: (i: number) => void) => cb(mockSheetChoice),
  }),
}));

const UNIT_KEY = `gps_distance_unit_${mockUser.id}`;
const route = createMockRoute('CardioDetails', { workoutId: 42 });

// A 5 km run in 30 minutes, logged by a km user.
function workout(overrides: any = {}, setOverrides: any = {}) {
  return {
    id: 42,
    name: 'Morning Run',
    date: '2026-09-20T07:30:00',
    notes: null,
    exercises: [{
      name: 'Running',
      route_polyline: null,
      sets: [{ cardio_duration: 30, distance: 5, distance_unit: 'km', elevation_gain: null, ...setOverrides }],
    }],
    ...overrides,
  };
}

let handlers: Record<string, any>;

function installServer(get: any = workout()) {
  handlers = { GET: get, PATCH: { message: 'ok' }, DELETE: { message: 'ok' } };
  (global.fetch as jest.Mock) = jest.fn((_url: string, init: any = {}) => {
    const body = handlers[init.method ?? 'GET'];
    return Promise.resolve({
      ok: body !== null,
      status: body === null ? 500 : 200,
      json: () => Promise.resolve(body ?? {}),
    });
  });
}

// The kcal stat renders as "~420"; children may be a string or ['~', 420].
const kcalFrom = (r: any) => {
  const node = r.getAllByText(/^~\d+$/)[0];
  return parseInt(String([].concat(node.props.children).join('')).replace('~', ''), 10);
};

const callsWith = (method: string) =>
  (global.fetch as jest.Mock).mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

async function renderScreen() {
  const nav = createMockNavigation();
  const utils = render(<CardioDetailsScreen navigation={nav as any} route={route as any} />);
  await act(async () => {});
  return { ...utils, nav };
}

describe('CardioDetailsScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    installServer();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { alertSpy.mockRestore(); mockSheetChoice = 2; });

  it('shows the activity name and its stats', async () => {
    const { getByText, getAllByText } = await renderScreen();
    // The off-screen share card repeats the name and stats
    await waitFor(() => expect(getAllByText('Morning Run').length).toBeGreaterThan(0));
    expect(getAllByText('30m 0s').length).toBeGreaterThan(0);   // duration
    expect(getAllByText('5.00').length).toBeGreaterThan(0);    // distance
    expect(getAllByText('Duration').length).toBeGreaterThan(0);
  });

  it('shows the activity name over the map in readable text, not the accent text colour', async () => {
    // accentText is for text on an accent fill (black here, as with a light
    // accent); on bare map tiles it disappeared.
    const r = await renderScreen();
    const badge = await r.findByText('Running');
    const style = require('react-native').StyleSheet.flatten(badge.props.style);
    expect(style.color).toBe('#FFF');
  });

  it('labels the distance in the unit the user prefers', async () => {
    await AsyncStorage.setItem(UNIT_KEY, 'km');
    const { getAllByText } = await renderScreen();
    await waitFor(() => expect(getAllByText('km').length).toBeGreaterThan(0));
  });

  it('estimates calories from the pace, not from duration alone', async () => {
    const fast = await renderScreen();
    await waitFor(() => expect(fast.getAllByText('Morning Run').length).toBeGreaterThan(0));
    const fastKcal = kcalFrom(fast);
    fast.unmount();

    // Same 30 minutes, half the distance: a slower run burns less
    installServer(workout({}, { distance: 2.5 }));
    const slow = await renderScreen();
    await waitFor(() => expect(slow.getAllByText('Morning Run').length).toBeGreaterThan(0));
    const slowKcal = kcalFrom(slow);
    expect(fastKcal).toBeGreaterThan(slowKcal);
  });

  it('says when no route was recorded', async () => {
    const { getByText } = await renderScreen();
    await waitFor(() => expect(getByText('No route recorded')).toBeTruthy());
  });

  it('shows the notes when there are some', async () => {
    installServer(workout({ notes: 'Felt strong on the hills' }));
    const { getByText } = await renderScreen();
    await waitFor(() => expect(getByText('Felt strong on the hills')).toBeTruthy());
  });

  it('shows a fallback when the activity is missing', async () => {
    installServer(null);
    const { getByText } = await renderScreen();
    await waitFor(() => expect(getByText('Activity not found')).toBeTruthy());
  });

  describe('rename', () => {
    const openRename = async (r: any) => {
      await waitFor(() => expect(r.getAllByText('Morning Run').length).toBeGreaterThan(0));
      mockSheetChoice = 0;  // Rename Activity
      fireEvent.press(r.UNSAFE_getAllByProps({ name: 'ellipsis-horizontal' })[0]);
      await waitFor(() => expect(r.getByDisplayValue('Morning Run')).toBeTruthy());
    };

    it('saves a new name', async () => {
      const r = await renderScreen();
      await openRename(r);
      fireEvent.changeText(r.getByDisplayValue('Morning Run'), 'Hill Repeats');
      await act(async () => { fireEvent.press(r.getByText('Save')); });

      const [[, init]] = callsWith('PATCH');
      expect(JSON.parse(init.body)).toEqual({ workoutName: 'Hill Repeats' });
      await waitFor(() => expect(r.getAllByText('Hill Repeats').length).toBeGreaterThan(0));
    });

    it('ignores a blank name', async () => {
      const r = await renderScreen();
      await openRename(r);
      fireEvent.changeText(r.getByDisplayValue('Morning Run'), '   ');
      await act(async () => { fireEvent.press(r.getByText('Save')); });
      expect(callsWith('PATCH')).toHaveLength(0);
    });

    it('says so when the rename fails', async () => {
      const r = await renderScreen();
      await openRename(r);
      handlers.PATCH = null;
      fireEvent.changeText(r.getByDisplayValue('Morning Run'), 'Hill Repeats');
      await act(async () => { fireEvent.press(r.getByText('Save')); });
      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Rename Activity", expect.any(String)));
    });
  });
});
