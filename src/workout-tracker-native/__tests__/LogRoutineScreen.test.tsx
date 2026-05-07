import React from 'react';
import { render } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import LogRoutineScreen from '../screens/ExercisesTab/LogRoutineScreen';

jest.mock('../components/WorkoutLog', () => {
  const { View, Text } = require('react-native');
  return () => <View><Text>WorkoutLog</Text></View>;
});

const nav = createMockNavigation();

describe('LogRoutineScreen', () => {
  it('renders without crashing', () => {
    const route = createMockRoute('LogRoutine', {});
    render(<LogRoutineScreen navigation={nav as any} route={route as any} />);
  });

  it('renders WorkoutLog with prefill from route params', () => {
    const route = createMockRoute('LogRoutine', {
      prefill: { workoutName: 'Push Day', exercises: [] },
    });
    const { getByText } = render(<LogRoutineScreen navigation={nav as any} route={route as any} />);
    expect(getByText('WorkoutLog')).toBeTruthy();
  });
});
