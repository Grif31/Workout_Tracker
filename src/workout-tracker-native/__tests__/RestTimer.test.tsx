import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import RestTimer from '../components/workout/RestTimer';
import { BUBBLE_SIZE, bubbleBounds, bubbleRestPoint, rubberBand } from '../components/workout/restBubble';

// Gesture builders chain; the detector just renders its child.
jest.mock('react-native-gesture-handler', () => {
  const builder: any = new Proxy({}, { get: () => () => builder });
  return {
    Gesture: { Pan: () => builder, Tap: () => builder, Race: () => builder },
    GestureDetector: ({ children }: any) => children,
  };
});

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      surface: '#1C1C1E', border: '#38383A', accent: '#30D158', accentText: '#000',
      textPrimary: '#FFF', textSecondary: '#8E8E93',
    },
  }),
}));

const props = {
  restRemaining: 90, restTotal: 120, restPaused: false,
  onStop: jest.fn(), onPause: jest.fn(), onResume: jest.fn(), onAdjust: jest.fn(),
};

describe('RestTimer bubble', () => {
  it('minimizes to a labelled bubble and expands again', () => {
    const { getByLabelText, queryByLabelText } = render(<RestTimer {...props} />);
    fireEvent.press(getByLabelText('Minimize rest timer'));
    expect(queryByLabelText('Stop rest timer')).toBeNull();

    const bubble = getByLabelText('Rest timer, 1:30 left. Expand');
    fireEvent(bubble, 'accessibilityTap');
    expect(getByLabelText('Stop rest timer')).toBeTruthy();
  });

  it('says when the rest is paused', () => {
    const { getByLabelText } = render(<RestTimer {...props} restPaused />);
    fireEvent.press(getByLabelText('Minimize rest timer'));
    expect(getByLabelText('Rest timer, 1:30 left, paused. Expand')).toBeTruthy();
  });
});

describe('bubble drag math', () => {
  const b = bubbleBounds(390, 844);

  it('follows the finger inside the bounds', () => {
    expect(rubberBand(150, b.minX, b.maxX)).toBe(150);
  });

  it('resists past an edge instead of stopping dead, more the further it goes', () => {
    const past40 = rubberBand(b.maxX + 40, b.minX, b.maxX);
    const past120 = rubberBand(b.maxX + 120, b.minX, b.maxX);
    expect(past40).toBeGreaterThan(b.maxX);
    expect(past40).toBeLessThan(b.maxX + 40);
    expect(past120 - b.maxX).toBeLessThan(120 * 0.5);
    expect(past120).toBeGreaterThan(past40);
    expect(rubberBand(b.minX - 40, b.minX, b.maxX)).toBeLessThan(b.minX);
  });

  it('rests on the side the bubble was dropped on', () => {
    expect(bubbleRestPoint(40, 300, 0, 0, b).x).toBe(b.minX);
    expect(bubbleRestPoint(300, 300, 0, 0, b).x).toBe(b.maxX);
  });

  it('crosses to the far side on a flick', () => {
    expect(bubbleRestPoint(40, 300, 1500, 0, b).x).toBe(b.maxX);
    expect(bubbleRestPoint(300, 300, -1500, 0, b).x).toBe(b.minX);
  });

  it('keeps its height, inside the vertical bounds', () => {
    expect(bubbleRestPoint(40, 300, 0, 0, b).y).toBe(300);
    expect(bubbleRestPoint(40, 20, 0, -2000, b).y).toBe(b.minY);
    expect(bubbleRestPoint(40, 900, 0, 2000, b).y).toBe(b.maxY);
    expect(b.maxX).toBe(390 - BUBBLE_SIZE - 8);
  });
});
