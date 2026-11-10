import { Animated, Easing, LayoutAnimation } from 'react-native';
import { EASE_OUT, motionSpring, motionTiming, setReduceMotionForTests } from '../utils/motion';
import { animateNextLayout, animateNextRowChange } from '../utils/layoutAnimation';

describe('motion helpers', () => {
  let timing: jest.SpyInstance;
  let spring: jest.SpyInstance;
  let configureNext: jest.SpyInstance;

  beforeEach(() => {
    timing = jest.spyOn(Animated, 'timing');
    spring = jest.spyOn(Animated, 'spring');
    configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    setReduceMotionForTests(false);
  });

  it('animate as asked when Reduce Motion is off', () => {
    const v = new Animated.Value(0);
    motionTiming(v, { toValue: 1, duration: 300, delay: 100, useNativeDriver: true });
    motionSpring(v, { toValue: 1, friction: 4, useNativeDriver: true });
    animateNextLayout();
    animateNextRowChange();
    expect(timing).toHaveBeenCalledWith(v, { toValue: 1, duration: 300, delay: 100, useNativeDriver: true, easing: EASE_OUT });
    expect(spring).toHaveBeenCalledWith(v, { toValue: 1, friction: 4, useNativeDriver: true });
    expect(configureNext).toHaveBeenCalledTimes(2);
  });

  it('eases out by default, but keeps an easing the caller names', () => {
    const v = new Animated.Value(0);
    const linear = Easing.linear;
    motionTiming(v, { toValue: 1, duration: 200, useNativeDriver: true, easing: linear });
    expect(timing).toHaveBeenCalledWith(v, { toValue: 1, duration: 200, useNativeDriver: true, easing: linear });
    expect(timing).not.toHaveBeenCalledWith(v, expect.objectContaining({ easing: EASE_OUT }));
  });

  it('jump straight to the end with Reduce Motion on', () => {
    setReduceMotionForTests(true);
    const v = new Animated.Value(0);
    motionTiming(v, { toValue: 1, duration: 300, delay: 100, useNativeDriver: true });
    motionSpring(v, { toValue: 0.5, friction: 4, useNativeDriver: true });
    animateNextLayout();
    animateNextRowChange();
    expect(timing).toHaveBeenCalledWith(v, { toValue: 1, duration: 0, delay: 0, useNativeDriver: true, easing: EASE_OUT });
    expect(timing).toHaveBeenCalledWith(v, { toValue: 0.5, duration: 0, useNativeDriver: true });
    expect(spring).not.toHaveBeenCalled();
    expect(configureNext).not.toHaveBeenCalled();
  });

  it('still runs the completion callback with Reduce Motion on', done => {
    setReduceMotionForTests(true);
    motionTiming(new Animated.Value(0), { toValue: 1, duration: 300, useNativeDriver: false })
      .start(({ finished }) => { expect(finished).toBe(true); done(); });
  });
});
