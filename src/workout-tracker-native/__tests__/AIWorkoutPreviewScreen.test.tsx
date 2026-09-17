import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import AIWorkoutPreviewScreen from '../screens/TrainingTab/AIWorkoutPreviewScreen';

jest.mock('../theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../constants/muscleGroups', () => ({ muscleGroups: ['Chest'] }));

const LIBRARY = [
  { id: 1, name: 'Squat', muscle_group: 'Quads', equipment: 'Barbell', exercise_type: 'strength' },
  { id: 2, name: 'Bench Press', muscle_group: 'Chest', equipment: 'Barbell', exercise_type: 'strength' },
  { id: 3, name: 'Barbell Row', muscle_group: 'Back', equipment: 'Barbell', exercise_type: 'strength' },
  { id: 4, name: 'Front Squat', muscle_group: 'Quads', equipment: 'Barbell', exercise_type: 'strength' },
];
jest.mock('../utils/exerciseCache', () => ({
  loadExerciseList: (_uid: any, onUpdate: (d: any[]) => void) => { onUpdate(LIBRARY); return Promise.resolve({ ok: true, usedCache: false }); },
}));

// Lightweight stand-ins that expose each child's callbacks as buttons, so the
// tests drive the screen's own list logic (reorder, remove, switch, edit).
const mockReorder: Record<string, (from: number, to: number) => void> = {};
jest.mock('../components/DraggableList', () => (props: any) => {
  const { View } = require('react-native');
  const key = props.data.map((e: any) => e.id).join(',') || 'empty';
  mockReorder[props.data[0]?.name ?? key] = props.onReorder;
  return <View testID="exercise-list">{props.data.map((item: any) => <View key={props.keyExtractor(item)}>{props.renderItem(item)}</View>)}</View>;
});
jest.mock('../components/ExerciseEditRow', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  const Row = (p: any) => (
    <View>
      <Text>{p.name}</Text>
      {p.programming?.sets ? <Text>{`${p.name} ${p.programming.sets}x${p.programming.reps}`}</Text> : null}
      <TouchableOpacity onPress={p.onDelete}><Text>{`remove ${p.name}`}</Text></TouchableOpacity>
      <TouchableOpacity onPress={p.onSwitch}><Text>{`switch ${p.name}`}</Text></TouchableOpacity>
      <TouchableOpacity onPress={p.onEdit}><Text>{`edit ${p.name}`}</Text></TouchableOpacity>
    </View>
  );
  return { __esModule: true, default: Row, EXERCISE_ROW_HEIGHT: 64 };
});
jest.mock('../components/ExerciseList', () => (p: any) => {
  const { Text, TouchableOpacity, View } = require('react-native');
  if (!p.visible) return null;
  return (
    <View>
      {p.exercises.map((e: any) => (
        <TouchableOpacity key={e.id} onPress={() => p.onSelect(e)}><Text>{`pick ${e.name}`}</Text></TouchableOpacity>
      ))}
    </View>
  );
});
jest.mock('../components/ExerciseProgrammingModal', () => ({
  __esModule: true,
  default: (p: any) => {
    const { Text, TouchableOpacity, View } = require('react-native');
    if (!p.visible) return null;
    return (
      <View>
        <TouchableOpacity onPress={() => p.onSave({ sets: 5, reps: '5', rpe: 8 })}><Text>set 5x5</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => p.onSave(null)}><Text>clear programming</Text></TouchableOpacity>
      </View>
    );
  },
}));
jest.mock('../components/UndoBar', () => (p: any) => {
  const { Text, TouchableOpacity } = require('react-native');
  return p.visible ? <TouchableOpacity onPress={p.onUndo}><Text>{`Undo: ${p.message}`}</Text></TouchableOpacity> : null;
});

const COACH = {
  coachDays: 3, coachGoal: 'strength', coachExp: 'intermediate', coachEquipment: 'full gym',
  coachSessionLength: '60', coachAvoid: '', coachNotes: '',
};
const ex = (id: number, extra: Record<string, any> = {}) => {
  const lib = LIBRARY.find(e => e.id === id)!;
  return { id, name: lib.name, muscle_group: lib.muscle_group, equipment: lib.equipment, exercise_type: 'strength', ...extra };
};

const templateParams = () => ({
  generateType: 'template',
  name: 'Lower Body Power',
  exercises: [ex(1, { prescribed_sets: 3, prescribed_reps: '5', prescribed_rpe: 8 }), ex(2), ex(3, { prescribed_sets: 4, prescribed_reps: '8-10' })],
  ...COACH,
});
const routineParams = () => ({
  generateType: 'routine',
  name: 'Upper/Lower',
  description: '  Two day split  ',
  days: [
    { label: 'Upper', exercises: [ex(2, { prescribed_sets: 3, prescribed_reps: '8' }), ex(3)] },
    { label: 'Lower', exercises: [ex(1)] },
  ],
  ...COACH,
});

type Reply = { status: number; body?: any } | Error;
let replies: Record<string, Reply>;
function installServer() {
  replies = {
    'POST /api/ai/save': { status: 201, body: { id: 12, name: 'Saved' } },
  };
  (global.fetch as jest.Mock) = jest.fn((url: string, init: any = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    const reply = replies[`${init.method ?? 'GET'} ${path}`];
    if (!reply) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({ ok: reply.status < 300, status: reply.status, json: () => Promise.resolve(reply.body ?? {}) });
  });
}
const saved = () => {
  const call = (global.fetch as jest.Mock).mock.calls.find(([u, i]) => String(u).endsWith('/api/ai/save') && i?.method === 'POST');
  return call ? JSON.parse(call[1].body) : undefined;
};

describe('AIWorkoutPreviewScreen', () => {
  let nav: ReturnType<typeof createMockNavigation>;
  let alertSpy: jest.SpyInstance;

  const renderWith = (params: any) =>
    render(<AIWorkoutPreviewScreen navigation={nav as any} route={createMockRoute('AIWorkoutPreview', params) as any} />);

  beforeEach(() => {
    jest.clearAllMocks();
    nav = createMockNavigation();
    installServer();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  describe('saving a template', () => {
    it('saves exercises in order with programming only for prescribed ones, then opens it', async () => {
      const r = renderWith(templateParams());
      fireEvent.changeText(r.getByPlaceholderText('Workout name'), '  Leg Day  ');
      await act(async () => { fireEvent.press(r.getByText('Save Template')); });

      expect(saved()).toEqual({
        type: 'template',
        name: 'Leg Day',
        exercise_ids: [1, 2, 3],
        programming: [
          { exercise_template_id: 1, sets: 3, reps: '5', rpe: 8 },
          { exercise_template_id: 3, sets: 4, reps: '8-10', rpe: null },
        ],
      });
      expect(nav.replace).toHaveBeenCalledWith('TemplateDetail', { templateId: 12 });
    });

    it('saves the order after a drag', async () => {
      const r = renderWith(templateParams());
      act(() => mockReorder.Squat(0, 2));
      await act(async () => { fireEvent.press(r.getByText('Save Template')); });
      expect(saved().exercise_ids).toEqual([2, 3, 1]);
    });

    it('drops a removed exercise, and puts it back in place on undo', async () => {
      const r = renderWith(templateParams());
      fireEvent.press(r.getByText('remove Bench Press'));
      expect(r.queryByText('Bench Press')).toBeNull();

      fireEvent.press(r.getByText('Undo: Removed Bench Press'));
      await act(async () => { fireEvent.press(r.getByText('Save Template')); });
      expect(saved().exercise_ids).toEqual([1, 2, 3]);
    });

    it('saves without an exercise that stays removed', async () => {
      const r = renderWith(templateParams());
      fireEvent.press(r.getByText('remove Squat'));
      await act(async () => { fireEvent.press(r.getByText('Save Template')); });
      expect(saved().exercise_ids).toEqual([2, 3]);
      expect(saved().programming.map((p: any) => p.exercise_template_id)).toEqual([3]);
    });

    it('switching keeps the position and the prescribed sets', async () => {
      const r = renderWith(templateParams());
      fireEvent.press(r.getByText('switch Squat'));
      fireEvent.press(r.getByText('pick Front Squat'));
      await act(async () => { fireEvent.press(r.getByText('Save Template')); });

      expect(saved().exercise_ids).toEqual([4, 2, 3]);
      expect(saved().programming[0]).toEqual({ exercise_template_id: 4, sets: 3, reps: '5', rpe: 8 });
    });

    it('refuses to add or switch to an exercise already in the workout', () => {
      const r = renderWith(templateParams());
      fireEvent.press(r.getByText('Add Exercise'));
      fireEvent.press(r.getByText('pick Bench Press'));
      expect(alertSpy).toHaveBeenCalledWith('Already added', 'Bench Press is already in this workout');

      fireEvent.press(r.getByText('switch Squat'));
      fireEvent.press(r.getByText('pick Barbell Row'));
      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(r.getAllByText('Barbell Row')).toHaveLength(1);
    });

    it('adds a picked exercise to the end', async () => {
      const r = renderWith(templateParams());
      fireEvent.press(r.getByText('Add Exercise'));
      fireEvent.press(r.getByText('pick Front Squat'));
      await act(async () => { fireEvent.press(r.getByText('Save Template')); });
      expect(saved().exercise_ids).toEqual([1, 2, 3, 4]);
    });

    it('edits and clears programming', async () => {
      const r = renderWith(templateParams());
      fireEvent.press(r.getByText('edit Bench Press'));
      fireEvent.press(r.getByText('set 5x5'));
      fireEvent.press(r.getByText('edit Squat'));
      fireEvent.press(r.getByText('clear programming'));
      await act(async () => { fireEvent.press(r.getByText('Save Template')); });

      expect(saved().programming).toEqual([
        { exercise_template_id: 2, sets: 5, reps: '5', rpe: 8 },
        { exercise_template_id: 3, sets: 4, reps: '8-10', rpe: null },
      ]);
    });
  });

  describe('saving a routine', () => {
    it('saves each day with its edited label, exercises and programming', async () => {
      replies['POST /api/ai/save'] = { status: 201, body: { id: 30, name: 'Upper/Lower' } };
      const r = renderWith(routineParams());
      fireEvent.changeText(r.getByDisplayValue('Lower'), 'Legs');
      await act(async () => { fireEvent.press(r.getByText('Save Routine')); });

      expect(saved()).toEqual({
        type: 'routine',
        name: 'Upper/Lower',
        description: 'Two day split',
        days: [
          { label: 'Upper', exercise_ids: [2, 3], programming: [{ exercise_template_id: 2, sets: 3, reps: '8', rpe: null }] },
          { label: 'Legs', exercise_ids: [1], programming: [] },
        ],
      });
      expect(nav.replace).toHaveBeenCalledWith('RoutineDetail', { routineId: 30, routineName: 'Upper/Lower' });
    });

    it('sends a blank description as null', async () => {
      const r = renderWith({ ...routineParams(), description: '   ' });
      await act(async () => { fireEvent.press(r.getByText('Save Routine')); });
      expect(saved().description).toBeNull();
    });

    it('allows the same exercise on different days but not twice in one day', () => {
      const r = renderWith(routineParams());
      fireEvent.press(r.getAllByText('Add Exercise')[1]);
      fireEvent.press(r.getByText('pick Bench Press'));
      expect(alertSpy).not.toHaveBeenCalled();
      expect(r.getAllByText('Bench Press')).toHaveLength(2);

      fireEvent.press(r.getAllByText('Add Exercise')[1]);
      fireEvent.press(r.getByText('pick Bench Press'));
      expect(alertSpy).toHaveBeenCalledWith('Already added', 'Bench Press is already in this day');
    });
  });

  describe('save failures', () => {
    it('requires a name', async () => {
      const r = renderWith(templateParams());
      fireEvent.changeText(r.getByPlaceholderText('Workout name'), '   ');
      await act(async () => { fireEvent.press(r.getByText('Save Template')); });

      expect(alertSpy).toHaveBeenCalledWith('Name Required', expect.any(String));
      expect(saved()).toBeUndefined();
    });

    it("shows the server's message and stays on the preview", async () => {
      replies['POST /api/ai/save'] = { status: 400, body: { message: 'At least one day is required' } };
      const r = renderWith(templateParams());
      await act(async () => { fireEvent.press(r.getByText('Save Template')); });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Save Workout", 'At least one day is required'));
      expect(nav.replace).not.toHaveBeenCalled();
      expect(r.getByText('Save Template')).toBeTruthy();
    });

    it('stays on the preview without a second alert on a network failure', async () => {
      replies['POST /api/ai/save'] = new TypeError('Network request failed');
      const r = renderWith(templateParams());
      await act(async () => { fireEvent.press(r.getByText('Save Template')); });

      expect(alertSpy).not.toHaveBeenCalled();
      expect(nav.replace).not.toHaveBeenCalled();
    });
  });

  describe('regenerate', () => {
    it('replaces the exercises with a new plan from the same coach settings', async () => {
      replies['POST /api/ai/generate'] = { status: 200, body: { name: 'Fresh Legs', exercises: [ex(4), ex(1)] } };
      const r = renderWith(templateParams());
      await act(async () => { fireEvent.press(r.getByText('Regenerate')); });

      const [, init] = (global.fetch as jest.Mock).mock.calls.find(([u]) => String(u).endsWith('/api/ai/generate'));
      expect(JSON.parse(init.body)).toEqual({
        days_per_week: 3, goal: 'strength', experience: 'intermediate', equipment: 'full gym',
        session_length_min: 60, avoid: '', generate_type: 'template', notes: '',
      });
      await waitFor(() => expect(r.getByDisplayValue('Fresh Legs')).toBeTruthy());
      expect(r.queryByText('Bench Press')).toBeNull();

      await act(async () => { fireEvent.press(r.getByText('Save Template')); });
      expect(saved()).toMatchObject({ name: 'Fresh Legs', exercise_ids: [4, 1] });
    });

    it('replaces routine days and description', async () => {
      replies['POST /api/ai/generate'] = {
        status: 200, body: { name: 'PPL', description: 'Push pull legs', days: [{ label: 'Push', exercises: [ex(2)] }] },
      };
      const r = renderWith(routineParams());
      await act(async () => { fireEvent.press(r.getByText('Regenerate')); });

      await waitFor(() => expect(r.getByDisplayValue('Push')).toBeTruthy());
      expect(r.getByDisplayValue('Push pull legs')).toBeTruthy();
      expect(r.queryByDisplayValue('Lower')).toBeNull();
    });

    it('keeps the current plan when regenerating fails', async () => {
      replies['POST /api/ai/generate'] = { status: 503, body: { message: 'Coach is busy' } };
      const r = renderWith(templateParams());
      await act(async () => { fireEvent.press(r.getByText('Regenerate')); });

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't Generate Workout", 'Coach is busy'));
      expect(r.getByDisplayValue('Lower Body Power')).toBeTruthy();
      expect(r.getByText('Bench Press')).toBeTruthy();
    });
  });
});
