import React from 'react';
import { render } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import EditWorkoutScreen from '../screens/ProfileTab/EditWorkoutScreen';

let mockSubmit: (...args: any[]) => void = () => {};
jest.mock('../components/WorkoutLog', () => {
  const { View, Text } = require('react-native');
  return ({ onSubmit }: any) => { mockSubmit = onSubmit; return <View><Text>WorkoutLog</Text></View>; };
});

const badge = { key: 'plates_bench_1', title: '1 Plate Bench', earned_at: '2026-11-09T10:00:00', workout_id: 3 };

describe('EditWorkoutScreen', () => {
  it('renders without crashing', () => {
    const route = createMockRoute('EditWorkout', {});
    render(<EditWorkoutScreen navigation={createMockNavigation() as any} route={route as any} />);
  });

  it('renders WorkoutLog', () => {
    const route = createMockRoute('EditWorkout', { editMode: true, workoutId: 3 });
    const { getByText } = render(<EditWorkoutScreen navigation={createMockNavigation() as any} route={route as any} />);
    expect(getByText('WorkoutLog')).toBeTruthy();
  });

  it('takes an edit that earned badges back to the details with them', () => {
    const nav = createMockNavigation();
    render(<EditWorkoutScreen navigation={nav as any} route={createMockRoute('EditWorkout', { editMode: true, workoutId: 3 }) as any} />);
    mockSubmit(3, undefined, [badge]);
    expect(nav.popTo).toHaveBeenCalledWith('WorkoutDetails', { workoutId: 3, newAchievements: [badge] });
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  it('just goes back after an edit that earned nothing', () => {
    const nav = createMockNavigation();
    render(<EditWorkoutScreen navigation={nav as any} route={createMockRoute('EditWorkout', { editMode: true, workoutId: 3 }) as any} />);
    mockSubmit(3, undefined, []);
    expect(nav.goBack).toHaveBeenCalled();
    expect(nav.popTo).not.toHaveBeenCalled();
  });
});
