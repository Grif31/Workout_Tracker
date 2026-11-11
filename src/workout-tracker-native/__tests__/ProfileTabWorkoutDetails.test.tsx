import React from 'react';
import { render } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import ProfileWorkoutDetailScreen from '../screens/ProfileTab/WorkoutDetails';

let mockOnEdit: (prefill: any) => void = () => {};
jest.mock('../components/WorkoutDetails', () => {
  const { View, Text } = require('react-native');
  return ({ workoutId, onEdit }: any) => { mockOnEdit = onEdit; return <View><Text>WorkoutDetails:{workoutId}</Text></View>; };
});
let mockSheetItems: any;
jest.mock('../components/achievements/EditUnlockSheet', () => ({ items }: any) => { mockSheetItems = items; return null; });

describe('ProfileTab WorkoutDetails screen', () => {
  it('renders without crashing', () => {
    const route = createMockRoute('WorkoutDetails', { workoutId: 5 });
    render(<ProfileWorkoutDetailScreen navigation={createMockNavigation() as any} route={route as any} />);
  });

  it('passes workoutId to the WorkoutDetails component', () => {
    const route = createMockRoute('WorkoutDetails', { workoutId: 7 });
    const { getByText } = render(<ProfileWorkoutDetailScreen navigation={createMockNavigation() as any} route={route as any} />);
    expect(getByText('WorkoutDetails:7')).toBeTruthy();
  });

  it('opens Edit with the workout id, so saving edits it instead of posting a copy', () => {
    const nav = createMockNavigation();
    render(<ProfileWorkoutDetailScreen navigation={nav as any} route={createMockRoute('WorkoutDetails', { workoutId: 7 }) as any} />);
    mockOnEdit({ name: 'Push', notes: '', exercises: [] });
    expect(nav.navigate).toHaveBeenCalledWith('EditWorkout', expect.objectContaining({ workoutId: 7, editMode: true }));
  });

  it('hands badges an edit earned to the unlock sheet', () => {
    const items = [{ key: 'workouts_1' }];
    render(<ProfileWorkoutDetailScreen navigation={createMockNavigation() as any} route={createMockRoute('WorkoutDetails', { workoutId: 7, newAchievements: items }) as any} />);
    expect(mockSheetItems).toBe(items);
  });
});
