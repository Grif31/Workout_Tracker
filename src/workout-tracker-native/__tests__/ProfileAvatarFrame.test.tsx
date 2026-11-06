/**
 * The rank frame's pulse (Olympian and up) never ends, so it must not start
 * with Reduce Motion on.
 */
import React from 'react';
import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';
import ProfileAvatarFrame from '../components/ProfileAvatarFrame';
import { setReduceMotionForTests } from '../utils/motion';

describe('ProfileAvatarFrame', () => {
  let loop: jest.SpyInstance;
  beforeEach(() => { loop = jest.spyOn(Animated, 'loop'); });
  afterEach(() => { loop.mockRestore(); setReduceMotionForTests(false); });

  it('pulses an animated rank frame', () => {
    render(<ProfileAvatarFrame rankName="Olympian" size={72} avatarSize={64} />);
    expect(loop).toHaveBeenCalledTimes(1);
  });

  it('keeps the frame still with Reduce Motion on', () => {
    setReduceMotionForTests(true);
    render(<ProfileAvatarFrame rankName="Olympian" size={72} avatarSize={64} />);
    expect(loop).not.toHaveBeenCalled();
  });

  it('never pulses a lower rank', () => {
    render(<ProfileAvatarFrame rankName="Hero" size={72} avatarSize={64} />);
    expect(loop).not.toHaveBeenCalled();
  });
});
