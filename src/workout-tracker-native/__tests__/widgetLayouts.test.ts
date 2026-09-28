import fs from 'fs';
import path from 'path';
import { transformFileSync } from '@babel/core';
import { greekRankProps, weeklyGoalProps, withoutNulls, type WidgetImages } from '../utils/widgetProps';
import { buildGreekRank, buildWeek, mergeSnapshot, WIDGET_STALE_AFTER_MS } from '../utils/widgetSnapshot';
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
const fresh = mergeSnapshot(null, 7, { week, greekRank: rank({}) }, NOW.getTime());
const held = mergeSnapshot(null, 7, { week, greekRank: rank({ greek_rank: 'Olympian', greek_score: 84, score_rank: 'Titan', held_by_gate: true }) }, NOW.getTime());
const top = mergeSnapshot(null, 7, { week, greekRank: rank({ greek_rank: 'Aretē', greek_score: 95, performance: { strength: 90, endurance: null, best: 90 } }) }, NOW.getTime());
const staleAt = new Date(NOW.getTime() + WIDGET_STALE_AFTER_MS + 1);

const SNAPSHOTS = { fresh, held, top, loggedOut: null } as const;
const FAMILIES = {
  WeeklyGoalWidget: ['systemSmall', 'systemMedium', 'accessoryCircular', 'accessoryInline'],
  GreekRankWidget: ['systemSmall', 'systemMedium', 'accessoryRectangular'],
} as const;

describe.each([
  ['widgets/WeeklyGoalWidget.tsx', 'WeeklyGoalWidget', weeklyGoalProps],
  ['widgets/GreekRankWidget.tsx', 'GreekRankWidget', greekRankProps],
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
