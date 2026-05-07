import React from 'react';
import { render } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import ProfileWorkoutDetailScreen from '../screens/ProfileTab/WorkoutDetails';

jest.mock('../components/WorkoutDetails', () => {
  const { View, Text } = require('react-native');
  return ({ workoutId }: any) => <View><Text>WorkoutDetails:{workoutId}</Text></View>;
});

const nav = createMockNavigation();

describe('ProfileTab WorkoutDetails screen', () => {
  it('renders without crashing', () => {
    const route = createMockRoute('WorkoutDetails', { workoutId: 5 });
    render(<ProfileWorkoutDetailScreen navigation={nav as any} route={route as any} />);
  });

  it('passes workoutId to the WorkoutDetails component', () => {
    const route = createMockRoute('WorkoutDetails', { workoutId: 7 });
    const { getByText } = render(<ProfileWorkoutDetailScreen navigation={nav as any} route={route as any} />);
    expect(getByText('WorkoutDetails:7')).toBeTruthy();
  });
});
