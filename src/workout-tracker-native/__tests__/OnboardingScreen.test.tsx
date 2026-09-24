/**
 * Post-signup coach setup: a chat that collects goal, experience, days,
 * equipment, session length and injuries, then optionally generates a starting
 * routine. What must hold: the answers reach the key the Coach tab actually
 * reads (coach_profile, not the legacy coach_settings), onboarding is marked
 * complete on every exit, and a failed generation still lets the user in.
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mockUser } from './testUtils';
import OnboardingScreen from '../screens/Auth/OnboardingScreen';
import { ONBOARDING_COMPLETE_KEY, WEEKLY_GOAL_KEY } from '../constants/storageKeys';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const COACH_PROFILE = `coach_profile_${mockUser.id}`;

const GENERATED = {
  name: 'AI Push Pull Legs',
  description: '3-day split',
  days: [{ label: 'Push', exercises: [{ id: 3, prescribed_sets: 4, prescribed_reps: '8', prescribed_rpe: 8 }] }],
};

let handlers: Record<string, any>;

function installServer(overrides: Record<string, any> = {}) {
  handlers = { '/api/ai/generate': GENERATED, '/api/ai/save': { id: 99 }, ...overrides };
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    const body = handlers[path];
    return Promise.resolve({
      ok: body !== null,
      status: body === null ? 500 : 200,
      json: () => Promise.resolve(body ?? {}),
    });
  });
}

const bodyOf = (path: string) => {
  const call = (global.fetch as jest.Mock).mock.calls.find(([u]) => String(u).endsWith(path));
  return call ? JSON.parse(call[1].body) : null;
};

// Walks the chat by tapping one option per step, waiting out the 600ms
// scripted "typing" pause before the next question appears. Real timers: the
// typing indicator animates in a loop, which under fake timers keeps firing
// into the unmounted tree and wedges the following test.
async function answer(r: any, label: string, next: string | RegExp) {
  fireEvent.press(r.getByText(label));
  await waitFor(() => expect(r.getByText(next)).toBeTruthy());
}

async function completeChat(r: any, { routine, ends = routine ? 'View My Program' : 'Continue' }: { routine: boolean; ends?: string }) {
  await answer(r, 'Build Muscle', 'Under 1 year');
  await answer(r, 'Under 1 year', '4 days');
  await answer(r, '4 days', 'Full gym');
  await answer(r, 'Full gym', '60–75 min');
  await answer(r, '60–75 min', 'All clear');
  await answer(r, 'All clear', routine ? 'Yes, build my program' : 'Maybe later');
  fireEvent.press(r.getByText(routine ? 'Yes, build my program' : 'Maybe later'));
  await waitFor(() => expect(r.getByText(ends)).toBeTruthy());
}

function renderScreen() {
  const onComplete = jest.fn();
  // Rendered standalone: the screen only reads onComplete, not nav/route.
  const utils = render(<OnboardingScreen {...({ onComplete } as any)} />);
  return { ...utils, onComplete };
}

describe('OnboardingScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    installServer();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('opens on the goal question', () => {
    const r = renderScreen();
    expect(r.getByText(/What's your main goal/)).toBeTruthy();
  });

  it('asks the next question after each answer', async () => {
    const r = renderScreen();
    await answer(r, 'Build Muscle', /How long have you been training/);
    await answer(r, 'Under 1 year', /How many days per week/);
  });

  describe('finishing without a program', () => {
    it('saves the answers where the Coach tab reads them', async () => {
      const r = renderScreen();
      await completeChat(r, { routine: false });
      await act(async () => { fireEvent.press(r.getByText('Continue')); });

      const profile = JSON.parse((await AsyncStorage.getItem(COACH_PROFILE))!);
      expect(profile).toMatchObject({
        goal: 'hypertrophy',
        experience: 'beginner',
        equipment: 'full_gym',
        days_per_week: 4,
        session_length_min: 60,
      });
      // The weekly workout goal follows the days answered here
      expect(await AsyncStorage.getItem(`${WEEKLY_GOAL_KEY}_${mockUser.id}`)).toBe('4');
      expect(await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)).toBe('true');
      expect(r.onComplete).toHaveBeenCalled();
      expect((global.fetch as jest.Mock)).not.toHaveBeenCalled();
    });
  });

  describe('generating a starting program', () => {
    it('generates then saves the routine, passing the prescribed sets through', async () => {
      const r = renderScreen();
      await completeChat(r, { routine: true });

      expect(bodyOf('/api/ai/generate')).toMatchObject({
        goal: 'hypertrophy', experience: 'beginner', equipment: 'full_gym',
        session_length_min: 60, generate_type: 'routine',
      });
      const saved = bodyOf('/api/ai/save');
      expect(saved.name).toBe('AI Push Pull Legs');
      expect(saved.days[0].programming[0]).toMatchObject({ exercise_template_id: 3, sets: 4, reps: '8', rpe: 8 });
    });

    it('lets the user in anyway when the AI call fails', async () => {
      installServer({ '/api/ai/generate': null });
      const r = renderScreen();
      await completeChat(r, { routine: true, ends: 'Continue' });
      await act(async () => { fireEvent.press(r.getByText('Continue')); });
      expect(r.onComplete).toHaveBeenCalled();
      expect(await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)).toBe('true');
    });

    it('still finishes when the routine generates but cannot be saved', async () => {
      installServer({ '/api/ai/save': null });
      const r = renderScreen();
      await completeChat(r, { routine: true, ends: 'Continue' });
    });
  });

  describe('skipping', () => {
    it('confirms first, then marks onboarding done', async () => {
      alertSpy.mockImplementation((_t, _m, buttons?: any[]) => {
        buttons?.find(b => b.text === 'Skip')?.onPress?.();
      });
      const r = renderScreen();
      await act(async () => { fireEvent.press(r.getByText('Skip')); });

      expect(alertSpy).toHaveBeenCalledWith('Skip coach setup?', expect.any(String), expect.any(Array));
      expect(r.onComplete).toHaveBeenCalled();
      expect(await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)).toBe('true');
      // Nothing was answered, so no coach profile is written
      expect(await AsyncStorage.getItem(COACH_PROFILE)).toBeNull();
    });

    it('stays put when the user backs out of skipping', async () => {
      alertSpy.mockImplementation((_t, _m, buttons?: any[]) => {
        buttons?.find(b => b.text === 'Keep Going')?.onPress?.();
      });
      const r = renderScreen();
      await act(async () => { fireEvent.press(r.getByText('Skip')); });
      expect(r.onComplete).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)).toBeNull();
    });
  });
});
