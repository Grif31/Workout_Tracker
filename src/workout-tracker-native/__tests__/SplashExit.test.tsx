/**
 * The zoom-out laid over the app as the splash ends: it must hand back
 * (onDone) once it has played, with or without Reduce Motion, or the overlay
 * would sit over the app for good.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, act } from '@testing-library/react-native';
import SplashExit from '../components/SplashExit';

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));

describe('SplashExit', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])('calls onDone once the animation ends (reduce motion %s)', async reduce => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduce);
    const onDone = jest.fn();
    render(<SplashExit onDone={onDone} />);
    await act(async () => { await Promise.resolve(); });
    expect(onDone).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(onDone).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
