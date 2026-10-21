/**
 * Coach tab home: the Plans (routines and templates) and Coach (AI) sections.
 * The fake server below answers by path and each test overrides only what it
 * cares about.
 *
 * The behaviours that matter here: which section opens first, that the Greek
 * rank comes from its own endpoint (strength-score 422s without gender), that
 * logging a template goes through buildTemplatePrefill with initial: false,
 * and that cached AI insights render without a network call.
 */
import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMockNavigation, createMockRoute, mockUser } from './testUtils';
import CoachScreen from '../screens/TrainingTab/CoachScreen';
import { appCache } from '../utils/appCache';
import Collapsible from '../components/Collapsible';
import { COACH_INSIGHTS_KEY } from '../constants/storageKeys';
import { COACH_PROFILE_KEY } from '../components/coach/CoachProfileModal';

jest.mock('theme/typography', () => ({ typography: { fontSize: { xs: 11, sm: 14, md: 16, lg: 20, xl: 22, xxl: 28 } } }));
jest.mock('theme/spacing', () => ({ spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, radius: { sm: 8, md: 12, lg: 16, full: 9999 } }));

const route = createMockRoute('CoachHome');

const TEMPLATE = {
  id: 7,
  name: 'Push Day',
  programming_json: JSON.stringify([{ exercise_template_id: 3, sets: 4, reps: '8', rpe: 8 }]),
  exercises: [{ id: 3, name: 'Bench Press', muscle_group: 'Chest', equipment: 'Barbell', image_url: 'http://x/bench.gif' }],
};

let routes: Record<string, any>;

function installServer(overrides: Record<string, any> = {}) {
  routes = {
    '/api/stats/progress': { buckets: [] },
    '/api/workout-templates': [TEMPLATE],
    '/api/routines': [],
    '/api/stats/strength-score': { overall: 62, overall_rank: { label: 'Advanced', display: 'Advanced' } },
    '/api/stats/endurance-score': { overall: 55, overall_rank: { label: 'Intermediate', display: 'Intermediate' } },
    '/api/stats/greek-rank': { greek_rank: 'Hero', greek_score: 40 },
    '/api/stats/muscle-volume': { muscle_sets: { Chest: 12 }, last_trained: {}, total_sets: 12, last_week_total: 10, week_start: '2026-09-21' },
    '/api/stats/weekly-summary': null,
    ...overrides,
  };
  (global.fetch as jest.Mock) = jest.fn((url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const body = Object.entries(routes).find(([p]) => path.startsWith(p))?.[1];
    return Promise.resolve({
      ok: body !== undefined && body !== null,
      status: body == null ? 404 : 200,
      json: () => Promise.resolve(body ?? {}),
    });
  });
}

const urlsCalled = () => (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));

async function renderScreen() {
  const nav = createMockNavigation();
  const utils = render(<CoachScreen navigation={nav as any} route={route as any} />);
  await act(async () => {});
  return { ...utils, nav };
}

describe('CoachScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    appCache.clear();
    await AsyncStorage.clear();
    installServer();
  });

  it('opens on Coach for someone with no active routine, with Plans beside it', async () => {
    const { getByText, queryByText } = await renderScreen();
    await waitFor(() => expect(getByText('Hero')).toBeTruthy());
    expect(getByText('Plans')).toBeTruthy();
    expect(queryByText('Progress')).toBeNull();
  });

  it('opens on Plans for someone following a routine', async () => {
    const auth = require('../context/AuthContext');
    const real = auth.useAuth();
    const spy = jest.spyOn(auth, 'useAuth').mockReturnValue({ ...real, user: { ...real.user, active_routine_id: 9 } });
    // The routes table matches by prefix, so the list route would answer the routine's own path
    const base = (global.fetch as jest.Mock).getMockImplementation()!;
    (global.fetch as jest.Mock).mockImplementation((url: string) => String(url).includes('/api/routines/9')
      ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 9, name: 'Upper Lower', days: [] }) })
      : base(url));
    try {
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText('Push Day')).toBeTruthy());
    } finally {
      spy.mockRestore();
    }
  });

  it("shows the routine's next day on Plans and starts it in the workout log", async () => {
    const auth = require('../context/AuthContext');
    const real = auth.useAuth();
    const spy = jest.spyOn(auth, 'useAuth').mockReturnValue({ ...real, user: { ...real.user, active_routine_id: 9 } });
    const day = (id: number, order: number, label: string) => ({
      id, day_order: order, label,
      workout_template: { id: 50 + id, name: label, exercises: TEMPLATE.exercises, programming_json: TEMPLATE.programming_json },
    });
    const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };
    const base = (global.fetch as jest.Mock).getMockImplementation()!;
    const ok = (body: any) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/api/routines/9')) return ok({ id: 9, name: 'Upper Lower', days: [day(1, 0, 'Upper'), day(2, 1, 'Lower')] });
      if (u.includes('/api/workouts?')) return ok({ workouts: [
        { id: 1, name: 'Lower', date: daysAgo(3) },
        { id: 2, name: 'Upper', date: daysAgo(1) },
      ] });
      return base(url);
    });
    try {
      const r = await renderScreen();
      await waitFor(() => expect(r.getByText('Up next · Day 2 of 2')).toBeTruthy());
      expect(r.getByText('Lower')).toBeTruthy();
      expect(r.getByText('1 exercise · last done 3 days ago')).toBeTruthy();
      // The day's exercises with their programmed sets and reps
      expect(r.getByText('Bench Press')).toBeTruthy();
      expect(r.getByText('4 × 8')).toBeTruthy();
      expect(r.getByText('Start Lower')).toBeTruthy();
      fireEvent.press(r.getByLabelText('Start Lower'));
      expect(r.nav.navigate).toHaveBeenCalledWith('DashboardTab', expect.objectContaining({
        screen: 'WorkoutLog',
        initial: false,
        params: expect.objectContaining({ prefill: expect.objectContaining({ name: 'Lower' }) }),
      }));
    } finally {
      spy.mockRestore();
    }
  });

  describe('rank', () => {
    it('reads the Greek rank from its own endpoint, which needs no gender', async () => {
      await renderScreen();
      await waitFor(() => expect(urlsCalled().some(u => u.includes('/api/stats/greek-rank'))).toBe(true));
    });

    it('still shows the rank when the strength score is gated on a missing profile', async () => {
      // strength-score 422s without gender; the rank must survive that
      installServer({ '/api/stats/strength-score': null });
      const { getByText } = await renderScreen();
      await waitFor(() => expect(getByText('Coach')).toBeTruthy());
      fireEvent.press(getByText('Coach'));
      await waitFor(() => expect(getByText('Hero')).toBeTruthy());
    });

  });

  describe('plans tab', () => {
    const openTraining = async (r: any) => {
      fireEvent.press(r.getByText('Plans'));
      await waitFor(() => expect(r.getByText('Push Day')).toBeTruthy());
    };

    it('lists the user templates', async () => {
      const r = await renderScreen();
      await openTraining(r);
    });

    it('logs a template through buildTemplatePrefill, carrying GIFs and programming', async () => {
      const r = await renderScreen();
      await openTraining(r);
      fireEvent.press(r.getByText('Log'));

      expect(r.nav.navigate).toHaveBeenCalledWith('DashboardTab', expect.objectContaining({
        screen: 'WorkoutLog',
        // Without initial: false the back button strands the user on Dashboard
        initial: false,
      }));
      const [, params] = r.nav.navigate.mock.calls.find((c: any[]) => c[0] === 'DashboardTab');
      const prefill = params.params.prefill;
      expect(prefill.name).toBe('Push Day');
      const [exercise] = prefill.exercises;
      expect(exercise.name).toBe('Bench Press');
      expect(exercise.image_url).toBe('http://x/bench.gif');   // demo GIF survives the hand-off
      expect(exercise.sets).toHaveLength(4);                   // programmed sets, not a bare row
      expect(exercise.sets[0]).toMatchObject({ reps: '8', rpe: '8' });
    });

    it('keeps templates past the first six in a collapsible block that Show All opens', async () => {
      const many = Array.from({ length: 8 }, (_, i) => ({ ...TEMPLATE, id: 100 + i, name: `Template ${i + 1}` }));
      installServer({ '/api/workout-templates': many });
      const r = await renderScreen();
      fireEvent.press(r.getByText('Plans'));
      await waitFor(() => expect(r.getByText('Show All (8)')).toBeTruthy());

      const block = r.UNSAFE_getByType(Collapsible);
      const inside = (name: string) => block.findAll(n => n.props.children === name).length > 0;
      // Six always shown (three rows of two), outside it; the other two live inside it, closed.
      for (let i = 1; i <= 6; i++) expect(inside(`Template ${i}`)).toBe(false);
      expect(inside('Template 7')).toBe(true);
      expect(inside('Template 8')).toBe(true);
      expect(block.props.expanded).toBe(false);

      fireEvent.press(r.getByText('Show All (8)'));
      expect(r.UNSAFE_getByType(Collapsible).props.expanded).toBe(true);
      fireEvent.press(r.getByText('Show Less'));
      expect(r.UNSAFE_getByType(Collapsible).props.expanded).toBe(false);
    });

    it('has no collapsible block or toggle with six templates or fewer', async () => {
      const six = Array.from({ length: 6 }, (_, i) => ({ ...TEMPLATE, id: 100 + i, name: i === 0 ? 'Push Day' : `Template ${i + 1}` }));
      installServer({ '/api/workout-templates': six });
      const r = await renderScreen();
      await openTraining(r);
      expect(r.UNSAFE_queryAllByType(Collapsible)).toHaveLength(0);
      expect(r.queryByText(/Show All/)).toBeNull();
    });

    it('opens a template detail', async () => {
      const r = await renderScreen();
      await openTraining(r);
      fireEvent.press(r.getByText('Push Day'));
      expect(r.nav.navigate).toHaveBeenCalledWith('TemplateDetail', { templateId: 7 });
    });
  });

  describe('AI insights', () => {
    const cached = {
      insights: [{ type: 'achievement', title: 'Bench is climbing', body: 'Up 15 lbs in 3 weeks.' }],
      fetchedAt: Date.now(),
    };

    it('shows cached insights without asking the AI again', async () => {
      await AsyncStorage.setItem(COACH_INSIGHTS_KEY, JSON.stringify(cached));
      const r = await renderScreen();
      fireEvent.press(r.getByText('Coach'));
      await waitFor(() => expect(r.getByText('Bench is climbing')).toBeTruthy());
      expect(urlsCalled().some(u => u.includes('/api/ai/insights'))).toBe(false);
    });

    it('says how old the insights are', async () => {
      await AsyncStorage.setItem(COACH_INSIGHTS_KEY, JSON.stringify({ ...cached, fetchedAt: new Date(Date.now() - 25 * 60_000).toISOString() }));
      const r = await renderScreen();
      fireEvent.press(r.getByText('Coach'));
      await waitFor(() => expect(r.getByText('Updated 25 min ago')).toBeTruthy());
    });

    it('sends every area flagged to avoid, not just the first', async () => {
      await AsyncStorage.setItem(`${COACH_PROFILE_KEY}_${mockUser.id}`, JSON.stringify({ avoid: ['knees', 'lower_back'] }));
      installServer({ '/api/ai/insights': { insights: [{ type: 'suggestion', title: 'T', body: 'B', priority: 'low' }] } });
      const r = await renderScreen();
      fireEvent.press(r.getByText('Coach'));
      const button = await r.findByText('Generate Insights');
      await act(async () => { fireEvent.press(button); });

      const [, init] = (global.fetch as jest.Mock).mock.calls.find(([u]) => String(u).includes('/api/ai/insights'));
      expect(JSON.parse(init.body).avoid).toEqual(['knees', 'lower_back']);
    });

    const feedbackBodies = () => (global.fetch as jest.Mock).mock.calls
      .filter(([u]) => String(u).includes('/api/ai/insights/feedback'))
      .map(([, init]) => JSON.parse(init.body));

    it('sends a vote with the insight it is about, and a second press takes it back', async () => {
      installServer({ '/api/ai/insights/feedback': { message: 'ok' } });
      await AsyncStorage.setItem(COACH_INSIGHTS_KEY, JSON.stringify(cached));
      const r = await renderScreen();
      fireEvent.press(r.getByText('Coach'));
      const helpful = await r.findByLabelText('Helpful');

      await act(async () => { fireEvent.press(helpful); });
      expect(feedbackBodies()).toEqual([
        { type: 'achievement', title: 'Bench is climbing', body: 'Up 15 lbs in 3 weeks.', helpful: true, reason: null },
      ]);
      expect(r.getByText('Thanks. The Coach will use this.')).toBeTruthy();
      expect(r.getByLabelText('Helpful').props.accessibilityState.selected).toBe(true);
      await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(COACH_INSIGHTS_KEY))!).insights[0].helpful).toBe(true));

      await act(async () => { fireEvent.press(r.getByLabelText('Helpful')); });
      expect(feedbackBodies()[1].helpful).toBeNull();
      expect(r.getByLabelText('Helpful').props.accessibilityState.selected).toBe(false);
    });

    it('asks what was off after a thumbs down, and sends the reason picked', async () => {
      installServer({ '/api/ai/insights/feedback': { message: 'ok' } });
      await AsyncStorage.setItem(COACH_INSIGHTS_KEY, JSON.stringify(cached));
      const r = await renderScreen();
      fireEvent.press(r.getByText('Coach'));
      await r.findByLabelText('Not helpful');
      expect(r.queryByText('Too vague')).toBeNull();

      await act(async () => { fireEvent.press(r.getByLabelText('Not helpful')); });
      await act(async () => { fireEvent.press(r.getByText('Too vague')); });
      expect(feedbackBodies()[1]).toMatchObject({ helpful: false, reason: 'vague' });

      // Back to a thumbs up drops the reason and the chips
      await act(async () => { fireEvent.press(r.getByLabelText('Helpful')); });
      expect(feedbackBodies()[2]).toMatchObject({ helpful: true, reason: null });
      expect(r.queryByText('Too vague')).toBeNull();
    });

    it('keeps a vote the server sends back with a repeated insight, and says votes shaped the batch', async () => {
      installServer({
        '/api/ai/insights': {
          insights: [{ type: 'suggestion', title: 'T', body: 'B', priority: 'low', helpful: false, reason: 'known' }],
          shaped_by_feedback: true,
          generated_at: new Date().toISOString(),
        },
      });
      const r = await renderScreen();
      fireEvent.press(r.getByText('Coach'));
      const button = await r.findByText('Generate Insights');
      await act(async () => { fireEvent.press(button); });

      expect(r.getByLabelText('Not helpful').props.accessibilityState.selected).toBe(true);
      expect(r.getByText('Already knew this')).toBeTruthy();
      expect(r.getByText(/Shaped by your feedback/)).toBeTruthy();
    });

    it('does not replay the cards entrance on a vote or a reason', async () => {
      const { Animated } = require('react-native');
      installServer({ '/api/ai/insights/feedback': { message: 'ok' } });
      await AsyncStorage.setItem(COACH_INSIGHTS_KEY, JSON.stringify(cached));
      const r = await renderScreen();
      fireEvent.press(r.getByText('Coach'));
      await r.findByLabelText('Not helpful');
      const stagger = jest.spyOn(Animated, 'stagger');
      try {
        await act(async () => { fireEvent.press(r.getByLabelText('Not helpful')); });
        await act(async () => { fireEvent.press(r.getByText('Too vague')); });
        expect(stagger).not.toHaveBeenCalled();
      } finally {
        stagger.mockRestore();
      }
    });

    it('puts the vote back when the server refuses it', async () => {
      installServer({ '/api/ai/insights/feedback': null });
      await AsyncStorage.setItem(COACH_INSIGHTS_KEY, JSON.stringify(cached));
      const r = await renderScreen();
      fireEvent.press(r.getByText('Coach'));
      const notHelpful = await r.findByLabelText('Not helpful');
      await act(async () => { fireEvent.press(notHelpful); });
      expect(feedbackBodies()[0].helpful).toBe(false);
      expect(r.getByLabelText('Not helpful').props.accessibilityState.selected).toBe(false);
    });
  });

});
