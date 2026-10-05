import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import SegmentedControl from '../components/SegmentedControl';

const OPTIONS = [{ key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta' }] as const;
// 2 × 100 of segments, inside a 1px border and a 2px inset
const TRACK_WIDTH = 206;

const layout = (r: ReturnType<typeof render>) =>
  fireEvent(r.getByRole('button', { name: 'Alpha' }).parent!.parent!, 'layout', {
    nativeEvent: { layout: { width: TRACK_WIDTH, height: 36 } },
  });

const thumbStyle = (r: ReturnType<typeof render>) => StyleSheet.flatten(r.getByTestId('segment-thumb').props.style);

describe('SegmentedControl', () => {
  it('marks the selected segment and reports taps', () => {
    const onChange = jest.fn();
    const r = render(<SegmentedControl options={OPTIONS} value="a" onChange={onChange} />);
    expect(r.getByRole('button', { name: 'Alpha' }).props.accessibilityState).toEqual({ selected: true });
    expect(r.getByRole('button', { name: 'Beta' }).props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(r.getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('places the thumb under the selected segment once the track is measured', () => {
    const r = render(<SegmentedControl options={OPTIONS} value="b" onChange={jest.fn()} />);
    expect(r.queryByTestId('segment-thumb')).toBeNull();
    layout(r);
    const style = thumbStyle(r);
    expect(style.width).toBe(100);
    expect(style.transform[0].translateX).toBe(100);
  });

  it('shows no thumb while nothing is selected', () => {
    const r = render(<SegmentedControl options={OPTIONS} value={null} onChange={jest.fn()} />);
    layout(r);
    expect(thumbStyle(r).opacity).toBe(0);
  });
});
