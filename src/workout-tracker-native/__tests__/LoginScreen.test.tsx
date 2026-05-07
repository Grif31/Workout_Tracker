import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';

jest.mock('../hooks/useSocialAuth', () => ({
  useSocialAuth: () => ({ handleApple: jest.fn(), handleGoogle: jest.fn(), handleFacebook: jest.fn() }),
}));
jest.mock('../theme/authColors', () => ({ AUTH: { bg: '#000', text: '#fff', accent: '#30D158', subtext: '#aaa', placeholder: '#666', card: '#1c1c1e', border: '#333', inputBg: '#1c1c1e', danger: '#FF453A' } }));

const nav = createMockNavigation();
const route = createMockRoute('Login');

describe('LoginScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    render(<LoginScreen navigation={nav as any} route={route as any} />);
  });

  it('shows the title', () => {
    const { getByText } = render(<LoginScreen navigation={nav as any} route={route as any} />);
    expect(getByText('Welcome Back')).toBeTruthy();
  });

  it('shows an error when fields are empty and Log In pressed', () => {
    const { getByText } = render(<LoginScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByText('Log In'));
    expect(getByText('Please fill in all fields.')).toBeTruthy();
  });

  it('calls login on successful API response', async () => {
    mockFetch({ access_token: 'tok', user: { id: 1 } });
    const { getByText, getByPlaceholderText } = render(
      <LoginScreen navigation={nav as any} route={route as any} />
    );
    fireEvent.changeText(getByPlaceholderText('e.g. john@example.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Min. 6 characters'), 'password123');
    fireEvent.press(getByText('Log In'));
    await waitFor(() => expect((useAuth() as any).login).toHaveBeenCalled());
  });

  it('shows API error message on failed login', async () => {
    mockFetch({ message: 'Invalid credentials.' }, false, 401);
    const { getByText, getByPlaceholderText } = render(
      <LoginScreen navigation={nav as any} route={route as any} />
    );
    fireEvent.changeText(getByPlaceholderText('e.g. john@example.com'), 'bad@example.com');
    fireEvent.changeText(getByPlaceholderText('Min. 6 characters'), 'wrongpass');
    fireEvent.press(getByText('Log In'));
    await waitFor(() => expect(getByText('Invalid credentials.')).toBeTruthy());
  });

  it('navigates to Signup when Sign Up link pressed', () => {
    const { getByText } = render(<LoginScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByText(' Sign Up'));
    expect(nav.navigate).toHaveBeenCalledWith('Signup');
  });

  it('navigates to ForgotPassword when link pressed', () => {
    const { getByText } = render(<LoginScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByText('Forgot Password?'));
    expect(nav.navigate).toHaveBeenCalledWith('ForgotPassword');
  });
});
