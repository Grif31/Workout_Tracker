import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PlateCalculatorModal from '../components/PlateCalculatorModal';
import WorkoutCalendar from '../components/WorkoutCalendar';
import CoachProfileModal from '../components/coach/CoachProfileModal';
import RoutinePickerModal from '../components/coach/RoutinePickerModal';

// Answers by URL; anything not listed fails like a server error
function routeFetch(routes: Record<string, any>) {
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const key = Object.keys(routes).find(k => String(url).includes(k));
    const data = key ? routes[key] : undefined;
    return Promise.resolve({ ok: key != null, status: key ? 200 : 500, json: () => Promise.resolve(data) });
  });
}

const fetchCalls = (fragment: string) =>
  (global.fetch as jest.Mock).mock.calls.filter(([u]) => String(u).includes(fragment)).length;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('PlateCalculatorModal', () => {
  const open = (targetWeight: string, weightUnit: string) =>
    render(<PlateCalculatorModal visible targetWeight={targetWeight} weightUnit={weightUnit} onClose={jest.fn()} />);

  it("ignores a plate list saved in lbs after the user switched to kg, and loads 25s", async () => {
    await AsyncStorage.setItem('plate_calc_plates_1', JSON.stringify([45, 25, 10]));
    const { findByText, getByLabelText } = open('180', 'kg');

    expect(await findByText('3 × 25  ·  1 × 5 per side')).toBeTruthy();
    expect(getByLabelText('25 kg plates').props.accessibilityState).toEqual({ checked: true });
    expect(getByLabelText('20 kg plates').props.accessibilityState).toEqual({ checked: true });
  });

  it('shows the closest weight it can load when the target is out of reach', async () => {
    await AsyncStorage.multiSet([
      ['plate_calc_bar_1', 'ez'],
      ['plate_calc_plates_1', JSON.stringify([10, 5])],
    ]);
    const { findByText } = open('62', 'lbs');

    expect(await findByText("Can't make 62 lbs exactly. Closest: 60 lbs")).toBeTruthy();
  });

  it("calls the 35 lb bar the women's bar", () => {
    const { getByText } = open('135', 'lbs');
    expect(getByText("Women's")).toBeTruthy();
  });
});

describe('WorkoutCalendar', () => {
  const today = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayIso = iso(today);

  it('refetches the logged days when the parent refreshes', async () => {
    routeFetch({ '/api/workouts/dates': { dates: [] } });
    const onSelectWorkout = jest.fn();
    const { rerender, findByTestId } = render(<WorkoutCalendar view="month" refreshKey={0} onSelectWorkout={onSelectWorkout} onChangeView={jest.fn()} />);
    expect((await findByTestId(`calendar-day-${todayIso}`)).props.accessibilityState).toBeUndefined();

    // A workout logged today, then the Profile comes back into focus
    routeFetch({ '/api/workouts/dates': { dates: [todayIso] } });
    rerender(<WorkoutCalendar view="month" refreshKey={1} onSelectWorkout={onSelectWorkout} onChangeView={jest.fn()} />);

    await waitFor(() => expect(fetchCalls('/api/workouts/dates')).toBe(1));
    await waitFor(async () =>
      expect((await findByTestId(`calendar-day-${todayIso}`)).props.accessibilityState).toEqual({ selected: false }),
    );
  });

  it("shows a cardio workout's logged time, not the logging timer", async () => {
    routeFetch({
      '/api/workouts/dates': { dates: [todayIso] },
      [`/api/workouts?date=${todayIso}`]: [
        { id: 4, name: 'Evening Run', workout_type: 'cardio', duration: 0, cardio_duration: 32.4 },
      ],
    });
    const { findByTestId, findByText } = render(
      <WorkoutCalendar view="month" refreshKey={0} onSelectWorkout={jest.fn()} onChangeView={jest.fn()} />,
    );
    fireEvent.press(await findByTestId(`calendar-day-${todayIso}`));
    expect(await findByText('32 min')).toBeTruthy();
  });

  it('offers a retry when a day fails to load instead of saying it has no workouts', async () => {
    routeFetch({ '/api/workouts/dates': { dates: [todayIso] } });
    const { findByTestId, findByText, queryByText } = render(
      <WorkoutCalendar view="month" refreshKey={0} onSelectWorkout={jest.fn()} onChangeView={jest.fn()} />,
    );
    fireEvent.press(await findByTestId(`calendar-day-${todayIso}`));
    expect(await findByText("Couldn't load this day. Tap to try again.")).toBeTruthy();
    expect(queryByText('No workouts found.')).toBeNull();
  });

  it('marks the tapped day as selected', async () => {
    routeFetch({ '/api/workouts/dates': { dates: [todayIso] }, '/api/workouts?date=': [] });
    const { findByTestId } = render(<WorkoutCalendar view="month" refreshKey={0} onSelectWorkout={jest.fn()} onChangeView={jest.fn()} />);
    const cell = await findByTestId(`calendar-day-${todayIso}`);
    expect(cell.props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(cell);
    await waitFor(async () =>
      expect((await findByTestId(`calendar-day-${todayIso}`)).props.accessibilityState).toEqual({ selected: true }),
    );
  });

  it('opens a month tapped in Year view, landing on that month', async () => {
    const lastYear = today.getFullYear() - 1;
    routeFetch({ '/api/workouts/dates': { dates: [`${lastYear}-03-14`] } });
    const onChangeView = jest.fn();
    const props = { refreshKey: 0, onSelectWorkout: jest.fn(), onChangeView };
    const { rerender, findByLabelText, findByTestId } = render(<WorkoutCalendar view="year" {...props} />);
    fireEvent.press(await findByLabelText('Previous year'));
    fireEvent.press(await findByTestId(`calendar-month-${lastYear}-3`));
    expect(onChangeView).toHaveBeenCalledWith('month');

    rerender(<WorkoutCalendar view="month" {...props} />);
    expect((await findByTestId(`calendar-day-${lastYear}-03-14`)).props.accessibilityState).toEqual({ selected: false });
  });

  it("won't open a month that hasn't happened yet", async () => {
    if (today.getMonth() === 11) return; // December has no later month this year
    routeFetch({ '/api/workouts/dates': { dates: [] } });
    const onChangeView = jest.fn();
    const { findByTestId } = render(<WorkoutCalendar view="year" refreshKey={0} onSelectWorkout={jest.fn()} onChangeView={onChangeView} />);
    fireEvent.press(await findByTestId(`calendar-month-${today.getFullYear()}-${today.getMonth() + 2}`));
    expect(onChangeView).not.toHaveBeenCalled();
  });

  it('opens a year tapped in All Years', async () => {
    const lastYear = today.getFullYear() - 1;
    routeFetch({ '/api/workouts/dates': { dates: [`${lastYear}-06-01`] } });
    const onChangeView = jest.fn();
    const props = { refreshKey: 0, onSelectWorkout: jest.fn(), onChangeView };
    const { rerender, findByTestId, findByText } = render(<WorkoutCalendar view="multiyear" {...props} />);
    fireEvent.press(await findByTestId(`calendar-year-${lastYear}`));
    expect(onChangeView).toHaveBeenCalledWith('year');

    rerender(<WorkoutCalendar view="year" {...props} />);
    expect(await findByText(String(lastYear))).toBeTruthy();
  });

  it('starts the week on Monday', async () => {
    routeFetch({ '/api/workouts/dates': { dates: [] } });
    const { findAllByText, getByText } = render(
      <WorkoutCalendar view="month" refreshKey={0} onSelectWorkout={jest.fn()} onChangeView={jest.fn()} />,
    );
    await findAllByText('Mo');
    const header = getByText('Mo').parent?.parent;
    const labels = (header?.children ?? []).map((c: any) => c.props?.children);
    expect(labels.slice(0, 2)).toEqual(['Mo', 'Tu']);
  });
});

describe('CoachProfileModal', () => {
  it('reopens on the defaults after closing without saving', async () => {
    const props = { onClose: jest.fn(), onSave: jest.fn() };
    const { getByRole, rerender } = render(<CoachProfileModal visible {...props} />);
    const selected = (label: string) => getByRole('button', { name: label }).props.accessibilityState?.selected;
    await waitFor(() => expect(selected('General')).toBe(true));

    fireEvent.press(getByRole('button', { name: 'Strength' }));
    expect(selected('Strength')).toBe(true);

    rerender(<CoachProfileModal visible={false} {...props} />);
    rerender(<CoachProfileModal visible {...props} />);
    await waitFor(() => expect(selected('General')).toBe(true));
    expect(selected('Strength')).toBe(false);
  });
});

describe('RoutinePickerModal', () => {
  const routines = [
    { id: 1, name: 'PPL', day_count: 6 },
    { id: 2, name: 'Upper Lower', day_count: 4 },
  ];

  it('marks the routine that is already active', () => {
    const { getByText, queryByText } = render(
      <RoutinePickerModal visible routines={routines} activeRoutineId={2} onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(getByText('4 days · Active')).toBeTruthy();
    expect(queryByText('6 days · Active')).toBeNull();
  });

  it('explains an empty list', () => {
    const { getByText } = render(
      <RoutinePickerModal visible routines={[]} onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(getByText(/No routines yet/)).toBeTruthy();
  });

  it('closes on the Android back button', () => {
    const onClose = jest.fn();
    const { UNSAFE_getByType } = render(
      <RoutinePickerModal visible routines={routines} onSelect={jest.fn()} onClose={onClose} />,
    );
    const { Modal } = require('react-native');
    UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onClose).toHaveBeenCalled();
  });
});
