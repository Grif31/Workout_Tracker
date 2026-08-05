import { toDisplayWeight, toDisplayVolume, convertWeight, roundTenth } from '../utils/units';

describe('toDisplayWeight', () => {
  it('formats an integer value with no decimal', () => {
    expect(toDisplayWeight(225, 'lbs')).toBe('225 lbs');
  });

  it('formats a fractional value to one decimal place', () => {
    expect(toDisplayWeight(102.5, 'kg')).toBe('102.5 kg');
  });

  it('truncates extra decimal precision to one place', () => {
    expect(toDisplayWeight(102.567, 'lbs')).toBe('102.6 lbs');
  });

  it('renders zero as a real value, not the empty placeholder', () => {
    expect(toDisplayWeight(0, 'lbs')).toBe('0 lbs');
  });

  it('renders the empty placeholder for null/undefined-ish falsy input', () => {
    // @ts-expect-error exercising runtime guard against missing values
    expect(toDisplayWeight(null, 'lbs')).toBe('—');
    // @ts-expect-error exercising runtime guard against missing values
    expect(toDisplayWeight(undefined, 'kg')).toBe('—');
  });
});

describe('toDisplayVolume', () => {
  it('leaves lbs volume unconverted', () => {
    expect(toDisplayVolume(5000, 'lbs')).toBe('5.0k lbs');
  });

  it('converts backend lbs volume to kg for kg users', () => {
    // 5000 lbs * 0.453592 = 2267.96 kg
    expect(toDisplayVolume(5000, 'kg')).toBe('2.3k kg');
  });

  it('rounds small volumes to the nearest whole unit with no suffix', () => {
    expect(toDisplayVolume(850, 'lbs')).toBe('850 lbs');
  });

  it('abbreviates values in the thousands with one decimal', () => {
    expect(toDisplayVolume(12345, 'lbs')).toBe('12.3k lbs');
  });

  it('abbreviates values in the millions', () => {
    expect(toDisplayVolume(2_500_000, 'lbs')).toBe('2.5M lbs');
  });

  it('handles zero volume', () => {
    expect(toDisplayVolume(0, 'lbs')).toBe('0 lbs');
  });
});

describe('convertWeight', () => {
  it('is a pass-through — stored weights are already in the display unit', () => {
    expect(convertWeight(135, 'lbs')).toBe(135);
    expect(convertWeight(60, 'kg')).toBe(60);
  });
});

describe('roundTenth', () => {
  it('rounds to the nearest tenth', () => {
    expect(roundTenth(150.44)).toBe(150.4);
    expect(roundTenth(150.46)).toBe(150.5);
  });

  it('leaves values already at tenth precision unchanged', () => {
    expect(roundTenth(72.5)).toBe(72.5);
  });

  it('handles zero and whole numbers', () => {
    expect(roundTenth(0)).toBe(0);
    expect(roundTenth(80)).toBe(80);
  });
});
