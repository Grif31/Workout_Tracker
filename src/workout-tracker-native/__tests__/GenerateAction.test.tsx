/**
 * The shared AI generate button: label and blurb at rest, a pulsing star while
 * loading, and no second press while it works.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import GenerateAction from '../components/GenerateAction';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const base = { message: 'Coaching from your training.', label: 'Generate Insights', onPress: jest.fn() };

describe('GenerateAction', () => {
  beforeEach(() => base.onPress.mockClear());

  it('shows the blurb and a button named by its label', () => {
    const r = render(<GenerateAction {...base} loading={false} />);
    expect(r.getByText('Coaching from your training.')).toBeTruthy();
    fireEvent.press(r.getByLabelText('Generate Insights'));
    expect(base.onPress).toHaveBeenCalledTimes(1);
  });

  it('takes custom spoken names for the button in both states', () => {
    const idle = render(<GenerateAction {...base} loading={false} accessibilityLabel="Get insights" loadingAccessibilityLabel="Writing insights" />);
    expect(idle.getByLabelText('Get insights')).toBeTruthy();
    const busy = render(<GenerateAction {...base} loading accessibilityLabel="Get insights" loadingAccessibilityLabel="Writing insights" />);
    expect(busy.getByLabelText('Writing insights')).toBeTruthy();
  });

  it('ignores presses while loading', () => {
    const r = render(<GenerateAction {...base} loading />);
    fireEvent.press(r.getByLabelText('Working, please wait'));
    expect(base.onPress).not.toHaveBeenCalled();
  });

  it('goes back to a pressable button when loading ends', () => {
    const r = render(<GenerateAction {...base} loading />);
    r.rerender(<GenerateAction {...base} loading={false} />);
    fireEvent.press(r.getByLabelText('Generate Insights'));
    expect(base.onPress).toHaveBeenCalledTimes(1);
  });
});
