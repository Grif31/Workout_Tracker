import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import EditProfileScreen from '../screens/ProfileTab/EditProfileScreen';

jest.mock('navigation/types', () => ({}), { virtual: true });
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));
jest.mock('theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const nav = createMockNavigation();
const route = createMockRoute('EditProfile');

describe('EditProfileScreen', () => {
  beforeEach(() => mockFetch({ id: 1, username: 'testuser' }));

  it('renders without crashing', () => {
    render(<EditProfileScreen navigation={nav as any} route={route as any} />);
  });

  it('prefills name from user context', () => {
    const { getByDisplayValue } = render(<EditProfileScreen navigation={nav as any} route={route as any} />);
    expect(getByDisplayValue('Test User')).toBeTruthy();
  });

  it('shows the Save button', () => {
    const { getByText } = render(<EditProfileScreen navigation={nav as any} route={route as any} />);
    expect(getByText('Save Changes')).toBeTruthy();
  });

  it('calls API and updateUser on save', async () => {
    const { getByText, getByDisplayValue } = render(
      <EditProfileScreen navigation={nav as any} route={route as any} />
    );
    fireEvent.changeText(getByDisplayValue('Test User'), 'New Name');
    fireEvent.press(getByText('Save Changes'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('shows a Change Photo option', () => {
    const { getByText } = render(<EditProfileScreen navigation={nav as any} route={route as any} />);
    expect(getByText(/change photo/i)).toBeTruthy();
  });
});
