/**
 * Supersets in the workout log: pairing from the exercise menu, rest once per
 * round instead of after every set, and the groups reaching the save payload.
 * The rules themselves are covered in supersets.test.ts.
 */
import React from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, act, waitFor, within } from '@testing-library/react-native';
import WorkoutLog from '../components/WorkoutLog';

jest.mock('react-native-gesture-handler', () => {
  const { View, ScrollView } = require('react-native');
  return {
    ScrollView,
    Swipeable: ({ children }: any) => <View>{children}</View>,
    GestureHandlerRootView: ({ children }: any) => children,
    PanGestureHandler: ({ children }: any) => <View>{children}</View>,
  };
});
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../components/ExerciseList', () => () => null);
jest.mock('../components/NewExerciseForm', () => () => null);
jest.mock('../utils/layoutAnimation', () => ({ animateNextRowChange: jest.fn(), animateNextLayout: jest.fn() }));
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['Chest', 'Back', 'Quads'] }), { virtual: true });
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('../components/workout/RestTimer', () => {
  const { View } = require('react-native');
  return () => <View testID="rest-timer" />;
});
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: () => Promise.resolve({ isConnected: true, isInternetReachable: true }),
    addEventListener: () => () => {},
  },
}));
jest.mock('../utils/offlineQueue', () => ({ enqueueWorkout: jest.fn(() => Promise.resolve()) }));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../utils/notifications', () => ({
  scheduleRestTimerAlert: jest.fn(),
  cancelRestTimerAlert: jest.fn(),
  postLiveWorkoutNotification: jest.fn(),
  cancelLiveWorkoutNotification: jest.fn(),
}));
jest.mock('../utils/healthKit', () => ({ syncWorkoutToHealthKit: jest.fn() }));
jest.mock('../utils/healthConnect', () => ({ syncWorkoutToHealthConnect: jest.fn() }));

const strength = (name: string, id: number, superset_group: number | null = null, sets = 2) => ({
  name, exercise_template_id: id, exercise_type: 'strength', equipment: 'Barbell', superset_group,
  sets: Array.from({ length: sets }, () => ({ reps: '8', weight: '100', set_type: 'N' })),
});

const prefill = (...exercises: any[]) => ({ name: 'Push Day', notes: '', exercises });

const SAVE_URL = /\/api\/workouts(\/\d+)?$/;
const isSaveCall = (url: any, init: any) => SAVE_URL.test(String(url)) && ['POST', 'PATCH'].includes(init?.method);
function mockServer() {
  (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) => {
    const body = isSaveCall(url, init) ? { id: 42, new_prs: [] } : [];
    return Promise.resolve({ ok: true, status: isSaveCall(url, init) ? 201 : 200, json: () => Promise.resolve(body) });
  });
}
const saveBody = () => {
  const call = (global.fetch as jest.Mock).mock.calls.find(([url, init]) => isSaveCall(url, init));
  return JSON.parse(call[1].body);
};

const settleMenuDismiss = () => {
  act(() => { jest.advanceTimersByTime(200); });
  act(() => { jest.advanceTimersByTime(600); });
};
const pressMenu = (getByTestId: any, idx: number) =>
  fireEvent.press(getByTestId(`exercise-menu-${idx}`), { nativeEvent: { pageX: 300, pageY: 200 } });

describe('WorkoutLog supersets: the exercise menu', () => {
  beforeEach(() => { jest.useFakeTimers(); mockServer(); });
  afterEach(() => jest.useRealTimers());

  it('pairs two exercises from the menu, moving the partner up', () => {
    const { getByTestId, getByText, getAllByText, getByLabelText } = render(
      <WorkoutLog prefill={prefill(strength('Bench Press', 1), strength('Squat', 2), strength('Barbell Row', 3)) as any}
        onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    pressMenu(getByTestId, 0);
    fireEvent.press(getByText('Superset With...'));
    settleMenuDismiss();
    fireEvent.press(getByLabelText('Superset with Barbell Row'));

    expect(getByText('A1')).toBeTruthy();
    expect(getByText('A2')).toBeTruthy();
    expect(getAllByText(/Superset A/i).length).toBeGreaterThan(0);
    // Row now sits right after Bench, ahead of Squat
    const names = getAllByText(/^(Bench Press|Squat|Barbell Row)$/).map(n => n.props.children);
    expect(names).toEqual(['Bench Press', 'Barbell Row', 'Squat']);
  });

  it('leaves cardio out of the picker', () => {
    const run = { name: 'Treadmill', exercise_template_id: 9, exercise_type: 'cardio', sets: [{ cardio_duration: '10', distance: '1' }] };
    const { getByTestId, getByText, queryByLabelText } = render(
      <WorkoutLog prefill={prefill(strength('Bench Press', 1), strength('Squat', 2), run) as any}
        onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    pressMenu(getByTestId, 0);
    fireEvent.press(getByText('Superset With...'));
    settleMenuDismiss();
    expect(queryByLabelText('Superset with Squat')).not.toBeNull();
    expect(queryByLabelText('Superset with Treadmill')).toBeNull();
  });

  it('hides the menu item when there is nothing to pair with', () => {
    const { getByTestId, queryByText } = render(
      <WorkoutLog prefill={prefill(strength('Bench Press', 1)) as any} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    pressMenu(getByTestId, 0);
    expect(queryByText('Superset With...')).toBeNull();
  });

  it('removes an exercise from its superset', () => {
    const { getByTestId, getByText, queryByText } = render(
      <WorkoutLog prefill={prefill(strength('Bench Press', 1, 1), strength('Barbell Row', 3, 1)) as any}
        onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByText('A1')).toBeTruthy();
    pressMenu(getByTestId, 0);
    fireEvent.press(getByText('Remove from Superset'));
    expect(queryByText('A1')).toBeNull();
    expect(queryByText('A2')).toBeNull();
  });
});

describe('WorkoutLog supersets: rest once per round', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockServer();
    jest.spyOn(AsyncStorage, 'getItem').mockImplementation(async (key: string) =>
      key.startsWith('workout_auto_rest') ? 'true' : null);
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  const doneButtons = (utils: any) => utils.getAllByLabelText('Set 1 done');

  it('starts rest only after the last member of the round', async () => {
    const utils = render(
      <WorkoutLog prefill={prefill(strength('Bench Press', 1, 1), strength('Barbell Row', 3, 1)) as any}
        onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    await act(async () => {});
    const [benchSet1, rowSet1] = doneButtons(utils);

    fireEvent.press(benchSet1);
    expect(utils.queryByTestId('rest-timer')).toBeNull();

    fireEvent.press(rowSet1);
    expect(utils.queryByTestId('rest-timer')).not.toBeNull();
  });

  it('still rests after every set outside a superset', async () => {
    const utils = render(
      <WorkoutLog prefill={prefill(strength('Bench Press', 1), strength('Barbell Row', 3)) as any}
        onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    await act(async () => {});
    fireEvent.press(doneButtons(utils)[0]);
    expect(utils.queryByTestId('rest-timer')).not.toBeNull();
  });
});

describe('WorkoutLog supersets: the keyboard', () => {
  beforeEach(() => { jest.useFakeTimers(); mockServer(); });
  afterEach(() => jest.useRealTimers());

  it("Next goes from one member's set to the partner's", () => {
    const { TextInput, Keyboard } = require('react-native');
    const listeners: Record<string, (e: any) => void> = {};
    const addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation(((evt: string, fn: any) => {
      listeners[evt] = fn;
      return { remove: () => {} };
    }) as any);
    const focus = TextInput.prototype.focus as jest.Mock;
    focus.mockClear();
    const utils = render(
      <WorkoutLog prefill={prefill(strength('Bench Press', 1, 1), strength('Barbell Row', 3, 1)) as any}
        onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    // Which input got focus, as "label #n" (n counts inputs with that label, top down)
    const focused = () => {
      const all = utils.UNSAFE_getAllByType(TextInput);
      const node: any = all.find((n: any) => n.instance === focus.mock.contexts.at(-1));
      if (!node) return null;
      const same = all.filter((n: any) => n.props.accessibilityLabel === node.props.accessibilityLabel);
      return `${node.props.accessibilityLabel} #${same.indexOf(node) + 1}`;
    };

    fireEvent(utils.getAllByLabelText('Set 1 weight')[0], 'focus');
    act(() => { listeners.keyboardWillShow?.({ endCoordinates: { screenY: 500 } }); });
    fireEvent.press(utils.getByLabelText('Next field'));
    // Row's first set, not Bench's second
    expect(focused()).toBe('Set 1 reps #2');
    addListener.mockRestore();
  });
});

describe('WorkoutLog supersets: saving', () => {
  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    mockServer();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: any[]) => {
      buttons?.find(b => b.text === 'Check Off & Save')?.onPress?.();
    });
  });
  afterEach(() => alertSpy.mockRestore());

  it('sends each exercise’s group, renumbered from 1', async () => {
    const onSubmit = jest.fn();
    const { getByText } = render(
      <WorkoutLog prefill={prefill(strength('Squat', 2), strength('Bench Press', 1, 7), strength('Barbell Row', 3, 7)) as any}
        onSubmit={onSubmit} onCancel={jest.fn()} />,
    );
    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(saveBody().exercises.map((e: any) => [e.name, e.superset_group])).toEqual([
      ['Squat', null], ['Bench Press', 1], ['Barbell Row', 1],
    ]);
  });
});
