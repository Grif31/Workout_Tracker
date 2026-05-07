import React from 'react';
import { render } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import WorkoutDetailScreen from '../screens/DashboardTab/WorkoutDetailsScreen';

jest.mock('../components/WorkoutDetails', () => {
  const { View, Text } = require('react-native');
  return ({ workoutId }: any) => (
    <View>
      <Text>WorkoutDetails:{workoutId}</Text>
    </View>
  );
});

const nav = createMockNavigation();

describe('WorkoutDetailsScreen', () => {
  it('renders without crashing', () => {
    const route = createMockRoute('WorkoutDetails', { workoutId: 1 });
    render(<WorkoutDetailScreen navigation={nav as any} route={route as any} />);
  });

  it('passes workoutId to WorkoutDetails component', () => {
    const route = createMockRoute('WorkoutDetails', { workoutId: 99 });
    const { getByText } = render(<WorkoutDetailScreen navigation={nav as any} route={route as any} />);
    expect(getByText('WorkoutDetails:99')).toBeTruthy();
  });
});
