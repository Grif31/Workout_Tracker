/**
 * The rank frame's glint (Olympian and up) never ends, so it must not start
 * with Reduce Motion on.
 */
import React from 'react';
import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';
import ProfileAvatarFrame, { frameOverflow } from '../components/ProfileAvatarFrame';
import { setReduceMotionForTests } from '../utils/motion';

describe('ProfileAvatarFrame', () => {
  let loop: jest.SpyInstance;
  beforeEach(() => { loop = jest.spyOn(Animated, 'loop'); });
  afterEach(() => { loop.mockRestore(); setReduceMotionForTests(false); });

  it('sweeps a glint around a high rank frame', () => {
    render(<ProfileAvatarFrame rankName="Olympian" size={72} avatarSize={64} />);
    expect(loop).toHaveBeenCalledTimes(1);
  });

  it('keeps the frame still with Reduce Motion on', () => {
    setReduceMotionForTests(true);
    render(<ProfileAvatarFrame rankName="Olympian" size={72} avatarSize={64} />);
    expect(loop).not.toHaveBeenCalled();
  });

  it('has no glint below Olympian', () => {
    render(<ProfileAvatarFrame rankName="Hero" size={72} avatarSize={64} />);
    expect(loop).not.toHaveBeenCalled();
  });

  it('reports how far each frame reaches past its box, so callers leave room', () => {
    expect(frameOverflow('Neophyte', 72, 64)).toBe(1);
    expect(frameOverflow('Aretē', 72, 64)).toBe(15);
    expect(frameOverflow('Aretē', 116, 104)).toBe(25);
    // Small Titan drops the egg-and-dart, so it reaches less than at 72
    expect(frameOverflow('Titan', 44, 38)).toBeLessThan(frameOverflow('Demigod', 44, 38));
  });
});
