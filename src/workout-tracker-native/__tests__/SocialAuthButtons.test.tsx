import React from 'react';
import { Platform } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import SocialAuthButtons from '../components/SocialAuthButtons';

jest.mock('../theme/authColors', () => ({ AUTH: { bg: '#000', text: '#fff', accent: '#30D158', subtext: '#aaa', placeholder: '#666', card: '#1c1c1e', border: '#333' } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

describe('SocialAuthButtons', () => {
  const onApple = jest.fn();
  const onGoogle = jest.fn();
  const onFacebook = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<SocialAuthButtons onApple={onApple} onGoogle={onGoogle} onFacebook={onFacebook} />);
  });

  it('displays the default label', () => {
    const { getByText } = render(
      <SocialAuthButtons onApple={onApple} onGoogle={onGoogle} onFacebook={onFacebook} />
    );
    expect(getByText('or continue with')).toBeTruthy();
  });

  it('displays a custom label', () => {
    const { getByText } = render(
      <SocialAuthButtons onApple={onApple} onGoogle={onGoogle} onFacebook={onFacebook} label="or sign in with" />
    );
    expect(getByText('or sign in with')).toBeTruthy();
  });

  it('calls onApple when Apple button pressed', () => {
    const { getByText } = render(
      <SocialAuthButtons onApple={onApple} onGoogle={onGoogle} onFacebook={onFacebook} />
    );
    fireEvent.press(getByText('Apple'));
    expect(onApple).toHaveBeenCalledTimes(1);
  });

  it('shows nothing on Android, where there is no sign-in button to offer', () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    try {
      const { queryByText } = render(
        <SocialAuthButtons onApple={onApple} onGoogle={onGoogle} onFacebook={onFacebook} label="or sign up with" />
      );
      // Not even the divider: it used to lead to an empty row
      expect(queryByText('or sign up with')).toBeNull();
      expect(queryByText('Apple')).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
    }
  });
});
