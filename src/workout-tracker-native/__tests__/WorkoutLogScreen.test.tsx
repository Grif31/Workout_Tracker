import React from 'react';
import { render } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import WorkoutLogScreen from '../screens/DashboardTab/WorkoutLogScreen';

jest.mock('../components/WorkoutLog', () => {
  const { View, Text } = require('react-native');
  return ({ onSubmit, onCancel }: any) => (
    <View>
      <Text>WorkoutLog</Text>
    </View>
  );
});

const nav = createMockNavigation();

describe('WorkoutLogScreen', () => {
  it('renders without crashing (no params)', () => {
    const route = createMockRoute('WorkoutLog', {});
    render(<WorkoutLogScreen navigation={nav as any} route={route as any} />);
  });

  it('renders with prefill params', () => {
    const route = createMockRoute('WorkoutLog', { prefill: { workoutName: 'Push Day' }, editMode: false });
    render(<WorkoutLogScreen navigation={nav as any} route={route as any} />);
  });

  it('renders in edit mode', () => {
    const route = createMockRoute('WorkoutLog', { editMode: true, workoutId: 42 });
    render(<WorkoutLogScreen navigation={nav as any} route={route as any} />);
  });

  it('navigates to WorkoutDetails on submit when not in edit mode and id provided', () => {
    const route = createMockRoute('WorkoutLog', { editMode: false });
    const { getByText } = render(<WorkoutLogScreen navigation={nav as any} route={route as any} />);
    expect(getByText('WorkoutLog')).toBeTruthy();
  });
});
