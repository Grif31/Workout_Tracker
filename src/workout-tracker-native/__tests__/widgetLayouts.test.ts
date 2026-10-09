import fs from 'fs';
import path from 'path';
import { transformFileSync } from '@babel/core';
import { diagramKey, greekRankProps, upNextProps, weeklyGoalProps, withoutNulls, type WidgetImages } from '../utils/widgetProps';
import { buildGreekRank, buildRoutine, buildWeek, mergeSnapshot, WIDGET_STALE_AFTER_MS } from '../utils/widgetSnapshot';
import type { GreekRankData } from '../utils/greekRank';

// An iOS widget layout is shipped as a string and evaluated inside the widget
// extension, where only @expo/ui's components and modifiers exist as globals.
// Anything else it reaches for (an app constant, a helper, a typo) compiles
// and type-checks fine and then fails only on a phone. So each layout is
// compiled the way Metro does, run in a scope that records every free name it
// uses, and every name must be a JS built-in or an @expo/ui export.

// jest.setup.ts mocks ThemeContext for every test; the default accent comes from its real presets.
jest.unmock('../context/ThemeContext');

const ROOT = path.join(__dirname, '..');
const UI = path.join(ROOT, 'node_modules/@expo/ui/build/swift-ui');
// Every component @expo/ui exports: a folder can export several (Shapes has Circle, Capsule, ...)
const COMPONENTS = new Set(
  fs.readdirSync(UI)
    .filter(n => /^[A-Z]/.test(n) && fs.existsSync(path.join(UI, n, 'index.d.ts')))
    .flatMap(n => [...fs.readFileSync(path.join(UI, n, 'index.d.ts'), 'utf8').matchAll(/export declare function ([A-Z]\w*)/g)].map(m => m[1])),
);
const MODIFIERS = new Set(
  fs.readdirSync(path.join(UI, 'modifiers'))
    .filter(f => f.endsWith('.d.ts'))
    .flatMap(f => [...fs.readFileSync(path.join(UI, 'modifiers', f), 'utf8').matchAll(/export declare (?:const|function) (\w+)/g)].map(m => m[1])),
);
const JSX = new Set(['_jsx', '_jsxs', '_jsxDEV', '_Fragment', '_jsxFileName']);

function compileLayout(file: string): string {
  const code = transformFileSync(path.join(ROOT, file), {
    presets: ['babel-preset-expo'],
    filename: file,
    babelrc: false,
    configFile: false,
    caller: { name: 'metro', platform: 'ios', isDev: true } as any,
  })!.code!;
  // A template literal, escaped backticks and all
  const layout = code.match(/var \w+\s*=\s*(`(?:\\[\s\S]|[^`\\])*`)/);
  if (!layout) throw new Error(`${file}: the 'widget' directive didn't turn the layout into a string`);
  return new Function(`return ${layout[1]}`)();
}

type Node = { type: string; props: Record<string, any> };

function render(src: string, props: object, env: object) {
  const used = new Set<string>();
  const el = (type: unknown, p: Record<string, any>) => (typeof type === 'function' ? type(p) : { type, props: p });
  const scope = new Proxy({} as Record<string, unknown>, {
    has: (_, key) => typeof key === 'string' && !(key in globalThis),
    get: (_, key) => {
      if (typeof key !== 'string' || key === Symbol.unscopables as any) return undefined;
      used.add(key);
      if (JSX.has(key)) return key === '_Fragment' ? 'Fragment' : el;
      if (MODIFIERS.has(key)) return (...args: unknown[]) => ({ modifier: key, args });
      return key;
    },
  });
  // `with` is the one way to catch every free identifier the string resolves
  // eslint-disable-next-line no-new-func
  const layout = new Function('scope', `with (scope) { return (${src}); }`)(scope);
  const tree: Node = layout(props, env);
  const elements = new Set<string>();
  (function walk(n: any) {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    elements.add(n.type);
    walk(n.props?.children);
    walk(n.props?.currentValueLabel);
  })(tree);
  return { used, elements, tree };
}

function expectOnlyWidgetGlobals({ used, elements }: ReturnType<typeof render>) {
  const unknown = [...used].filter(n => !COMPONENTS.has(n) && !MODIFIERS.has(n) && !JSX.has(n));
  expect(unknown).toEqual([]);
  expect([...elements].filter(e => !COMPONENTS.has(e))).toEqual([]);
}

// What iOS receives. expo-widgets saves the timeline to UserDefaults, which
// refuses the whole timeline over one value that isn't a property list (a JS
// null arrives as NSNull): the widget then never leaves its placeholder.
function iosProps<T extends object>(props: T): T {
  const sent = withoutNulls(props);
  (function check(v: unknown, at: string) {
    if (v === null || v === undefined) throw new Error(`${at} is ${v}: not a property-list value`);
    if (Array.isArray(v)) return v.forEach((x, i) => check(x, `${at}[${i}]`));
    if (typeof v === 'object') return Object.entries(v as object).forEach(([k, x]) => check(x, `${at}.${k}`));
    if (!['string', 'number', 'boolean'].includes(typeof v)) throw new Error(`${at} is a ${typeof v}: not a property-list value`);
  })(sent, 'props');
  return sent;
}

const IMAGES: WidgetImages = { logoDark: 'file:///group/ExpoWidgets/logo_on_dark.png', logoLight: 'file:///group/ExpoWidgets/logo_on_light.png' };
const NOW = new Date(2026, 8, 24, 21, 30);
const week = buildWeek({
  goal: 3, workoutCount: 2, allWorkoutDates: ['2026-09-21', '2026-09-23'], streakWeeks: 6,
  distanceGoalKm: 24, distanceKm: 20, distanceUnit: 'mi',
}, NOW);
const rank = (over: Partial<GreekRankData>) => buildGreekRank({
  greek_rank: 'Hero', greek_score: 41, score_rank: 'Hero', held_by_gate: false, next_gate: null,
  gates: { Titan: 50, 'Aretē': 80 }, components: { consistency: 52, dedication: 38, volume: 29 },
  weights: { consistency: 0.4, dedication: 0.3, volume: 0.3 },
  performance: { strength: 44, endurance: null, best: 44 }, profile_missing: [], ...over,
});
const ppl = {
  id: 3, name: 'Push Pull Legs', days: [
    { day_order: 1, label: 'Push', workout_template: { exercises: [{ name: 'Bench Press', muscle_group: 'Chest' }] } },
    { day_order: 2, label: 'Pull', workout_template: { exercises: [{ name: 'Deadlift', muscle_group: 'Back' }, { name: 'Curl', muscle_group: 'Biceps' }] } },
  ],
};
// Held, top and fresh cover Up Next's next-day state; allDone and the others without a routine its other two
const fresh = mergeSnapshot(null, 7, { week, greekRank: rank({}), routine: buildRoutine(ppl, ['push'], NOW) }, NOW.getTime());
const allDone = mergeSnapshot(null, 7, { week, greekRank: rank({}), routine: buildRoutine(ppl, ['push', 'pull'], NOW) }, NOW.getTime());
const held = mergeSnapshot(null, 7, { week, greekRank: rank({ greek_rank: 'Olympian', greek_score: 84, score_rank: 'Titan', held_by_gate: true }) }, NOW.getTime());
const top = mergeSnapshot(null, 7, { week, greekRank: rank({ greek_rank: 'Aretē', greek_score: 95, performance: { strength: 90, endurance: null, best: 90 } }) }, NOW.getTime());
const staleAt = new Date(NOW.getTime() + WIDGET_STALE_AFTER_MS + 1);

const SNAPSHOTS = { fresh, held, top, allDone, loggedOut: null } as const;
const FAMILIES = {
  WeeklyGoalWidget: ['systemSmall', 'systemMedium', 'accessoryCircular', 'accessoryInline'],
  GreekRankWidget: ['systemSmall', 'systemMedium', 'accessoryRectangular'],
  UpNextWidget: ['systemSmall', 'systemMedium'],
} as const;

describe.each([
  ['widgets/WeeklyGoalWidget.tsx', 'WeeklyGoalWidget', weeklyGoalProps],
  ['widgets/GreekRankWidget.tsx', 'GreekRankWidget', greekRankProps],
  ['widgets/UpNextWidget.tsx', 'UpNextWidget', upNextProps],
] as const)('%s', (file, name, buildProps) => {
  const src = compileLayout(file);

  for (const family of FAMILIES[name]) {
    for (const colorScheme of ['dark', 'light']) {
      for (const [state, snapshot] of Object.entries(SNAPSHOTS)) {
        it(`${family}, ${colorScheme}, ${state}: uses only what the widget runtime has`, () => {
          const props = iosProps((buildProps as typeof weeklyGoalProps)(snapshot, NOW, IMAGES));
          expectOnlyWidgetGlobals(render(src, props, { widgetFamily: family, colorScheme, date: NOW }));
        });
      }
      it(`${family}, ${colorScheme}, stale: uses only what the widget runtime has`, () => {
        const props = iosProps((buildProps as typeof weeklyGoalProps)(fresh, staleAt, IMAGES));
        expect(props.stale).toBe(true);
        expectOnlyWidgetGlobals(render(src, props, { widgetFamily: family, colorScheme, date: staleAt }));
      });
    }
  }

  it('draws without logos, a gate or a distance goal: fields iOS never receives', () => {
    for (const family of FAMILIES[name]) {
      const props = iosProps((buildProps as typeof weeklyGoalProps)(fresh, NOW, { logoDark: null, logoLight: null }));
      expect(props).not.toHaveProperty('logoDark');
      expectOnlyWidgetGlobals(render(src, props, { widgetFamily: family, colorScheme: 'dark', date: NOW }));
    }
  });

  it('taps open the app on the widget\'s own link', () => {
    const props = (buildProps as typeof weeklyGoalProps)(fresh, NOW, IMAGES);
    const { tree } = render(src, props, { widgetFamily: 'systemSmall', colorScheme: 'dark', date: NOW });
    expect(tree.props.modifiers).toContainEqual({ modifier: 'widgetURL', args: [props.url] });
  });
});

// A Live Activity layout returns a region per presentation (banner, Dynamic
// Island) instead of one view, but runs under the same rule as a widget.
describe('widgets/WorkoutLiveActivity.tsx', () => {
  const src = compileLayout('widgets/WorkoutLiveActivity.tsx');
  const base = { name: 'Push Day', exercise: 'Bench Press', sets: '3/12 sets', progress: 0.25, setLine: 'Next set  ·  3 of 4', next: '8 × 185 lbs', startedAt: 1000, accent: '#fff' };
  const states = {
    working: base,
    paused: { ...base, pausedAt: 5000 },
    resting: { ...base, restEndsAt: 9000 },
    restPaused: { ...base, restPausedLeft: 42 },
    withLogo: { ...base, logo: 'file:///g/dark.png' },
    nothingLeft: { name: 'Push Day', exercise: 'Bench Press', sets: '12/12 sets', progress: 1, startedAt: 1000, accent: '#fff' },
  };

  it.each(Object.entries(states))('%s: uses only what the widget runtime has', (_, props) => {
    for (const [colorScheme, isStale] of [['dark', false], ['light', true]] as const) {
      const { used, tree } = render(src, props, { colorScheme, isStale });
      const regions = tree as unknown as Record<string, unknown>;
      expect(Object.keys(regions)).toEqual(expect.arrayContaining(['banner', 'compactLeading', 'compactTrailing', 'minimal', 'expandedBottom']));
      const unknown = [...used].filter(n => !COMPONENTS.has(n) && !MODIFIERS.has(n) && !JSX.has(n));
      expect(unknown).toEqual([]);
      const elements = new Set<string>();
      (function walk(n: any) {
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n || typeof n !== 'object') return;
        if (n.type) elements.add(n.type);
        walk(n.props?.children);
      })(Object.values(regions));
      expect([...elements].filter(e => !COMPONENTS.has(e))).toEqual([]);
    }
  });

  it('what iOS receives has no values a property list refuses', () => {
    for (const props of Object.values(states)) iosProps(props);
  });
});

describe('widgets/UpNextWidget.tsx with its muscle diagram', () => {
  const src = compileLayout('widgets/UpNextWidget.tsx');
  const images: WidgetImages = {
    ...IMAGES,
    diagrams: { [diagramKey(['Back', 'Biceps'], '#30D158', '#1C7F35')]: { dark: 'file:///group/d.png', light: 'file:///group/l.png' } },
  };

  it.each(['systemSmall', 'systemMedium'])('%s draws the rendered diagram for the next day', family => {
    const props = iosProps(upNextProps(fresh, NOW, images));
    expect(props.diagramDark).toBe('file:///group/d.png');
    const result = render(src, props, { widgetFamily: family, colorScheme: 'dark', date: NOW });
    expectOnlyWidgetGlobals(result);
    const uris: string[] = [];
    (function walk(n: any) {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== 'object') return;
      if (n.type === 'Image' && n.props.uiImage) uris.push(n.props.uiImage);
      walk(n.props?.children);
    })(result.tree);
    expect(uris).toContain('file:///group/d.png');
  });
});
