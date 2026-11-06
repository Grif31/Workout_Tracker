// Lays out the engraved back of a badge (TODO §27 Detailing): every line has
// to fit the outline at its own height, not just a round mock. Text can't be
// measured synchronously in react-native-svg, so widths are estimated from a
// per-character table for the bold system font; the estimates run a little
// wide, which errs toward fitting.

export type BackRow = [number, number]; // [centre x, half-width] at a whole y

export interface BackLineSpec {
  text: string;
  size: number;
  /** The smallest this line may shrink to, as a fraction of `size` */
  floor?: number;
  weight: '500' | '600' | '700' | '800';
  spacing?: number;
  italic?: boolean;
  tone: 'strong' | 'soft';
  /** Embossed with a dark copy below (name and date) */
  emboss?: boolean;
  /** Wraps onto up to this many lines when too wide (the name onto 2, the meaning onto 3) */
  maxLines?: number;
  /** The name's meaning: the first thing dropped if nothing else fits */
  meaning?: boolean;
  /** Cut with an ellipsis when too wide (a workout name) */
  ellipsize?: boolean;
  /** A thin rule drawn after this line */
  ruleAfter?: boolean;
}

export interface PlacedLine {
  text: string;
  x: number;
  y: number;
  size: number;
  weight: BackLineSpec['weight'];
  spacing: number;
  italic: boolean;
  tone: BackLineSpec['tone'];
  emboss: boolean;
}

export interface PlacedRule { x1: number; x2: number; y: number }

export interface BackLayout { lines: PlacedLine[]; rules: PlacedRule[] }

const NARROW = new Set("iljtfI.,:;'!|()’");
const WIDE = new Set('MWmw@%');

/** Width of one line in the badge's units */
export function estimateWidth(text: string, size: number, weight: BackLineSpec['weight'], spacing = 0): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.28;
    else if (NARROW.has(ch)) em += 0.3;
    else if (WIDE.has(ch)) em += 0.86;
    else if (/[A-Z0-9]/.test(ch)) em += 0.68;
    else em += 0.56;
  }
  const bold = weight === '800' ? 1.06 : weight === '700' ? 1.03 : 1;
  return em * size * bold + spacing * Math.max(0, [...text].length - 1);
}

const ASCENT = 0.74;
const DESCENT = 0.24;
const LINE_GAP = 0.9;
const RULE_GAP = 1.5;
const MIN_HALF = 5;
const ELLIPSIS = '…';

/** The span free for a line whose baseline is y: the narrowest row it covers */
function spanAt(rows: BackRow[], y: number, size: number): BackRow {
  let best: BackRow = [32, Infinity];
  for (let r = Math.floor(y - size * ASCENT); r <= Math.ceil(y); r++) {
    const row = rows[r];
    if (!row || row[1] <= 0) return [32, 0];
    if (row[1] < best[1]) best = row;
  }
  return best;
}

function splitWords(text: string, parts: number): string[] {
  const words = text.split(' ');
  if (parts <= 1 || words.length < parts) return [text];
  // Every place to break, keeping the longest part as short as possible
  let best: string[] = [text];
  let bestLongest = Infinity;
  const tryBreaks = (from: number, left: number, acc: string[]) => {
    if (left === 1) {
      const all = [...acc, words.slice(from).join(' ')];
      const longest = Math.max(...all.map(p => p.length));
      if (longest < bestLongest) { bestLongest = longest; best = all; }
      return;
    }
    for (let cut = from + 1; cut <= words.length - left + 1; cut++) {
      tryBreaks(cut, left - 1, [...acc, words.slice(from, cut).join(' ')]);
    }
  };
  tryBreaks(0, parts, []);
  return best;
}

function ellipsizeTo(text: string, maxWidth: number, size: number, spec: BackLineSpec): string | null {
  for (let n = text.length - 1; n >= 4; n--) {
    const cut = text.slice(0, n).trimEnd() + ELLIPSIS;
    if (estimateWidth(cut, size, spec.weight, spec.spacing ?? 0) <= maxWidth) return cut;
  }
  return null;
}

/**
 * Fits the lines to the outline, or returns null if they can't fit even at
 * their floor sizes, wrapped and cut (the caller then uses a round back plate).
 * Tries a global scale from full size down, and for each the meaning on one to
 * three lines; the first arrangement where every line fits wins.
 */
export function layoutBack(rows: BackRow[], specs: BackLineSpec[]): BackLayout | null {
  const usable = rows.map((r, y) => (r[1] >= MIN_HALF ? y : -1)).filter(y => y >= 0);
  if (!usable.length) return null;
  const top = usable[0];
  const bottom = usable[usable.length - 1];

  // Every way to split the wrappable lines, fewest extra lines first
  const options = specs.map(sp => Array.from({ length: sp.maxLines ?? 1 }, (_, i) => i + 1));
  let combos: number[][] = [[]];
  for (const opt of options) combos = combos.flatMap(c => opt.map(n => [...c, n]));
  combos.sort((a, b) => a.reduce((x, y) => x + y, 0) - b.reduce((x, y) => x + y, 0));

  for (let scale = 1; scale >= 0.74; scale -= 0.04) {
    for (const combo of combos) {
      const expanded: { spec: BackLineSpec; text: string; ruleAfter: boolean }[] = [];
      let splittable = true;
      specs.forEach((spec, si) => {
        const parts = splitWords(spec.text, combo[si]);
        if (parts.length < combo[si]) splittable = false;
        parts.forEach((text, i) => expanded.push({ spec, text, ruleAfter: !!spec.ruleAfter && i === parts.length - 1 }));
      });
      if (!splittable) continue;
      const sizes = expanded.map(e => e.spec.size * Math.max(scale, e.spec.floor ?? 0.75));

      const lineGap = LINE_GAP * scale;
      const ruleGap = RULE_GAP * scale;
      let height = 0;
      expanded.forEach((e, i) => {
        height += sizes[i] * (ASCENT + DESCENT);
        if (i < expanded.length - 1) height += e.ruleAfter ? ruleGap * 2 : lineGap;
      });
      const room = bottom - top;
      if (height > room) continue;

      // Spread the spare room through the gaps, up to double each, then centre
      const gaps = expanded.length - 1;
      const extra = gaps > 0 ? Math.min((room - height) / gaps, lineGap) : 0;
      let y = top + (room - height - extra * gaps) / 2;

      const lines: PlacedLine[] = [];
      const rules: PlacedRule[] = [];
      let ok = true;
      for (let i = 0; i < expanded.length && ok; i++) {
        const { spec, ruleAfter } = expanded[i];
        let text = expanded[i].text;
        const size = sizes[i];
        const baseline = y + size * ASCENT;
        const [cx, half] = spanAt(rows, baseline, size);
        const spacing = (spec.spacing ?? 0) * (size / spec.size);
        if (estimateWidth(text, size, spec.weight, spacing) > half * 2) {
          const cut = spec.ellipsize ? ellipsizeTo(text, half * 2, size, { ...spec, spacing }) : null;
          if (!cut) { ok = false; break; }
          text = cut;
        }
        lines.push({ text, x: cx, y: baseline, size, weight: spec.weight, spacing, italic: !!spec.italic, tone: spec.tone, emboss: !!spec.emboss });
        y = baseline + size * DESCENT;
        if (i < expanded.length - 1) {
          if (ruleAfter) {
            const ruleY = y + ruleGap + extra / 2;
            const [rcx, rhalf] = spanAt(rows, ruleY, 1);
            const w = Math.min(rhalf, 8);
            rules.push({ x1: rcx - w, x2: rcx + w, y: ruleY });
            y += ruleGap * 2 + extra;
          } else {
            y += lineGap + extra;
          }
        }
      }
      if (ok) return { lines, rules };
    }
  }
  return null;
}
