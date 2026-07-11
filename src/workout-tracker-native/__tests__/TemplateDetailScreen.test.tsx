import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetchSequence, createMockNavigation, createMockRoute } from './testUtils';
import TemplateDetailScreen from '../screens/ExercisesTab/TemplateDetailScreen';

jest.mock('navigation/types', () => ({}), { virtual: true });
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));
jest.mock('constants/muscleGroups', () => ({ muscleGroups: ['All', 'Chest', 'Back'] }));
jest.mock('components/ExerciseList', () => () => null);
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
