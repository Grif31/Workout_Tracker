/**
 * Regression cover for the workout going unresponsive after "Replace Exercise".
 *
 * The menu is a Modal and the exercise picker is another one. Opening the
 * picker on a timer while the menu Modal was still dismissing made iOS drop
 * the picker's presentation and strand the menu's (transparent) view
 * controller on screen, swallowing every tap until the app was killed. The
 * picker now waits for the menu Modal to actually report itself dismissed.
 *
 * onDismiss is native, so it never fires under react-test-renderer — these
 * tests therefore exercise the timer fallback, which is the path that has to
 * keep working when the callback goes missing.
 */
import React from 'react';
import { Modal } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { mockFetch } from './testUtils';
import WorkoutLog from '../components/WorkoutLog';

let mockPickerProps: any = null;
jest.mock('../components/ExerciseList', () => {
  const { View } = require('react-native');
  return (props: any) => {
    mockPickerProps = props;
    return props.visible ? <View testID="exercise-picker" /> : null;
  };
});

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
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['Chest', 'Back', 'Quads'] }), { virtual: true });
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const prefill = {
  name: 'Push Day',
  notes: '',
  exercises: [
    {
      name: 'Bench Press',
      exercise_template_id: 11,
      exercise_type: 'strength',
      muscle_group: 'Chest',
      equipment: 'Barbell',
      image_url: '/media/bench-press.gif',
      sets: [{ reps: '8', weight: '135' }],
    },
  ],
};

// The menu Modal unmounts on a 160ms timer, and only then does the effect
// that arms the 500ms onDismiss fallback run — so the two waits can't be
// collapsed into one advance, or the fallback is never scheduled.
const settleMenuDismiss = () => {
  act(() => { jest.advanceTimersByTime(200); });
  act(() => { jest.advanceTimersByTime(600); });
};

const pressMenu = (getByTestId: any) =>
  fireEvent.press(getByTestId('exercise-menu-0'), { nativeEvent: { pageX: 300, pageY: 200 } });

describe('WorkoutLog — Replace Exercise', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPickerProps = null;
    mockFetch([]);
  });
  afterEach(() => jest.useRealTimers());

  const renderLog = () =>
    render(<WorkoutLog prefill={prefill as any} onSubmit={jest.fn()} onCancel={jest.fn()} />);

  it('opens the exercise picker after the menu Modal has dismissed', () => {
    const { getByTestId, getByText, queryByTestId } = renderLog();

    pressMenu(getByTestId);
    fireEvent.press(getByText('Replace Exercise'));

    // Must NOT mount while the menu Modal is still on screen — that collision
    // is what wedged the whole workout.
    expect(queryByTestId('exercise-picker')).toBeNull();

    // Nor on a fixed delay from the press: the old code opened it 180ms later
    // regardless of whether the menu Modal had finished going away.
    act(() => { jest.advanceTimersByTime(180); });
    expect(queryByTestId('exercise-picker')).toBeNull();

    settleMenuDismiss();

    expect(queryByTestId('exercise-picker')).not.toBeNull();
    // Replacing swaps one exercise, so the picker is single-select.
    expect(mockPickerProps.multiSelect).toBe(false);
  });

  it('leaves the screen usable when Replace is cancelled', () => {
    const { getByTestId, getByText, queryByTestId } = renderLog();

    pressMenu(getByTestId);
    fireEvent.press(getByText('Replace Exercise'));
    settleMenuDismiss();
    expect(queryByTestId('exercise-picker')).not.toBeNull();

    act(() => { mockPickerProps.onClose(); });

    expect(queryByTestId('exercise-picker')).toBeNull();
    // Add Exercise still reaches the picker, and in multi-select — a stale
    // replacingExIndex here would silently turn the next add into a replace.
    fireEvent.press(getByText('Add Exercise'));
    expect(queryByTestId('exercise-picker')).not.toBeNull();
    expect(mockPickerProps.multiSelect).toBe(true);
  });

  it('replaces the exercise in place when one is picked', () => {
    const { getByTestId, getByText, queryByText, queryByTestId } = renderLog();

    pressMenu(getByTestId);
    fireEvent.press(getByText('Replace Exercise'));
    settleMenuDismiss();
    expect(queryByTestId('exercise-picker')).not.toBeNull();

    act(() => {
      mockPickerProps.onSelect({
        id: 42, name: 'Incline Press', muscle_group: 'Chest',
        equipment: 'Dumbbell', exercise_type: 'strength',
      });
    });

    expect(queryByText('Bench Press')).toBeNull();
    expect(queryByText('Incline Press')).not.toBeNull();
  });

  // The blind setTimeout this replaced is exactly what caused the hang, so the
  // handoff has to stay wired to the real dismissal signal.
  it('waits on the menu Modal dismissal signal rather than a blind timer', () => {
    const { UNSAFE_getAllByType, getByTestId } = renderLog();

    pressMenu(getByTestId);
    const menuModal = UNSAFE_getAllByType(Modal).find(
      m => m.props.transparent === true && m.props.animationType === 'none',
    );
    expect(menuModal).toBeDefined();
    expect(typeof menuModal!.props.onDismiss).toBe('function');
  });

  it('opens the picker directly from Add Exercise, with no menu in the way', () => {
    const { getByText, queryByTestId } = renderLog();

    fireEvent.press(getByText('Add Exercise'));

    expect(queryByTestId('exercise-picker')).not.toBeNull();
    expect(mockPickerProps.multiSelect).toBe(true);
  });
});
