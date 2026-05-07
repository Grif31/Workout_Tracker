import React from 'react';
import { render } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import EditWorkoutScreen from '../screens/ProfileTab/EditWorkoutScreen';

jest.mock('../components/WorkoutLog', () => {
  const { View, Text } = require('react-native');
  return () => <View><Text>WorkoutLog</Text></View>;
});

const nav = createMockNavigation();

describe('EditWorkoutScreen', () => {
  it('renders without crashing', () => {
    const route = createMockRoute('EditWorkout', {});
    render(<EditWorkoutScreen navigation={nav as any} route={route as any} />);
  });

  it('renders WorkoutLog', () => {
    const route = createMockRoute('EditWorkout', { editMode: true, workoutId: 3 });
    const { getByText } = render(<EditWorkoutScreen navigation={nav as any} route={route as any} />);
    expect(getByText('WorkoutLog')).toBeTruthy();
  });
});
