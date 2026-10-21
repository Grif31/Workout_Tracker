/**
 * The editable exercise row in the AI preview and template editor: equipment
 * sits beside the name, and the prescription is its own text after the
 * muscle group, so a long muscle list can't cut off the sets and RPE.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import ExerciseEditRow from '../components/ExerciseEditRow';

jest.mock('react-native-gesture-handler/Swipeable', () => {
  const { View } = require('react-native');
  return ({ children }: any) => <View>{children}</View>;
});

const noop = () => {};

describe('ExerciseEditRow', () => {
  it('puts the equipment beside the name and keeps the prescription whole', () => {
    const r = render(
      <ExerciseEditRow
        name="Incline Dumbbell Press"
        muscleGroup="Chest, Triceps, Shoulders"
        equipment="Dumbbell"
        programming={{ sets: 4, reps: '8-10', rpe: 8 }}
        onDelete={noop} onSwitch={noop} onEdit={noop}
      />,
    );
    expect(r.getByText('Incline Dumbbell Press')).toBeTruthy();
    expect(r.getByText('Dumbbell')).toBeTruthy();
    expect(r.getByText('Chest, Triceps, Shoulders')).toBeTruthy();
    expect(r.getByText('4 × 8-10  @ RPE 8')).toBeTruthy();
  });

  it('leaves out what it was not given', () => {
    const r = render(<ExerciseEditRow name="Plank" onDelete={noop} onSwitch={noop} onEdit={noop} />);
    expect(r.getByText('Plank')).toBeTruthy();
    expect(r.queryByText('·')).toBeNull();
  });
});
