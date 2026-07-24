import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetch } from './testUtils';
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
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return ({ children }: any) => <View>{children}</View>;
});
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../components/ExerciseList', () => () => null);
jest.mock('../components/NewExerciseForm', () => () => null);
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['Chest', 'Back', 'Quads'] }), { virtual: true });
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

describe('WorkoutLog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch([]);
  });
  afterEach(() => jest.useRealTimers());

  it('renders without crashing', () => {
    render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
  });

  it('shows the workout name input', () => {
    const { getByPlaceholderText } = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(getByPlaceholderText(/workout name/i)).toBeTruthy();
  });

  it('shows Add Exercise button', () => {
    const { getByText } = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(getByText(/add exercise/i)).toBeTruthy();
  });

  it('shows Finish / Submit button', () => {
    const { getByText } = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(getByText(/finish|submit|save/i)).toBeTruthy();
  });

  it('shows a Cancel/Discard button', () => {
    const { getByText } = render(<WorkoutLog onSubmit={jest.fn()} onCancel={jest.fn()} />);
    expect(getByText(/cancel|discard/i)).toBeTruthy();
  });

  it('keeps the original workout date when editing', () => {
    const { getByText } = render(
      <WorkoutLog
        prefill={{ name: 'Push Day', notes: '', date: '2026-03-05T00:00:00', exercises: [] }}
        workoutId={1}
        editMode
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    const expected = new Date('2026-03-05T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
    expect(getByText(expected)).toBeTruthy();
  });

  it('prefills workout name from prefill prop', () => {
    const { getByDisplayValue } = render(
      <WorkoutLog
        prefill={{ name: 'Push Day', notes: '', exercises: [] }}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(getByDisplayValue('Push Day')).toBeTruthy();
  });

  it('hides the weight input for bodyweight exercises', () => {
    const { getAllByPlaceholderText } = render(
      <WorkoutLog
        prefill={{
          name: 'Pull Day', notes: '',
          exercises: [{
            name: 'Pull Up', exercise_template_id: 1, equipment: 'Bodyweight',
            sets: [{ reps: '10', weight: '0' }],
          }],
        }}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    // One set row: reps input only — the weight input must not render
    expect(getAllByPlaceholderText('—')).toHaveLength(1);
  });

  it('shows the weight input for weighted exercises', () => {
    const { getAllByPlaceholderText } = render(
      <WorkoutLog
        prefill={{
          name: 'Bench Day', notes: '',
          exercises: [{
            name: 'Bench Press', exercise_template_id: 2, equipment: 'Barbell',
            sets: [{ reps: '5', weight: '135' }],
          }],
        }}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    // One set row: reps + weight inputs
    expect(getAllByPlaceholderText('—')).toHaveLength(2);
  });

  it('calls onCancel when cancel button pressed', () => {
    const { Alert } = require('react-native');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title: string, _msg: string, buttons: any[]) => {
      const discard = buttons?.find((b: any) => b.style === 'destructive');
      discard?.onPress?.();
    });
    const onCancel = jest.fn();
    const { getByText } = render(<WorkoutLog onSubmit={jest.fn()} onCancel={onCancel} />);
    fireEvent.press(getByText(/discard/i));
    expect(onCancel).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
