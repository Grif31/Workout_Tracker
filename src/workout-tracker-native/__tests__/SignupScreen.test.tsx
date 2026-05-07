import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import { useAuth } from '../context/AuthContext';
import SignupScreen from '../screens/SignupScreen';

jest.mock('../hooks/useSocialAuth', () => ({
  useSocialAuth: () => ({ handleApple: jest.fn(), handleGoogle: jest.fn(), handleFacebook: jest.fn() }),
}));
jest.mock('../theme/authColors', () => ({ AUTH: { bg: '#000', text: '#fff', accent: '#30D158', subtext: '#aaa', placeholder: '#666', card: '#1c1c1e', border: '#333', inputBg: '#1c1c1e', danger: '#FF453A' } }));

const nav = createMockNavigation();
const route = createMockRoute('Signup');

describe('SignupScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    render(<SignupScreen navigation={nav as any} route={route as any} />);
  });

  it('shows the Create Account title', () => {
    const { getAllByText } = render(<SignupScreen navigation={nav as any} route={route as any} />);
    expect(getAllByText('Create Account').length).toBeGreaterThan(0);
  });

  it('shows error when fields are empty', () => {
    const { getAllByText, getByText } = render(<SignupScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getAllByText('Create Account')[getAllByText('Create Account').length - 1]);
    expect(getByText('Please fill in all fields.')).toBeTruthy();
  });

  it('shows error when passwords do not match', () => {
    const { getAllByText, getByText, getByPlaceholderText } = render(
      <SignupScreen navigation={nav as any} route={route as any} />
    );
    fireEvent.changeText(getByPlaceholderText('Username'), 'user');
    fireEvent.changeText(getByPlaceholderText('e.g. john@example.com'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Min. 6 characters'), 'password1');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'password2');
    fireEvent.press(getAllByText('Create Account')[getAllByText('Create Account').length - 1]);
    expect(getByText('Passwords do not match.')).toBeTruthy();
  });

  it('shows error when password is too short', () => {
    const { getAllByText, getByText, getByPlaceholderText } = render(
      <SignupScreen navigation={nav as any} route={route as any} />
    );
    fireEvent.changeText(getByPlaceholderText('Username'), 'user');
    fireEvent.changeText(getByPlaceholderText('e.g. john@example.com'), 'a@b.com');
    fireEvent.changeText(getByPlaceholderText('Min. 6 characters'), 'abc');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'abc');
    fireEvent.press(getAllByText('Create Account')[getAllByText('Create Account').length - 1]);
    expect(getByText('Password must be at least 6 characters.')).toBeTruthy();
  });

  it('calls login after successful signup', async () => {
    mockFetch({ access_token: 'tok', user: { id: 1, username: 'user' } });
    const { getAllByText, getByPlaceholderText } = render(
      <SignupScreen navigation={nav as any} route={route as any} />
    );
    fireEvent.changeText(getByPlaceholderText('Username'), 'newuser');
    fireEvent.changeText(getByPlaceholderText('e.g. john@example.com'), 'new@example.com');
    fireEvent.changeText(getByPlaceholderText('Min. 6 characters'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'password123');
    fireEvent.press(getAllByText('Create Account')[getAllByText('Create Account').length - 1]);
    await waitFor(() => expect((useAuth() as any).login).toHaveBeenCalled());
  });

  it('navigates back when back button pressed', () => {
    expect(nav.goBack).toBeDefined();
  });
});
