import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import TemplateDetailScreen from '../screens/TrainingTab/TemplateDetailScreen';

jest.mock('navigation/types', () => ({}), { virtual: true });
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['All', 'Chest', 'Back'] }));
// Captures the picker's props so tests can check its mode and drive onSelect
let mockPickerProps: any = null;
jest.mock('components/ExerciseList', () => (props: any) => { mockPickerProps = props; return null; });
jest.mock('components/DraggableList', () => {
  const { View } = require('react-native');
  return ({ data = [], renderItem }: any) => (
    <View>
      {data.map((item: any, i: number) => (
        <View key={i}>{renderItem(item, i)}</View>
      ))}
    </View>
  );
});
jest.mock('react-native-gesture-handler/Swipeable', () => {
  const { View } = require('react-native');
  return ({ children }: any) => <View>{children}</View>;
});

const nav = createMockNavigation();
const route = createMockRoute('TemplateDetail', { templateId: 1 });

const mockTemplate = {
  id: 1,
  name: 'Push A',
  exercises: [{ id: 1, name: 'Bench Press', muscle_group: 'Chest' }],
};

describe('TemplateDetailScreen', () => {
  beforeEach(() => {
    mockFetchSequence([
      { data: mockTemplate },
      { data: [{ id: 1, name: 'Bench Press', muscle_group: 'Chest' }] },
    ]);
  });

  it('renders without crashing', () => {
    render(<TemplateDetailScreen navigation={nav as any} route={route as any} />);
  });

  it('shows template name after fetch', async () => {
    const { getByDisplayValue } = render(<TemplateDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByDisplayValue('Push A')).toBeTruthy());
  });

  it('shows existing exercise in the list', async () => {
    const { getByText } = render(<TemplateDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
  });

  it('shows Save button', async () => {
    const { getByText } = render(<TemplateDetailScreen navigation={nav as any} route={route as any} />);
    await waitFor(() => expect(getByText('Save Changes')).toBeTruthy());
  });
});

describe('TemplateDetailScreen (new template)', () => {
  // Routed by URL and method rather than call order: a new template never
  // fetches itself, and only the save should hit the create endpoint.
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn((url: string, init?: RequestInit) => {
      const isCreate = String(url).endsWith('/api/workout-templates') && init?.method === 'POST';
      return Promise.resolve({
        ok: true,
        status: isCreate ? 201 : 200,
        json: () => Promise.resolve(
          isCreate
            ? { id: 42, name: 'New Template', exercises: [] }
            : [
                { id: 1, name: 'Bench Press', muscle_group: 'Chest' },
                { id: 2, name: 'Squat', muscle_group: 'Quadriceps' },
                { id: 3, name: 'Barbell Row', muscle_group: 'Back' },
              ],
        ),
      });
    });
  });

  it('hides Log Workout and Delete until the template is saved', async () => {
    const { getByText, queryByText } = render(
      <TemplateDetailScreen navigation={createMockNavigation() as any} route={createMockRoute('TemplateDetail', {}) as any} />,
    );
    await waitFor(() => expect(getByText('Save Template')).toBeTruthy());
    expect(queryByText('Log Workout')).toBeNull();
    expect(queryByText('Delete')).toBeNull();
  });

  it('creates the template on save and offers to log it', async () => {
    const navigation = createMockNavigation({ setParams: jest.fn() });
    const { getByText } = render(
      <TemplateDetailScreen navigation={navigation as any} route={createMockRoute('TemplateDetail', {}) as any} />,
    );
    await waitFor(() => fireEvent.press(getByText('Save Template')));
    await waitFor(() => expect(navigation.setParams).toHaveBeenCalledWith({ templateId: 42 }));
    const createCall = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(createCall?.[0]).toMatch(/\/api\/workout-templates$/);
    expect(getByText('Log Now')).toBeTruthy();
  });

  it('adds every exercise picked in one multi-select batch', async () => {
    const { getByText } = render(
      <TemplateDetailScreen navigation={createMockNavigation() as any} route={createMockRoute('TemplateDetail', {}) as any} />,
    );
    await waitFor(() => fireEvent.press(getByText('Add Exercise')));
    expect(mockPickerProps.multiSelect).toBe(true);
    // The picker's "Add N Exercises" calls onSelect once per exercise in a row
    await act(async () => {
      mockPickerProps.onSelect({ id: 2, name: 'Squat' });
      mockPickerProps.onSelect({ id: 3, name: 'Barbell Row' });
    });
    expect(getByText('Squat')).toBeTruthy();
    expect(getByText('Barbell Row')).toBeTruthy();
  });

  it('skips an exercise that is already in the template', async () => {
    const { getByText, getAllByText } = render(
      <TemplateDetailScreen navigation={createMockNavigation() as any} route={createMockRoute('TemplateDetail', {}) as any} />,
    );
    await waitFor(() => fireEvent.press(getByText('Add Exercise')));
    await act(async () => { mockPickerProps.onSelect({ id: 2, name: 'Squat' }); });
    await act(async () => { mockPickerProps.onSelect({ id: 2, name: 'Squat' }); });
    expect(getAllByText('Squat')).toHaveLength(1);
  });
});
