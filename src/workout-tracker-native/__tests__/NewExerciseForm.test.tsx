import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import NewExerciseForm from '../components/NewExerciseForm';

jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

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

  it('shows Add New Exercise title', () => {
    const { getByText } = render(
      <NewExerciseForm visible={true} onClose={onClose} onSave={onSave} muscleGroups={muscleGroups} />
    );
    expect(getByText('Add New Exercise')).toBeTruthy();
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

  it('calls onSave with name and muscle when valid', () => {
    const { getByText, getByPlaceholderText } = render(
      <NewExerciseForm visible={true} onClose={onClose} onSave={onSave} muscleGroups={muscleGroups} />
    );
    fireEvent.changeText(getByPlaceholderText('Exercise Name'), 'Romanian Deadlift');
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledWith('Romanian Deadlift', expect.any(String));
  });

  it('shows all muscle groups', () => {
    const { getByText } = render(
      <NewExerciseForm visible={true} onClose={onClose} onSave={onSave} muscleGroups={muscleGroups} />
    );
    expect(getByText('Chest')).toBeTruthy();
    expect(getByText('Back')).toBeTruthy();
  });
});
