import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ToastBanner } from '../components/ToastBanner';
import { showToast } from '../utils/toast';

describe('ToastBanner', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows a plain toast and hides it after 3 seconds', () => {
    const { queryByText } = render(<ToastBanner />);
    act(() => showToast('2 workouts synced'));
    expect(queryByText('2 workouts synced')).toBeTruthy();

    act(() => { jest.advanceTimersByTime(3000 + 300); });
    expect(queryByText('2 workouts synced')).toBeNull();
  });

  it('shows a titled toast for its custom duration', () => {
    const { queryByText } = render(<ToastBanner />);
    act(() => showToast('Uploads when you are back online.', { title: 'Workout saved offline', icon: 'cloud-offline-outline', tone: 'warning', durationMs: 6500 }));
    expect(queryByText('Workout saved offline')).toBeTruthy();
    expect(queryByText('Uploads when you are back online.')).toBeTruthy();

    act(() => { jest.advanceTimersByTime(5000); });
    expect(queryByText('Workout saved offline')).toBeTruthy();

    act(() => { jest.advanceTimersByTime(1500 + 300); });
    expect(queryByText('Workout saved offline')).toBeNull();
  });

  it('dismisses a titled toast when tapped', () => {
    const { getByText, queryByText } = render(<ToastBanner />);
    act(() => showToast('Uploads later.', { title: 'Workout saved offline', durationMs: 6500 }));

    fireEvent.press(getByText('Workout saved offline'));
    act(() => { jest.advanceTimersByTime(300); });
    expect(queryByText('Workout saved offline')).toBeNull();
  });

  it("runs a titled toast's action when tapped, then dismisses it", () => {
    const onPress = jest.fn();
    const { getByText, getByRole, queryByText } = render(<ToastBanner />);
    act(() => showToast('Tap to see your summary.', { title: 'Walk uploaded', onPress, accessibilityHint: 'Opens its summary' }));
    expect(getByRole('button').props.accessibilityHint).toBe('Opens its summary');

    fireEvent.press(getByText('Walk uploaded'));
    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(300); });
    expect(queryByText('Walk uploaded')).toBeNull();
  });
});
