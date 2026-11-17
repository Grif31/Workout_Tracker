/**
 * Supersets in the template editor: pairing from the row's swipe actions,
 * removing from the picker, and the groups reaching the save and the log.
 */
import React from 'react';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import TemplateDetailScreen from '../screens/TrainingTab/TemplateDetailScreen';

jest.mock('navigation/types', () => ({}), { virtual: true });
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['All', 'Chest', 'Back'] }));
jest.mock('components/ExerciseList', () => () => null);
jest.mock('components/share/TemplateShareCard', () => () => null);
jest.mock('components/DraggableList', () => {
  const { View } = require('react-native');
  return ({ data = [], renderItem }: any) => (
    <View>{data.map((item: any, i: number) => <View key={i} testID={`row-${i}`}>{renderItem(item, i)}</View>)}</View>
  );
});
// Renders the swipe actions inline so they can be pressed
jest.mock('react-native-gesture-handler/Swipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(({ children, renderRightActions }: any, _ref: any) => (
    <View>{children}{renderRightActions?.({ interpolate: () => 0 })}</View>
  ));
});

const bench = { id: 1, name: 'Bench Press', muscle_group: 'Chest', exercise_type: 'strength' };
const row = { id: 2, name: 'Barbell Row', muscle_group: 'Back', exercise_type: 'strength' };
const squat = { id: 3, name: 'Squat', muscle_group: 'Quads', exercise_type: 'strength' };
const run = { id: 4, name: 'Treadmill', muscle_group: 'Cardio', exercise_type: 'cardio' };

function setup(exercises: any[]) {
  mockFetchSequence([
    { data: { id: 1, name: 'Push A', exercises } },
    { data: [bench, row, squat, run] },
    { data: { id: 1, name: 'Push A', exercises } },
  ]);
  const navigation = createMockNavigation();
  const utils = render(
    <TemplateDetailScreen navigation={navigation as any} route={createMockRoute('TemplateDetail', { templateId: 1 }) as any} />,
  );
  return { ...utils, navigation };
}

const saveBody = () => {
  const call = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'PATCH');
  return JSON.parse(call[1].body);
};

describe('TemplateDetailScreen supersets', () => {
  it('pairs two exercises from the Superset action and saves the groups', async () => {
    const utils = setup([bench, squat, row, run]);
    await waitFor(() => expect(utils.getByText('Bench Press')).toBeTruthy());
    fireEvent.press(within(utils.getByTestId('row-0')).getByText('Superset'));
    // Cardio isn't offered
    expect(utils.queryByLabelText('Superset with Treadmill')).toBeNull();
    fireEvent.press(utils.getByLabelText('Superset with Barbell Row'));

    expect(utils.getByText('A1')).toBeTruthy();
    expect(utils.getByText('A2')).toBeTruthy();
    // Row moved up next to Bench
    expect(within(utils.getByTestId('row-1')).getByText('Barbell Row')).toBeTruthy();
    // and the cardio row has no Superset action
    expect(within(utils.getByTestId('row-3')).queryByText('Superset')).toBeNull();

    fireEvent.press(utils.getByText('Save Changes'));
    await waitFor(() => expect(saveBody().superset_groups).toEqual([1, 1, null, null]));
    expect(saveBody().exercise_template_ids).toEqual([1, 2, 3, 4]);
  });

  it('removes an exercise from its superset', async () => {
    const utils = setup([{ ...bench, superset_group: 1 }, { ...row, superset_group: 1 }, squat]);
    await waitFor(() => expect(utils.getByText('A1')).toBeTruthy());
    fireEvent.press(within(utils.getByTestId('row-0')).getByText('Superset'));
    fireEvent.press(utils.getByText('Remove from superset'));
    expect(utils.queryByText('A1')).toBeNull();
    expect(utils.queryByText('A2')).toBeNull();
  });

  it('logs a superset template as a superset', async () => {
    const utils = setup([{ ...bench, superset_group: 1 }, { ...row, superset_group: 1 }]);
    await waitFor(() => expect(utils.getByText('A1')).toBeTruthy());
    fireEvent.press(utils.getByText('Log Workout'));
    const prefill = (utils.navigation.navigate as jest.Mock).mock.calls[0][1].params.prefill;
    expect(prefill.exercises.map((e: any) => e.superset_group)).toEqual([1, 1]);
  });
});
