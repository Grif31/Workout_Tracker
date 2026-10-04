import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ExerciseListModal from '../components/ExerciseList';

jest.mock('../components/NewExerciseForm', () => () => null);
jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const mockExercises = [
  { id: 1, name: 'Bench Press', muscle_group: 'Chest' },
  { id: 2, name: 'Squat', muscle_group: 'Quads' },
  { id: 3, name: 'Pull-up', muscle_group: 'Back' },
];

const defaultProps = {
  visible: true,
  onClose: jest.fn(),
  exercises: mockExercises,
  recentExercises: [],
  onSelect: jest.fn(),
  onAddExercise: jest.fn(),
  muscleGroups: ['Chest', 'Quads', 'Back'],
};

describe('ExerciseListModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing when visible', () => {
    render(<ExerciseListModal {...defaultProps} />);
  });

  it('renders nothing when not visible', () => {
    const { queryByText } = render(<ExerciseListModal {...defaultProps} visible={false} />);
    expect(queryByText('Bench Press')).toBeNull();
  });

  it('shows exercise names', () => {
    const { getByText } = render(<ExerciseListModal {...defaultProps} />);
    expect(getByText('Bench Press')).toBeTruthy();
    expect(getByText('Squat')).toBeTruthy();
  });

  it('calls onSelect when an exercise is pressed', () => {
    const { getByText } = render(<ExerciseListModal {...defaultProps} />);
    fireEvent.press(getByText('Bench Press'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bench Press' }));
  });

  it('shows the Select Exercise header', () => {
    const { getByText } = render(<ExerciseListModal {...defaultProps} />);
    expect(getByText('Select Exercise')).toBeTruthy();
  });

  it('filters exercises by search text', () => {
    const { getByPlaceholderText, queryByText } = render(<ExerciseListModal {...defaultProps} />);
    fireEvent.changeText(getByPlaceholderText(/search/i), 'squat');
    expect(queryByText('Bench Press')).toBeNull();
    expect(queryByText('Squat')).toBeTruthy();
  });

  it('finds a lift by reordered words and gym shorthand', () => {
    const exercises = [
      { id: 10, name: 'Incline Bench Press', muscle_group: 'Chest', equipment: 'Dumbbell' },
      { id: 11, name: 'Incline Bench Press', muscle_group: 'Chest', equipment: 'Barbell' },
    ];
    const { getByPlaceholderText, getByText, queryByText } = render(<ExerciseListModal {...defaultProps} exercises={exercises} />);
    fireEvent.changeText(getByPlaceholderText(/search/i), 'incline db');
    expect(getByText('Incline Bench Press (Dumbbell)')).toBeTruthy();
    // "bb" mustn't match inside "dumbbell"
    expect(queryByText('Incline Bench Press (Barbell)')).toBeNull();
  });

  it('tags exercises already in the workout', () => {
    const { getAllByText } = render(<ExerciseListModal {...defaultProps} addedIds={[1, undefined]} />);
    expect(getAllByText('Added')).toHaveLength(1);
  });
});
