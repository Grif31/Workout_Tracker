/**
 * Source scans for bug patterns that have bitten this app, or that CLAUDE.md
 * forbids, but that no single screen test would notice until a user did.
 * Each rule reports file:line so a failure says exactly what to change.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const SOURCE_DIRS = ['screens', 'components', 'context', 'utils', 'navigation', 'constants', 'App.tsx'];

type Source = { file: string; code: string };

function collect(p: string, out: string[]) {
  if (!fs.existsSync(p)) return;
  if (fs.statSync(p).isDirectory()) {
    for (const f of fs.readdirSync(p)) collect(path.join(p, f), out);
  } else if (/\.(tsx?|jsx?)$/.test(p)) {
    out.push(p);
  }
}

// Comments are blanked (not removed) so reported line numbers stay right.
function stripComments(s: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return s.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:'"`])\/\/.*$/gm, (m, pre) => pre + blank(m.slice(pre.length)));
}

const files: string[] = [];
SOURCE_DIRS.forEach(d => collect(path.join(ROOT, d), files));
const sources: Source[] = files.map(f => ({
  file: path.relative(ROOT, f).split(path.sep).join('/'),
  code: stripComments(fs.readFileSync(f, 'utf8')),
}));

const lineOf = (code: string, index: number) => code.slice(0, index).split('\n').length;

function findAll(re: RegExp, filter?: (s: Source) => boolean): string[] {
  const hits: string[] = [];
  for (const s of sources) {
    if (filter && !filter(s)) continue;
    for (const m of s.code.matchAll(re)) hits.push(`${s.file}:${lineOf(s.code, m.index!)}  ${m[0].trim()}`);
  }
  return hits;
}

// The object literal starting at `open` (a '{'), braces balanced.
function objectAt(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(open, i + 1);
  }
  return code.slice(open);
}

describe('code guardrails', () => {
  it('scans the app source', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('never calls fetch directly (apiFetch attaches the JWT, base URL and local date)', () => {
    expect(findAll(/(^|[^\w.])fetch\(/gm, s => s.file !== 'utils/api.ts')).toEqual([]);
  });

  it('never derives a calendar day from toISOString() (UTC shifts the day in the Americas)', () => {
    expect(findAll(/toISOString\(\)\s*\.(split\(\s*['"]T|slice\(\s*0\s*,\s*10|substring\(\s*0\s*,\s*10)/g)).toEqual([]);
  });

  it('never parses a hardcoded bare date with new Date() (reads as UTC midnight)', () => {
    expect(findAll(/new Date\(\s*['"`]\d{4}-\d{2}-\d{2}['"`]\s*\)/g)).toEqual([]);
  });

  it('passes initial: false on every cross-tab navigate to a nested screen', () => {
    const bad: string[] = [];
    for (const s of sources) {
      for (const m of s.code.matchAll(/navigate\(\s*['"](\w+Tab)['"]\s*,\s*\{/g)) {
        const obj = objectAt(s.code, m.index! + m[0].length - 1);
        if (/\bscreen\s*:/.test(obj) && !/\binitial\s*:\s*false\b/.test(obj)) {
          bad.push(`${s.file}:${lineOf(s.code, m.index!)}  navigate('${m[1]}', ...) without initial: false`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('never passes a bare render function as ListHeaderComponent (remounts the header every render)', () => {
    expect(findAll(/ListHeaderComponent=\{\s*render\w*\s*\}/g)).toEqual([]);
  });

  it('clears every setInterval it starts', () => {
    const bad = sources
      .filter(s => /\bsetInterval\(/.test(s.code) && !/\bclearInterval\(/.test(s.code))
      .map(s => s.file);
    expect(bad).toEqual([]);
  });

  it('removes the Keyboard/AppState/Dimensions/BackHandler listeners it adds', () => {
    const bad: string[] = [];
    for (const s of sources) {
      const adds = (s.code.match(/\b(Keyboard|AppState|Dimensions|BackHandler|Linking)\.add(Event)?Listener\(/g) || []).length;
      const removes = (s.code.match(/\.remove\(\)/g) || []).length;
      if (adds > removes) bad.push(`${s.file}: ${adds} listeners added, ${removes} .remove() calls`);
    }
    expect(bad).toEqual([]);
  });

  it('imports by relative path, never a bare root path like utils/units', () => {
    // Metro only resolves the bare form through tsconfig's baseUrl. When that
    // lapsed the whole app failed to bundle on "Unable to resolve utils/units".
    expect(findAll(/from\s+['"](utils|theme|components|constants|context|navigation|screens|hooks)\//g)).toEqual([]);
  });

  it('draws the streak flame rather than the fire emoji (which renders per-platform and cannot be dimmed)', () => {
    expect(findAll(/\u{1F525}/gu)).toEqual([]);
  });

  it('never repeats an AsyncStorage key literal across files (share a constant instead)', () => {
    const byKey = new Map<string, Set<string>>();
    for (const s of sources) {
      const keyed = /AsyncStorage\.(?:getItem|setItem|removeItem|mergeItem)\(\s*(['"`])([^'"`$]+)/g;
      const listed = /AsyncStorage\.(?:multiGet|multiRemove|multiSet)\(\s*\[([^\]]*)\]/g;
      const add = (k: string) => {
        if (!byKey.has(k)) byKey.set(k, new Set());
        byKey.get(k)!.add(s.file);
      };
      // A key named in a `const ..._KEY = '...'` counts as a use of that
      // literal too. Without this, a key declared as a const in one file and
      // inlined into an AsyncStorage call in another registers in only one
      // file and slips through — which is exactly how
      // rest_timer_alerts_enabled lived in SettingsScreen and WorkoutLog at
      // once while this rule stayed green.
      const declared = /\bconst\s+[A-Za-z0-9_]*KEY\b\s*(?::[^=]+)?=\s*(['"`])([^'"`$]+)\1/g;
      for (const m of s.code.matchAll(keyed)) add(m[2]);
      for (const m of s.code.matchAll(declared)) add(m[2]);
      for (const m of s.code.matchAll(listed)) {
        for (const item of m[1].split(',')) {
          const k = /^\s*(['"`])([^'"`$]+)/.exec(item);
          if (k) add(k[2]);
        }
      }
    }
    const dupes = [...byKey].filter(([, f]) => f.size > 1).map(([k, f]) => `${k}: ${[...f].join(', ')}`);
    expect(dupes).toEqual([]);
  });
});
