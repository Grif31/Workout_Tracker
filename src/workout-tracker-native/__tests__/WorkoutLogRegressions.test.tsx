import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
jest.mock('react-native-gesture-handler/Swipeable', () => {
  const { View } = require('react-native');
  return ({ children }: any) => <View>{children}</View>;
});
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../components/ExerciseList', () => () => null);
jest.mock('../components/NewExerciseForm', () => () => null);
jest.mock('../constants/muscleGroups', () => ({ muscleGroups: ['Chest', 'Back', 'Quads'] }));
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: () => Promise.resolve({ isConnected: true, isInternetReachable: true }),
    addEventListener: () => () => {},
  },
}));
const mockClearSession = jest.fn();
jest.mock('../context/WorkoutSessionContext', () => ({
  useWorkoutSession: () => ({
    session: null,
    saveSession: jest.fn(),
    clearSession: mockClearSession,
    isWorkoutOpen: true,
    setWorkoutOpen: jest.fn(),
  }),
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../utils/healthKit', () => ({ syncWorkoutToHealthKit: jest.fn() }));
jest.mock('../utils/healthConnect', () => ({ syncWorkoutToHealthConnect: jest.fn() }));
jest.mock('../utils/heartRateSync', () => ({ attachHeartRateToWorkout: jest.fn() }));

type Route = (url: string, init: any) => any | Promise<any> | undefined;
const json = (body: any, status = 200) => ({ ok: status < 300, status, json: () => Promise.resolve(body) });

// Routes return a body (or a promise of one); anything unrouted answers [].
function mockServer(route: Route = () => undefined) {
  (global.fetch as jest.Mock) = jest.fn(async (url: string, init: any = {}) => {
    const body = await route(String(url), init);
    return body === undefined ? json([]) : json(body);
  });
}

const SAVE_URL = /\/api\/workouts(\/\d+)?$/;
const saveCalls = () => (global.fetch as jest.Mock).mock.calls
  .filter(([url, init]) => SAVE_URL.test(String(url)) && ['POST', 'PATCH'].includes(init?.method));

function answerAlertsWith(buttonText: string) {
  return jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: any[]) => {
    buttons?.find(b => b.text === buttonText)?.onPress?.();
  });
}

const bench = (sets: any[]) => ({
  name: 'Bench Press', exercise_template_id: 7, exercise_type: 'strength', equipment: 'Barbell', sets,
});

describe('WorkoutLog regressions', () => {
  let alertSpy: jest.SpyInstance | undefined;

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => { alertSpy?.mockRestore(); alertSpy = undefined; });

  describe('editing an old workout leaves a minimized live workout alone', () => {
    const editPrefill = { name: 'Old Push', notes: '', exercises: [bench([{ reps: 5, weight: 225, set_type: 'N' }])] };

    it('on Update', async () => {
      alertSpy = answerAlertsWith('Check Off & Save');
      mockServer(url => (url.endsWith('/api/workouts/55') ? {} : undefined));
      const onSubmit = jest.fn();
      const { getByText } = render(
        <WorkoutLog prefill={editPrefill as any} editMode workoutId={55} onSubmit={onSubmit} onCancel={jest.fn()} />,
      );

      fireEvent.press(getByText('Update'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(55, undefined));
      expect(mockClearSession).not.toHaveBeenCalled();
    });

    it('on Discard Changes', () => {
      alertSpy = answerAlertsWith('Discard');
      mockServer();
      const onCancel = jest.fn();
      const { getByText } = render(
        <WorkoutLog prefill={editPrefill as any} editMode workoutId={55} onSubmit={jest.fn()} onCancel={onCancel} />,
      );

      fireEvent.press(getByText('Discard Changes'));
      expect(alertSpy.mock.calls[0][0]).toBe('Discard Changes?');
      expect(onCancel).toHaveBeenCalled();
      expect(mockClearSession).not.toHaveBeenCalled();
    });

    it('while a new workout still clears its own session on Discard', () => {
      alertSpy = answerAlertsWith('Discard');
      mockServer();
      const { getByText } = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.press(getByText('Discard Workout'));
      expect(mockClearSession).toHaveBeenCalled();
    });
  });

  describe('Check Off & Save', () => {
    it('drops blank sets instead of saving them as 0 x 0', async () => {
      alertSpy = answerAlertsWith('Check Off & Save');
      mockServer(url => (SAVE_URL.test(url) ? { id: 1 } : undefined));
      const onSubmit = jest.fn();
      const prefill = {
        name: 'Push', notes: '',
        exercises: [
          bench([{ reps: 5, weight: 225, set_type: 'N' }, { reps: '', weight: '', set_type: 'N' }]),
          { name: 'Fly', exercise_template_id: 8, exercise_type: 'strength', equipment: 'Cable', sets: [{ reps: '', weight: '' }] },
        ],
      };
      const { getByText } = render(<WorkoutLog prefill={prefill as any} editMode workoutId={3} onSubmit={onSubmit} onCancel={jest.fn()} />);

      fireEvent.press(getByText('Update'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      const { exercises } = JSON.parse(saveCalls()[0][1].body);
      expect(exercises.map((e: any) => e.name)).toEqual(['Bench Press']);
      expect(exercises[0].sets).toEqual([expect.objectContaining({ reps: 5, weight: 225 })]);
    });

    it('refuses to save when every set is blank', () => {
      const titles: string[] = [];
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, _m, buttons?: any[]) => {
        titles.push(title);
        buttons?.find(b => b.text === 'Check Off & Save')?.onPress?.();
      });
      mockServer();
      const prefill = { name: 'Push', notes: '', exercises: [bench([{ reps: '', weight: '' }])] };
      const { getByText } = render(<WorkoutLog prefill={prefill as any} editMode workoutId={3} onSubmit={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.press(getByText('Update'));
      expect(titles).toEqual(['Unchecked Sets', 'Nothing to Save']);
      expect(saveCalls()).toHaveLength(0);
    });
  });

  describe('PR banner matches what the server will save', () => {
    // Best ever: 320 x 1, and an estimated 1RM of 330 (from 300 x 3)
    const prRoutes: Route = url =>
      url.endsWith('/api/personal-records/7')
        ? { max_weight: 320, estimated_1rm: 330, per_weight_reps: [{ weight: 300, max_reps: 3 }] }
        : undefined;

    async function checkOff(sets: any[]) {
      mockServer(prRoutes);
      const utils = render(
        <WorkoutLog prefill={{ name: 'Push', notes: '', exercises: [bench(sets)] } as any} onSubmit={jest.fn()} onCancel={jest.fn()} />,
      );
      // currentPR arrives with the history fetch; checking off before it lands can't fire a banner
      await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(([u]) => String(u).endsWith('/api/personal-records/7'))).toBe(true));
      await new Promise(r => setTimeout(r, 0));
      fireEvent.press(utils.getByLabelText('Set 1 done'));
      return utils;
    }

    it('does not celebrate a single that only beats the estimate through Epley', async () => {
      // 320 x 1 extrapolates to 330.7 under raw Epley, but the server saves a single as 320
      const { queryByText } = await checkOff([{ reps: 1, weight: 320, set_type: 'N' }]);
      expect(queryByText('New PR')).toBeNull();
    });

    it('still celebrates a real estimated-1RM record', async () => {
      // 300 x 5 = 350 estimated, above 330
      const { findByText } = await checkOff([{ reps: 5, weight: 300, set_type: 'N' }]);
      expect(await findByText('New PR')).toBeTruthy();
    });

    it('does not call a single at a new weight a rep record', async () => {
      // The server never stores a max_reps record for a 1-rep set
      const { queryByText } = await checkOff([{ reps: 1, weight: 200, set_type: 'N' }]);
      expect(queryByText('Most Reps at Weight')).toBeNull();
    });
  });

  it("keeps a set the user logs while last session's sets are still loading", async () => {
    let resolveLast: (body: any) => void = () => {};
    mockServer(url => {
      if (url.includes('/api/stats/exercise/last-session')) return new Promise(r => { resolveLast = r; });
      return undefined;
    });
    const prefill = { name: 'Push', notes: '', exercises: [bench([{ reps: 5, weight: 225, set_type: 'N' }])] };
    const { getByDisplayValue, queryByDisplayValue, findByText } = render(
      <WorkoutLog prefill={prefill as any} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );

    fireEvent.changeText(getByDisplayValue('5'), '7');
    resolveLast({ sets: [{ reps: '3', weight: '100', set_type: 'N' }] });

    // History still lands in the Prev column...
    expect(await findByText('3 x 100')).toBeTruthy();
    // ...but doesn't replace what was typed
    expect(getByDisplayValue('7')).toBeTruthy();
    expect(queryByDisplayValue('3')).toBeNull();
  });

  it('counts live volume from checked-off sets, not prefilled ones', async () => {
    mockServer();
    const prefill = { name: 'Push', notes: '', exercises: [bench([{ reps: 5, weight: 225, set_type: 'N' }])] };
    const { getByLabelText, findByText, queryByText } = render(
      <WorkoutLog prefill={prefill as any} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );

    expect(queryByText('1,125')).toBeNull();
    fireEvent.press(getByLabelText('Set 1 done'));
    expect(await findByText('1,125')).toBeTruthy();
  });

  it('logs a template chip with its programmed sets, like every other template entry point', async () => {
    mockServer(url => (url.endsWith('/api/workout-templates')
      ? [{
          id: 1,
          name: 'Legs',
          programming_json: JSON.stringify([{ exercise_template_id: 5, sets: 3, reps: '6-8', rpe: 8 }]),
          exercises: [{ id: 5, name: 'Squat', muscle_group: 'Quads', equipment: 'Barbell', exercise_type: 'strength' }],
        }]
      : undefined));
    const { findByText, getAllByDisplayValue, getByDisplayValue } = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.press(await findByText('Legs'));

    await waitFor(() => expect(getAllByDisplayValue('6')).toHaveLength(3));
    expect(getByDisplayValue('Legs')).toBeTruthy();
  });
});
