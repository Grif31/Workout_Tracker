/**
 * The Weekly Summary's week picker: its own calendar, since the system date
 * picker can't mark workout days. "Today" is pinned so the future-day rules
 * don't drift with the real date.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import WeekPickerModal from '../components/WeekPickerModal';
import { appCache } from '../utils/appCache';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const TODAY = new Date(2026, 8, 16, 12);   // Wednesday, September 16 2026
const WEEK = '2026-09-07';                 // a past Monday

let dates: string[];

function renderPicker(onSelectDate = jest.fn(), onClose = jest.fn(), weekStart = WEEK) {
  const utils = render(
    <WeekPickerModal visible weekStart={weekStart} onSelectDate={onSelectDate} onClose={onClose} />,
  );
  return { ...utils, onSelectDate, onClose };
}

describe('WeekPickerModal', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: TODAY, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    appCache.clear();
    dates = ['2026-09-02', '2026-09-08', '2026-09-10'];
    (global.fetch as jest.Mock) = jest.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({ dates }),
    }));
  });
  afterEach(() => jest.useRealTimers());

  it('opens on the month of the week being shown', () => {
    const r = renderPicker(jest.fn(), jest.fn(), '2026-08-03');
    expect(r.getByText('August 2026')).toBeTruthy();
  });

  it('highlights the days a workout was logged', async () => {
    const r = renderPicker();
    await waitFor(() => expect(r.getByLabelText('September 8, workout logged')).toBeTruthy());
    expect(r.getByLabelText('September 2, workout logged')).toBeTruthy();
    expect(r.getByLabelText('September 10, workout logged')).toBeTruthy();
    expect(r.getByLabelText('September 9')).toBeTruthy();   // no workout: plain
    // The day's number sits in a circle View inside the pressable cell.
    const filled = StyleSheet.flatten(
      (r.getByTestId('week-picker-day-2026-09-08') as any).children[0].props.style,
    );
    const plain = StyleSheet.flatten(
      (r.getByTestId('week-picker-day-2026-09-09') as any).children[0].props.style,
    );
    expect(filled.backgroundColor).toBeTruthy();
    expect(plain.backgroundColor).toBeUndefined();
  });

  it('paints instantly from the preloaded dates, then refreshes them on open', async () => {
    appCache.set('workout_dates', { dates: ['2026-09-01'] });
    dates = ['2026-09-01', '2026-09-15'];   // logged since the preload
    const r = renderPicker();
    expect(r.getByLabelText('September 1, workout logged')).toBeTruthy();
    await waitFor(() => expect(r.getByLabelText('September 15, workout logged')).toBeTruthy());
    expect((global.fetch as jest.Mock).mock.calls.some(c => String(c[0]).includes('/api/workouts/dates'))).toBe(true);
  });

  it('picks the tapped day and closes', () => {
    const r = renderPicker();
    fireEvent.press(r.getByTestId('week-picker-day-2026-09-02'));
    expect(r.onSelectDate).toHaveBeenCalledWith('2026-09-02');
    expect(r.onClose).toHaveBeenCalled();
  });

  it('does not let a future day be picked', () => {
    const r = renderPicker();
    fireEvent.press(r.getByTestId('week-picker-day-2026-09-17'));
    expect(r.onSelectDate).not.toHaveBeenCalled();
    fireEvent.press(r.getByTestId('week-picker-day-2026-09-16'));   // today is fine
    expect(r.onSelectDate).toHaveBeenCalledWith('2026-09-16');
  });

  it('stops at the current month but can go back', () => {
    const r = renderPicker();
    fireEvent.press(r.getByLabelText('Next month'));
    expect(r.getByText('September 2026')).toBeTruthy();
    fireEvent.press(r.getByLabelText('Previous month'));
    expect(r.getByText('August 2026')).toBeTruthy();
  });
});
