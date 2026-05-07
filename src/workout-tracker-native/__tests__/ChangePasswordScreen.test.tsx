import React from 'react';
import { render } from '@testing-library/react-native';
import { createMockNavigation, createMockRoute } from './testUtils';
import ChangePasswordScreen from '../screens/ProfileTab/ChangePasswordScreen';

jest.mock('navigation/types', () => ({}), { virtual: true });

const nav = createMockNavigation();
const route = createMockRoute('ChangePassword');

describe('ChangePasswordScreen', () => {
  it('renders without crashing', () => {
    render(<ChangePasswordScreen navigation={nav as any} route={route as any} />);
  });
});
