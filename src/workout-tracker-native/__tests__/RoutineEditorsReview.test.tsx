import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { usePreventRemove } from '@react-navigation/native';
import { createMockNavigation, createMockRoute } from './testUtils';
import CreateRoutineScreen from '../screens/TrainingTab/CreateRoutineScreen';
import AIWorkoutPreviewScreen from '../screens/TrainingTab/AIWorkoutPreviewScreen';

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22 } } }));
let mockPicker: any = null;
jest.mock('components/ExerciseList', () => (props: any) => { mockPicker = props; return null; });
let mockProgModal: any = null;
jest.mock('components/ExerciseProgrammingModal', () => ({ __esModule: true, default: (props: any) => { mockProgModal = props; return null; } }));

const preventCalls = () => (usePreventRemove as jest.Mock).mock.calls;
const lastPrevent = () => preventCalls().at(-1)[0];

function serve() {
  (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(
      String(url).endsWith('/api/exercises') && !init.method
        ? [{ id: 1, name: 'Bench Press', muscle_group: 'Chest' }, { id: 2, name: 'Squat', muscle_group: 'Quads' }]
        : String(url).endsWith('/api/routines') ? { id: 9 } : [],
    ),
  }));
}

const savedBody = () => {
  const call = (global.fetch as jest.Mock).mock.calls.find(([u, i]) => String(u).endsWith('/api/routines') && i?.method === 'POST');
  return call ? JSON.parse(call[1].body) : null;
};

async function newRoutine() {
  const nav = createMockNavigation();
  const r = render(<CreateRoutineScreen navigation={nav as any} route={createMockRoute('CreateRoutine') as any} />);
  await waitFor(() => expect(r.getByDisplayValue('Day 1')).toBeTruthy());
  return { ...r, nav };
}

async function addBench(r: any) {
  fireEvent.press(r.getByText('+ Add Exercise'));
  await waitFor(() => expect(mockPicker?.exercises).toHaveLength(2));
  await act(async () => { mockPicker.onSelect({ id: 1, name: 'Bench Press' }); });
}

describe('Create Routine', () => {
  let alerts: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockPicker = null;
    mockProgModal = null;
    serve();
    alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alerts.mockRestore());

  it("won't save a day with no exercises", async () => {
    const r = await newRoutine();
    fireEvent.changeText(r.getByPlaceholderText('e.g. PPL Split'), 'Upper Lower');
    fireEvent.press(r.getByText('Save Routine'));
    expect(alerts).toHaveBeenCalledWith('Add Exercises', expect.stringContaining('Day 1'));
    expect(savedBody()).toBeNull();
  });

  it("won't save a day whose name is only spaces", async () => {
    const r = await newRoutine();
    await addBench(r);
    fireEvent.changeText(r.getByPlaceholderText('e.g. PPL Split'), 'Upper Lower');
    fireEvent.changeText(r.getByDisplayValue('Day 1'), '   ');
    fireEvent.press(r.getByText('Save Routine'));
    expect(alerts).toHaveBeenCalledWith('Name Each Day', expect.any(String));
  });

  it('asks before switching a day with exercises to a template', async () => {
    const r = await newRoutine();
    await addBench(r);
    fireEvent.press(r.getByText('Use Template'));
    expect(alerts).toHaveBeenCalledWith('Use a template instead?', expect.stringContaining('1 exercise'), expect.any(Array));
    // Nothing cleared until confirmed
    expect(r.getByText('Bench Press')).toBeTruthy();
  });

  it('saves sets and reps set on an exercise', async () => {
    const r = await newRoutine();
    await addBench(r);
    fireEvent.press(r.getByLabelText('Sets and reps for Bench Press'));
    await act(async () => { mockProgModal.onSave({ sets: 4, reps: '6-8', rpe: 8 }); });
    expect(r.getByText('4 × 6-8  @ RPE 8')).toBeTruthy();

    fireEvent.changeText(r.getByPlaceholderText('e.g. PPL Split'), 'Upper Lower');
    await act(async () => { fireEvent.press(r.getByText('Save Routine')); });
    await waitFor(() => expect(savedBody()).not.toBeNull());
    expect(savedBody().days[0].programming).toEqual([{ exercise_template_id: 1, sets: 4, reps: '6-8', rpe: 8 }]);
  });

  it('guards unsaved changes, and not an untouched form', async () => {
    const r = await newRoutine();
    expect(lastPrevent()).toBe(false);
    fireEvent.changeText(r.getByPlaceholderText('e.g. PPL Split'), 'Upper Lower');
    expect(lastPrevent()).toBe(true);
  });

  it('asks before discarding, and dispatches the navigation on Discard', async () => {
    const r = await newRoutine();
    fireEvent.changeText(r.getByPlaceholderText('e.g. PPL Split'), 'Upper Lower');
    const onBeforeRemove = preventCalls().at(-1)[1];
    const action = { type: 'GO_BACK' };
    onBeforeRemove({ data: { action } });
    const [title, , buttons] = alerts.mock.calls.at(-1);
    expect(title).toBe('Discard changes?');
    (r.nav as any).dispatch = jest.fn();
    buttons.find((b: any) => b.text === 'Discard').onPress();
    expect((r.nav as any).dispatch).toHaveBeenCalledWith(action);
  });
});

describe('AI workout preview', () => {
  it('always guards an unsaved generated plan', () => {
    jest.clearAllMocks();
    serve();
    render(
      <AIWorkoutPreviewScreen
        navigation={createMockNavigation() as any}
        route={{ key: 'k', name: 'AIWorkoutPreview', params: {
          generateType: 'template', name: 'Push', description: '', exercises: [], days: [],
          coachDays: 3, coachGoal: 'general', coachExp: 'beginner', coachEquipment: 'full_gym',
          coachSessionLength: '60', coachAvoid: [], coachNotes: '',
        } } as any}
      />,
    );
    expect(lastPrevent()).toBe(true);
  });
});

describe('Template editor', () => {
  it('guards an edited name, and not an untouched new template', async () => {
    jest.clearAllMocks();
    serve();
    const TemplateDetailScreen = require('../screens/TrainingTab/TemplateDetailScreen').default;
    const r = render(
      <TemplateDetailScreen navigation={createMockNavigation() as any} route={{ key: 'k', name: 'TemplateDetail', params: {} } as any} />,
    );
    await waitFor(() => expect(r.getByDisplayValue('New Template')).toBeTruthy());
    expect(lastPrevent()).toBe(false);
    fireEvent.changeText(r.getByDisplayValue('New Template'), 'Leg Day');
    expect(lastPrevent()).toBe(true);
  });
});
