import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { mockFetch, createMockNavigation, createMockRoute } from './testUtils';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';

jest.mock('../theme/authColors', () => ({ AUTH: { bg: '#000', text: '#fff', accent: '#30D158', subtext: '#aaa', placeholder: '#666', card: '#1c1c1e', border: '#333', inputBg: '#1c1c1e', danger: '#FF453A' } }));

const nav = createMockNavigation();
const route = createMockRoute('ForgotPassword');

describe('ForgotPasswordScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    render(<ForgotPasswordScreen navigation={nav as any} route={route as any} />);
  });

  it('displays the Reset Password heading', () => {
    const { getByText } = render(<ForgotPasswordScreen navigation={nav as any} route={route as any} />);
    expect(getByText('Reset Password')).toBeTruthy();
  });

  it('shows error when email is empty and submitted', () => {
    const { getByText } = render(<ForgotPasswordScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByText('Send Reset Link'));
    expect(getByText('Please enter your email address.')).toBeTruthy();
  });

  it('shows success message after successful API call', async () => {
    mockFetch({ message: 'Email sent' }, true);
    const { getByText, getByPlaceholderText } = render(
      <ForgotPasswordScreen navigation={nav as any} route={route as any} />
    );
    fireEvent.changeText(getByPlaceholderText('e.g. john@example.com'), 'test@example.com');
    fireEvent.press(getByText('Send Reset Link'));
    await waitFor(() => expect(getByText(/check your inbox/i)).toBeTruthy());
  });

  it('shows error on failed API call', async () => {
    mockFetch({ message: 'Email not found.' }, false, 404);
    const { getByText, getByPlaceholderText } = render(
      <ForgotPasswordScreen navigation={nav as any} route={route as any} />
    );
    fireEvent.changeText(getByPlaceholderText('e.g. john@example.com'), 'bad@example.com');
    fireEvent.press(getByText('Send Reset Link'));
    await waitFor(() => expect(getByText('Email not found.')).toBeTruthy());
  });
});
