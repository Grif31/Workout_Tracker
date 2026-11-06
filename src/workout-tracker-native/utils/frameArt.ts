// Profile frame geometry (TODO §27, "Profile frames redesign"), ported from
// design/achievements/tools/gen_frames.js. Units: a photo of radius 36 at the
// centre (50, 50) of a 120-unit box (-10..110). Each rank keeps everything
// below it and adds one Greek ornament: Athlete a fine outer line, Hero the key
// band, Demigod the egg-and-dart, Olympian twelve studs, Titan carved stone
// blocks, Aretē gold with the olive crown in place of the egg-and-dart.

export const FRAME_RANKS = ['Neophyte', 'Athlete', 'Hero', 'Demigod', 'Olympian', 'Titan', 'Aretē'] as const;

// Frame paints that aren't the rank colour: the olive crown's sage (never the
// PR laurel's gold), the dark panel the ground band is mixed toward, and the
// glint's white sweep as [offset, opacity]
export const FRAME_OLIVE = { light: '#C9D6A8', stem: '#7E9466' };
export const FRAME_PANEL = '#141416';
export const FRAME_GLINT_STOPS: [number, number][] = [[0.25, 0], [0.36, 0.55], [0.47, 0]];

const C = 50;
export const PHOTO_R = 36;
const RAIL_IN = 38.6, KEY_IN = 40, KEY_OUT = 45.4, RAIL_OUT = 47;

/** Under this frame size the key band and Titan's egg-and-dart drop out: noise at 44 px */
export const SMALL_FRAME_PX = 64;

const f = (n: number) => n.toFixed(2);
const pol = (r: number, a: number): [number, number] => [C + r * Math.sin(a), C - r * Math.cos(a)];
const circle = (r: number) => `M${f(C)} ${f(C - r)} A${r} ${r} 0 1 1 ${f(C - 0.01)} ${f(C - r)} Z`;

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number): string {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// Running Greek key between two radii: one hooked spiral per cell
function meander(n: number, rIn: number, rOut: number): string {
  const cell = [[0.1, 1], [0.1, 0.12], [0.86, 0.12], [0.86, 0.74], [0.4, 0.74], [0.4, 0.44], [0.62, 0.44]];
  let d = '';
  for (let i = 0; i < n; i++) {
    d += cell.map(([u, v], k) => {
      const [x, y] = pol(rOut - v * (rOut - rIn), ((i + u) / n) * 2 * Math.PI);
      return `${k ? 'L' : 'M'}${f(x)} ${f(y)}`;
    }).join(' ') + ' ';
  }
  return d;
}

const dot = (r: number, a: number, s: number) => {
  const [x, y] = pol(r, a);
  return `M${f(x)} ${f(y - s)} A${s} ${s} 0 1 1 ${f(x - 0.01)} ${f(y - s)} Z `;
};

function blocks(rIn: number, rOut: number, n: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = ((i + 0.06) / n) * 2 * Math.PI, a1 = ((i + 0.94) / n) * 2 * Math.PI;
    const p = [pol(rOut, a0), pol(rOut, a1), pol(rIn, a1), pol(rIn, a0)];
    d += `M${f(p[0][0])} ${f(p[0][1])} A${rOut} ${rOut} 0 0 1 ${f(p[1][0])} ${f(p[1][1])} L${f(p[2][0])} ${f(p[2][1])} A${rIn} ${rIn} 0 0 0 ${f(p[3][0])} ${f(p[3][1])} Z `;
  }
  return d;
}

// The olive crown (kotinos) the top badges wear: broad leaves in pairs up both sides, open at the top
function olive(r: number): string {
  let d = '';
  [1, -1].forEach(side => {
    for (let t = 0; t < 12; t++) {
      const a = Math.PI + side * (0.16 + t * 0.215);
      const [px, py] = pol(r, a);
      const tx = -side * Math.cos(a), ty = -side * Math.sin(a), nx = Math.sin(a), ny = -Math.cos(a);
      [0.55, -0.55].forEach(k => {
        let dx = tx + nx * k, dy = ty + ny * k;
        const l = Math.hypot(dx, dy); dx /= l; dy /= l;
        const L = t > 9 ? 7 : 9;
        const qx = px + dx * L, qy = py + dy * L, mx = (px + qx) / 2, my = (py + qy) / 2, ox = -dy * 2.4, oy = dx * 2.4;
        d += `M${f(px)} ${f(py)} Q${f(mx + ox)} ${f(my + oy)} ${f(qx)} ${f(qy)} Q${f(mx - ox)} ${f(my - oy)} ${f(px)} ${f(py)} Z `;
      });
    }
  });
  return d;
}

function oliveStem(r: number): string {
  return [1, -1].map(side => {
    const [x0, y0] = pol(r, Math.PI + side * 0.1), [x1, y1] = pol(r, Math.PI + side * (0.16 + 11 * 0.215));
    return `M${f(x0)} ${f(y0)} A${r} ${r} 0 0 ${side > 0 ? 1 : 0} ${f(x1)} ${f(y1)}`;
  }).join(' ');
}

function ellipse(cx: number, cy: number, rr: number, rt: number, a: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 14; k++) {
    const t = (k / 14) * 2 * Math.PI, u = rr * Math.cos(t), v = rt * Math.sin(t);
    pts.push(`${f(cx + u * Math.sin(a) + v * Math.cos(a))} ${f(cy - u * Math.cos(a) + v * Math.sin(a))}`);
  }
  return `M${pts.join(' L')} Z `;
}

/** One layer of a frame, drawn in order. `fill`/`stroke` name a paint: a gradient id or 'ink' */
export type FrameLayer =
  | { kind: 'ring'; d: string; width: number }                    // stroked in the rim gradient, with a dark offset copy
  | { kind: 'ground'; d: string; width: number }                  // stroked in the rank's dark tint, under an ornament
  | { kind: 'solid'; d: string; paint: 'rim' | 'ink' | 'olive' }  // filled, with a dark offset copy
  | { kind: 'line'; d: string; width: number; paint: 'rim' | 'stem' }
  | { kind: 'key'; d: string };                                   // the meander, in the light ink with a dark offset

export interface FrameArt {
  layers: FrameLayer[];
  /** The light-mode edge, a ring just outside everything */
  edge: string;
  /** Where the glint sweeps (Olympian and up), and how wide */
  glint: { d: string; width: number } | null;
}

function eggAndDart(i: number, small: boolean): FrameLayer[] {
  const r0 = i === 5 ? 52.9 : 50.4;
  const n = small ? 26 : 40, rt = small ? 3.3 : 2.6, rr = small ? 2.6 : 2.1;
  let d = '';
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * Math.PI, b = ((k + 0.5) / n) * 2 * Math.PI;
    const [x, y] = pol(r0, a);
    d += ellipse(x, y, rr, rt, a);
    const [p0x, p0y] = pol(r0 - rr, b), [p1x, p1y] = pol(r0 + rr * 0.7, b - 0.008), [p2x, p2y] = pol(r0 + rr * 0.7, b + 0.008);
    d += `M${f(p0x)} ${f(p0y)} L${f(p1x)} ${f(p1y)} L${f(p2x)} ${f(p2y)} Z `;
  }
  return [
    // The ground keeps the page from showing through as white ticks between eggs
    { kind: 'ground', d: circle(r0 + 0.45), width: 2 * rr + 1.6 },
    { kind: 'solid', d, paint: 'rim' },
    { kind: 'line', d: circle(r0 + rr + 0.9), width: small ? 1.6 : 1.1, paint: 'rim' },
  ];
}

const ring = (r: number, width: number): FrameLayer => ({ kind: 'ring', d: circle(r), width });

function build(i: number, small: boolean): FrameArt {
  const layers: FrameLayer[] = [];
  if (i === 6) {
    layers.push({ kind: 'line', d: oliveStem(51.4), width: 1.2, paint: 'stem' });
    layers.push({ kind: 'solid', d: olive(51.4), paint: 'olive' });
  }
  if (i >= 2 && !small) layers.push({ kind: 'ground', d: circle((RAIL_IN + RAIL_OUT) / 2), width: RAIL_OUT - RAIL_IN });
  if (i === 5) {
    layers.push({ kind: 'ground', d: circle((RAIL_OUT - 0.6 + 50.6) / 2), width: 50.6 - RAIL_OUT + 0.6 });
    layers.push({ kind: 'solid', d: blocks(RAIL_OUT - 0.6, 50.6, 24), paint: 'rim' });
  }
  if (i === 0) layers.push(ring(39.5, 3));
  else if (i === 1) layers.push(ring(40.4, 4), ring(44, 0.9));
  else if (small) layers.push(ring(RAIL_OUT - 2.4, 6.4));
  else {
    layers.push(ring(RAIL_IN, 1.3));
    if (i !== 5) layers.push(ring(RAIL_OUT, 2.2));
    layers.push({ kind: 'key', d: meander(36, KEY_IN, KEY_OUT) });
  }
  if (i >= 3 && i !== 6 && !(i === 5 && small)) layers.push(...eggAndDart(i, small));
  if (i >= 4) {
    let d = '';
    for (let k = 0; k < 12; k++) d += dot(i === 5 ? 48.6 : RAIL_OUT, ((k + 0.5) / 12) * 2 * Math.PI, small ? 1.9 : 1.75);
    layers.push({ kind: 'solid', d, paint: 'ink' });
  }
  const outer = i === 0 ? 41 : i === 1 ? 44.45 : i === 2 || i === 6 ? (small ? 47.4 : 48.1)
    : i === 5 ? (small ? 50.6 : 56.45) : (small ? 54.4 : 53.95);
  return {
    layers,
    edge: circle(outer + 0.3),
    glint: i >= 4 ? { d: circle(i === 5 ? 48.6 : RAIL_OUT - 2), width: i === 5 ? 4.5 : 5 } : null,
  };
}

const cache = new Map<string, FrameArt>();

export function rankIndex(rankName: string): number {
  const i = (FRAME_RANKS as readonly string[]).indexOf(rankName);
  return i < 0 ? 0 : i;
}

export function frameArt(rankName: string, small: boolean): FrameArt {
  const i = rankIndex(rankName);
  const key = `${i}${small ? 's' : ''}`;
  let art = cache.get(key);
  if (!art) { art = build(i, small); cache.set(key, art); }
  return art;
}

// How far each rank reaches past the photo, as a multiple of the photo radius
// (from the review harness's measured extents, offset shadows included)
const REACH = [1.14, 1.24, 1.34, 1.5, 1.5, 1.57, 1.58];
// Small frames lose the key band, and Titan its egg-and-dart
const REACH_SMALL = [1.14, 1.24, 1.33, 1.52, 1.52, 1.42, 1.58];

export function frameReach(rankName: string, small: boolean): number {
  return (small ? REACH_SMALL : REACH)[rankIndex(rankName)];
}
