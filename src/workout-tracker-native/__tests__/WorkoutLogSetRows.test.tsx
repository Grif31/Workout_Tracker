import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import WorkoutLog from '../components/WorkoutLog';

// Renders the swipe actions inline so the Delete button can be pressed
jest.mock('react-native-gesture-handler/Swipeable', () => {
  const { View, Animated } = require('react-native');
  return ({ children, renderRightActions }: any) => (
    <View>
      {children}
      {renderRightActions?.(new Animated.Value(1), new Animated.Value(0))}
    </View>
  );
});
jest.mock('react-native-gesture-handler', () => {
  const { View, ScrollView } = require('react-native');
  return {
    ScrollView,
    GestureHandlerRootView: ({ children }: any) => children,
    PanGestureHandler: ({ children }: any) => <View>{children}</View>,
  };
});
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../components/ExerciseList', () => () => null);
jest.mock('../components/NewExerciseForm', () => () => null);
jest.mock('../constants/muscleGroups', () => ({ muscleGroups: ['Chest'] }));
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: () => Promise.resolve({ isConnected: true }), addEventListener: () => () => {} },
}));

const json = (body: any) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

function mockServer(lastSession: any[] = []) {
  (global.fetch as jest.Mock) = jest.fn(async (url: string) =>
    String(url).includes('/api/stats/exercise/last-session') ? json({ sets: lastSession }) : json([]));
}

const prefill = (sets: any[]) => ({
  name: 'Push', notes: '',
  exercises: [{ name: 'Bench Press', exercise_template_id: 7, exercise_type: 'strength', equipment: 'Barbell', sets }],
});

describe('WorkoutLog set rows', () => {
  it('puts a deleted set back where it was on Undo', async () => {
    mockServer();
    const { getByLabelText, getByText, queryByDisplayValue, getAllByPlaceholderText, findByText } = render(
      <WorkoutLog
        prefill={prefill([{ reps: 5, weight: 225, set_type: 'N' }, { reps: 3, weight: 245, set_type: 'N' }]) as any}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.press(getByLabelText('Delete set 1'));
    expect(queryByDisplayValue('225')).toBeNull();
    expect(await findByText('Set 1 removed from Bench Press')).toBeTruthy();

    fireEvent.press(getByText('Undo'));
    // Back in its original slot, ahead of the 245 set (inputs run reps, weight per set)
    expect(getAllByPlaceholderText('—').map(i => i.props.value)).toEqual(['5', '225', '3', '245']);
  });

  it("fills a set from the Prev column", async () => {
    mockServer([{ reps: '8', weight: '185.0', set_type: 'N' }]);
    const { findByLabelText, getByDisplayValue } = render(
      <WorkoutLog prefill={prefill([{ reps: '', weight: '', set_type: 'N' }]) as any} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );

    // The ".0" the API sends on whole weights is dropped
    fireEvent.press(await findByLabelText('Use previous: 8 × 185'));
    await waitFor(() => expect(getByDisplayValue('185')).toBeTruthy());
    expect(getByDisplayValue('8')).toBeTruthy();
  });

  it("doesn't offer to copy into a set that's already checked off", async () => {
    mockServer([{ reps: '8', weight: '185', set_type: 'N' }]);
    const { findByLabelText, getByLabelText, queryByLabelText } = render(
      <WorkoutLog prefill={prefill([{ reps: 5, weight: 100, set_type: 'N' }]) as any} onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    // Wait for history to land (it also refills this untouched set with 185 x 8)
    await findByLabelText('Use previous: 8 × 185');
    fireEvent.press(getByLabelText('Set 1 done'));
    expect(queryByLabelText('Use previous: 8 × 185')).toBeNull();
  });
});
