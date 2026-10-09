/**
 * Premium's "Swap for Alternatives" in the exercise menu: the list comes from
 * the server (same muscle, other equipment, minus flagged injuries) and a pick
 * replaces the exercise in place. Free accounts don't see the item at all.
 */
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockUser } from './testUtils';
import WorkoutLog from '../components/WorkoutLog';
import { COACH_PROFILE_KEY } from '../components/coach/CoachProfileModal';

let mockPremium = true;
jest.mock('../context/PurchaseContext', () => ({ usePurchase: () => ({ isPremium: mockPremium }) }));

jest.mock('../components/ExerciseList', () => () => null);
jest.mock('react-native-gesture-handler', () => {
  const { View, ScrollView } = require('react-native');
  return {
    ScrollView,
    Swipeable: ({ children }: any) => <View>{children}</View>,
    GestureHandlerRootView: ({ children }: any) => children,
    PanGestureHandler: ({ children }: any) => <View>{children}</View>,
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return ({ children }: any) => <View>{children}</View>;
});
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../components/NewExerciseForm', () => () => null);
jest.mock('../utils/layoutAnimation', () => ({ animateNextRowChange: jest.fn(), animateNextLayout: jest.fn() }));
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['Chest', 'Back', 'Quads'] }), { virtual: true });
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const prefill = (over: object = {}) => ({
  name: 'Push Day', notes: '',
  exercises: [{
    name: 'Bench Press', exercise_template_id: 11, exercise_type: 'strength', muscle_group: 'Chest',
    equipment: 'Barbell', sets: [{ reps: '8', weight: '135' }], ...over,
  }],
});

const ALTERNATIVES = [
  { id: 42, name: 'Bench Press', muscle_group: 'Chest', equipment: 'Dumbbell', exercise_type: 'strength', same_movement: true },
  { id: 43, name: 'Cable Fly', muscle_group: 'Chest', equipment: 'Cable', exercise_type: 'strength', same_movement: false },
];

const json = (body: any) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const altCalls = () => (global.fetch as jest.Mock).mock.calls.filter(c => String(c[0]).includes('/alternatives'));

const settleMenuDismiss = () => {
  act(() => { jest.advanceTimersByTime(200); });
  act(() => { jest.advanceTimersByTime(600); });
};
const pressMenu = (getByTestId: any) =>
  fireEvent.press(getByTestId('exercise-menu-0'), { nativeEvent: { pageX: 300, pageY: 200 } });

describe('WorkoutLog, swap for alternatives', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    mockPremium = true;
    await AsyncStorage.clear();
    (global.fetch as jest.Mock) = jest.fn(async (url: string) =>
      String(url).includes('/alternatives') ? json({ alternatives: ALTERNATIVES }) : json([]));
  });
  afterEach(() => jest.useRealTimers());

  const renderLog = (data = prefill()) =>
    render(<WorkoutLog prefill={data as any} onSubmit={jest.fn()} onCancel={jest.fn()} />);

  it('lists alternatives from the server and swaps the exercise in place', async () => {
    const r = renderLog();
    pressMenu(r.getByTestId);
    fireEvent.press(r.getByText('Alternatives'));
    settleMenuDismiss();

    expect(await r.findByText('Swap Bench Press')).toBeTruthy();
    expect(altCalls()[0][0]).toContain('/api/exercises/11/alternatives?avoid=');
    expect(r.getByText('Dumbbell · Same movement')).toBeTruthy();

    await act(async () => { fireEvent.press(r.getByLabelText('Swap to Cable Fly, Cable')); });
    await waitFor(() => expect(r.getByText('Cable Fly')).toBeTruthy());
    expect(r.queryByText('Barbell')).toBeNull();
    expect(r.queryByText('Swap Bench Press')).toBeNull();
  });

  it('sends the injuries from the coach profile', async () => {
    await AsyncStorage.setItem(`${COACH_PROFILE_KEY}_${mockUser.id}`, JSON.stringify({ avoid: ['knees', 'lower_back'] }));
    const r = renderLog();
    pressMenu(r.getByTestId);
    fireEvent.press(r.getByText('Alternatives'));
    settleMenuDismiss();
    await r.findByText('Swap Bench Press');
    expect(altCalls()[0][0]).toContain('avoid=knees%2Clower_back');
    expect(await r.findByText(/skipping what loads your flagged injuries/)).toBeTruthy();
  });

  it('says so when nothing fits', async () => {
    (global.fetch as jest.Mock) = jest.fn(async () => json({ alternatives: [] }));
    const r = renderLog();
    pressMenu(r.getByTestId);
    fireEvent.press(r.getByText('Alternatives'));
    settleMenuDismiss();
    expect(await r.findByText('No other equipment options for this muscle.')).toBeTruthy();
  });

  it('keeps the exercise when the list is closed', async () => {
    const r = renderLog();
    pressMenu(r.getByTestId);
    fireEvent.press(r.getByText('Alternatives'));
    settleMenuDismiss();
    await r.findByText('Swap Bench Press');
    fireEvent.press(r.getByLabelText('Close swap list'));
    expect(r.queryByText('Swap Bench Press')).toBeNull();
    expect(r.getByText('Barbell')).toBeTruthy();
  });

  it('is not offered to a free account', () => {
    mockPremium = false;
    const r = renderLog();
    pressMenu(r.getByTestId);
    expect(r.getByText('Replace Exercise')).toBeTruthy();
    expect(r.queryByText('Alternatives')).toBeNull();
  });

  it('is not offered for cardio or an exercise with no library entry', () => {
    const cardio = renderLog(prefill({ exercise_type: 'cardio' }));
    pressMenu(cardio.getByTestId);
    expect(cardio.queryByText('Alternatives')).toBeNull();
    cardio.unmount();

    const custom = renderLog(prefill({ exercise_template_id: undefined }));
    pressMenu(custom.getByTestId);
    expect(custom.queryByText('Alternatives')).toBeNull();
  });
});

describe('WorkoutLog, next session target', () => {
  const LAST_SESSION = [
    { reps: '8', weight: '185', set_type: 'N', rpe: '7' },
    { reps: '8', weight: '185', set_type: 'N', rpe: '7' },
  ];
  beforeEach(async () => {
    jest.useFakeTimers();
    mockPremium = true;
    await AsyncStorage.clear();
    (global.fetch as jest.Mock) = jest.fn(async (url: string) =>
      String(url).includes('/last-session') ? json({ sets: LAST_SESSION }) : json([]));
  });
  afterEach(() => jest.useRealTimers());

  const renderWithHistory = async (data = prefill()) => {
    const r = render(<WorkoutLog prefill={data as any} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    // The menu item only appears once last session's sets have loaded
    await act(async () => { await Promise.resolve(); });
    return r;
  };

  it('shows last session and the target from the exercise menu', async () => {
    const r = await renderWithHistory();
    pressMenu(r.getByTestId);
    fireEvent.press(r.getByText("Today's Target"));
    settleMenuDismiss();

    expect(await r.findByText('8 x 185 lbs @ 7')).toBeTruthy();
    expect(r.getByText('8 x 190 lbs')).toBeTruthy();
    expect(r.getByText('Every set matched, so add weight.')).toBeTruthy();
    fireEvent.press(r.getByLabelText('Close target'));
    expect(r.queryByText('Target today')).toBeNull();
  });

  it('does not put a target row in the workout itself', async () => {
    const r = await renderWithHistory();
    expect(r.queryByText(/Target/)).toBeNull();
  });

  it('is not in the menu for a free account', async () => {
    mockPremium = false;
    const r = await renderWithHistory();
    pressMenu(r.getByTestId);
    expect(r.queryByText("Today's Target")).toBeNull();
  });

  it('is not in the menu without a last session to build on', async () => {
    (global.fetch as jest.Mock) = jest.fn(async () => json({ sets: [] }));
    const r = await renderWithHistory();
    pressMenu(r.getByTestId);
    expect(r.queryByText("Today's Target")).toBeNull();
  });
});
