import React from 'react';
import { Alert } from 'react-native';
import { render } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import WorkoutLogScreen from '../screens/DashboardTab/WorkoutLogScreen';

jest.mock('../components/WorkoutLog', () => {
  const { View, Text } = require('react-native');
  return ({ onSubmit, onCancel }: any) => (
    <View>
      <Text>WorkoutLog</Text>
    </View>
  );
});

let mockTrackingState = 'idle';
jest.mock('../context/GpsRunContext', () => ({ useGpsRunStatus: () => ({ trackingState: mockTrackingState }) }));
const mockNavigate = jest.fn();
jest.mock('../navigation/navigationRef', () => ({ navigationRef: { navigate: (...a: any[]) => mockNavigate(...a) } }));

const nav = createMockNavigation();

describe('WorkoutLogScreen', () => {
  it('renders without crashing (no params)', () => {
    const route = createMockRoute('WorkoutLog', {});
    render(<WorkoutLogScreen navigation={nav as any} route={route as any} />);
  });

  it('renders with prefill params', () => {
    const route = createMockRoute('WorkoutLog', { prefill: { workoutName: 'Push Day' }, editMode: false });
    render(<WorkoutLogScreen navigation={nav as any} route={route as any} />);
  });

  it('renders in edit mode', () => {
    const route = createMockRoute('WorkoutLog', { editMode: true, workoutId: 42 });
    render(<WorkoutLogScreen navigation={nav as any} route={route as any} />);
  });

  it('navigates to WorkoutDetails on submit when not in edit mode and id provided', () => {
    const route = createMockRoute('WorkoutLog', { editMode: false });
    const { getByText } = render(<WorkoutLogScreen navigation={nav as any} route={route as any} />);
    expect(getByText('WorkoutLog')).toBeTruthy();
  });

  describe('with a GPS run in progress', () => {
    let alertSpy: jest.SpyInstance;
    beforeEach(() => {
      mockTrackingState = 'paused';
      jest.clearAllMocks();
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });
    afterEach(() => { mockTrackingState = 'idle'; alertSpy.mockRestore(); });

    it('does not open a new workout over it', () => {
      const route = createMockRoute('WorkoutLog', { editMode: false });
      const { queryByText } = render(<WorkoutLogScreen navigation={nav as any} route={route as any} />);
      expect(queryByText('WorkoutLog')).toBeNull();
      expect(alertSpy).toHaveBeenCalledWith('Activity in progress', expect.any(String), expect.any(Array), { cancelable: false });
    });

    it('goes back on Cancel', () => {
      render(<WorkoutLogScreen navigation={nav as any} route={createMockRoute('WorkoutLog', {}) as any} />);
      alertSpy.mock.calls[0][2].find((b: any) => b.text === 'Cancel').onPress();
      expect(nav.goBack).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('leaves for the activity on Go to Activity, without leaving the workout screen underneath', () => {
      render(<WorkoutLogScreen navigation={nav as any} route={createMockRoute('WorkoutLog', {}) as any} />);
      alertSpy.mock.calls[0][2].find((b: any) => b.text === 'Go to Activity').onPress();
      expect(nav.goBack).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('DashboardTab', { screen: 'GPSCardio', initial: false });
    });

    it('still lets an old workout be edited', () => {
      const route = createMockRoute('WorkoutLog', { editMode: true, workoutId: 42 });
      const { getByText } = render(<WorkoutLogScreen navigation={nav as any} route={route as any} />);
      expect(getByText('WorkoutLog')).toBeTruthy();
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });
});
