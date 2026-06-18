import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WelcomeScreen from '../screens/Auth/WelcomeScreen';
import { createMockNavigation, createMockRoute } from './testUtils';

jest.mock('../hooks/useSocialAuth', () => ({
  useSocialAuth: () => ({
    handleApple: jest.fn(),
    handleGoogle: jest.fn(),
    handleFacebook: jest.fn(),
  }),
}));

jest.mock('../theme/authColors', () => ({ AUTH: { bg: '#000', text: '#fff', accent: '#30D158', subtext: '#aaa', placeholder: '#666', card: '#1c1c1e', border: '#333' } }));

const nav = createMockNavigation();
const route = createMockRoute('Welcome');

describe('WelcomeScreen', () => {
  it('renders without crashing', () => {
    render(<WelcomeScreen navigation={nav as any} route={route as any} />);
  });

  it('displays the tagline', () => {
    const { getByText } = render(<WelcomeScreen navigation={nav as any} route={route as any} />);
    expect(getByText('Strive for Excellence')).toBeTruthy();
  });

  it('navigates to Signup when Sign Up is pressed', () => {
    const { getByText } = render(<WelcomeScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByText('Sign Up'));
    expect(nav.navigate).toHaveBeenCalledWith('Signup');
  });

  it('navigates to Login when Log In is pressed', () => {
    const { getByText } = render(<WelcomeScreen navigation={nav as any} route={route as any} />);
    fireEvent.press(getByText('Log In'));
    expect(nav.navigate).toHaveBeenCalledWith('Login');
  });
});
