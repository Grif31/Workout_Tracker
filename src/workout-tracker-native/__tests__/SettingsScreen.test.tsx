import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import SettingsScreen from '../screens/ProfileTab/SettingsScreen';

jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } }));
jest.mock('../theme/typography', () => ({ typography: { fontSize: { sm: 14, md: 16, lg: 20 }, fontWeight: { regular: '400', bold: 'bold' }, title: {}, body: {}, button: {} } }));

const nav = createMockNavigation();
const route = createMockRoute('Settings');

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch({});
  });

  it('renders without crashing', () => {
    render(<SettingsScreen navigation={nav as any} route={route as any} />);
  });

  it('shows the Weight Unit section', () => {
    const { getByText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    expect(getByText(/weight unit/i)).toBeTruthy();
  });

  it('shows the app version', () => {
    const { getByText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    expect(getByText(/1\.0\.0/)).toBeTruthy();
  });

  it('triggers logout alert when Log Out is pressed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const confirm = buttons?.find((b: any) => b.style === 'destructive');
      confirm?.onPress?.();
    });
    const { getByText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByText('Log Out'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    alertSpy.mockRestore();
  });

  it('navigates to ChangePassword when pressed', () => {
    const { getByText } = render(<SettingsScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByText('Change Password'));
    expect(nav.navigate).toHaveBeenCalledWith('ChangePassword');
  });
});
