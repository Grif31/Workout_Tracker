import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import MeasurementsScreen from '../screens/ProfileTab/MeasurementsScreen';
import { computeChartYAxisRange } from '../utils/prFormat';

jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
const mockLine = jest.fn();
jest.mock('react-native-gifted-charts', () => ({ LineChart: (p: any) => { mockLine(p); return null; } }));

const m = (id: number, date: string, waist: number | null, chest: number | null = null) =>
  ({ id, date: `${date}T00:00:00`, waist, chest, right_arm: null, left_arm: null, right_leg: null, left_leg: null });

function serve(measurements: any[], photos: any[] = []) {
  const bodies: Record<string, any> = {
    '/api/bodyweight': [
      { id: 2, weight: 186.4, date: '2026-09-15T00:00:00' },
      { id: 1, weight: 188, date: '2026-09-01T00:00:00' },
    ],
    '/api/measurements': measurements,
    '/api/progress-photos': photos,
  };
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const body = bodies[String(url).replace(/^https?:\/\/[^/]+/, '')];
    return Promise.resolve({ ok: body !== undefined, status: 200, json: () => Promise.resolve(body ?? {}) });
  });
}

const renderScreen = () => render(<MeasurementsScreen navigation={createMockNavigation() as any} route={createMockRoute('Measurements') as any} />);

beforeEach(() => jest.clearAllMocks());

it('gives the bodyweight chart a y-axis on whole, even steps', async () => {
  serve([]);
  const r = renderScreen();
  await r.findByText('History');
  const chart = mockLine.mock.calls.at(-1)[0];
  expect(chart.hideYAxisText).toBeUndefined();
  expect(chart.curved).toBeUndefined();
  const values = [...chart.data.map((d: any) => d.value), ...chart.data2.map((d: any) => d.value)];
  expect({ maxValue: chart.maxValue, yAxisOffset: chart.yAxisOffset })
    .toEqual(computeChartYAxisRange(values, 4));
});

it("opens a measurement's chart when its box is tapped, and closes it again", async () => {
  serve([m(3, '2026-09-20', 31.5), m(2, '2026-09-10', null, 41), m(1, '2026-09-01', 32.5)]);
  const r = renderScreen();
  await r.findByText('History');
  // [0] is the screen title, [1] the tab
  fireEvent.press(r.getAllByText('Measurements')[1]);
  fireEvent.press(await r.findByLabelText('Waist chart'));

  expect(await r.findByText(/^Waist \(/)).toBeTruthy();
  const chart = mockLine.mock.calls.at(-1)[0];
  // Oldest first, skipping the entry that didn't record a waist
  expect(chart.data.map((d: any) => d.value)).toEqual([32.5, 31.5]);

  fireEvent.press(r.getByLabelText('Waist chart'));
  await waitFor(() => expect(r.queryByText(/^Waist \(/)).toBeNull());
});

it('asks for a second entry before drawing a trend', async () => {
  serve([m(1, '2026-09-01', 32.5)]);
  const r = renderScreen();
  await r.findByText('History');
  // [0] is the screen title, [1] the tab
  fireEvent.press(r.getAllByText('Measurements')[1]);
  fireEvent.press(await r.findByLabelText('Waist chart'));
  expect(await r.findByText('Log waist again to see a trend.')).toBeTruthy();
});

it('keeps the photo viewer readable in dark mode', async () => {
  // The test theme, like dark mode, has black accentText
  serve([], [{ id: 9, date: '2026-09-12T00:00:00', photo_url: 'https://x/p.jpg', notes: 'Week 6' }]);
  const r = renderScreen();
  await r.findByText('History');
  fireEvent.press(r.getByText('Photos'));
  fireEvent.press(await r.findByText(new Date('2026-09-12T00:00:00').toLocaleDateString()));
  const notes = await r.findByText('Week 6');
  expect(StyleSheet.flatten(notes.props.style).color).toBe('#fff');
});
