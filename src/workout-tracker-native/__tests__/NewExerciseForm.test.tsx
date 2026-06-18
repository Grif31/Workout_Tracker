import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import NewExerciseForm from '../components/NewExerciseForm';

jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('../constants/equipmentTypes', () => ({ equipmentTypes: ['Barbell', 'Dumbbell'] }));

const muscleGroups = ['Chest', 'Back', 'Quads', 'Shoulders'];
const onClose = jest.fn();
const onSave = jest.fn();

describe('NewExerciseForm', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing when visible', () => {
    render(<NewExerciseForm visible={true} onClose={onClose} onSave={onSave} muscleGroups={muscleGroups} />);
  });

  it('does not render when not visible', () => {
    const { queryByText } = render(
      <NewExerciseForm visible={false} onClose={onClose} onSave={onSave} muscleGroups={muscleGroups} />
    );
    expect(queryByText('Add New Exercise')).toBeNull();
  });

  it('shows New Exercise title', () => {
    const { getByText } = render(
      <NewExerciseForm visible={true} onClose={onClose} onSave={onSave} muscleGroups={muscleGroups} />
    );
    expect(getByText('New Exercise')).toBeTruthy();
  });

  it('calls onClose when Cancel is pressed', () => {
    const { getByText } = render(
      <NewExerciseForm visible={true} onClose={onClose} onSave={onSave} muscleGroups={muscleGroups} />
    );
    fireEvent.press(getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onSave when name is empty', () => {
    const { getByText } = render(
      <NewExerciseForm visible={true} onClose={onClose} onSave={onSave} muscleGroups={muscleGroups} />
    );
    fireEvent.press(getByText('Save'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave with name, muscle, and equipment when valid', () => {
    const { getByText, getByPlaceholderText } = render(
      <NewExerciseForm visible={true} onClose={onClose} onSave={onSave} muscleGroups={muscleGroups} />
    );
    fireEvent.changeText(getByPlaceholderText('Exercise name'), 'Romanian Deadlift');
    fireEvent.press(getByText('Barbell'));
    fireEvent.press(getByText('Chest'));
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith('Romanian Deadlift', expect.any(String), expect.any(String));
  });

  it('shows all muscle groups', () => {
    const { getByText } = render(
      <NewExerciseForm visible={true} onClose={onClose} onSave={onSave} muscleGroups={muscleGroups} />
    );
    expect(getByText('Chest')).toBeTruthy();
    expect(getByText('Back')).toBeTruthy();
  });
});
