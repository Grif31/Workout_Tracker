// Builds an even key band for every badge shape and lays out each track's icon and stamp inside it.
// Band: the outline offset inward 4.5 units (rounded joins), the same inset the round badges had.
// Layout: the stamp sits as low as it fits, the icon is as large as fits above it (capped so a
// ladder's icons stay one size), and both keep a clear gap from the band's inner edge.
const fs = require('fs');
const ClipperLib = require('clipper-lib');
const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');
const js = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
const K = new Function('DCLogic', js + '\nreturn { SH, IC, TRACKS, HIDDEN, PLATES };')(class {});
const src = fs.readFileSync(__dirname + '/bbox.js', 'utf8');
const sample = eval('(' + src.match(/function bbox\(d\)\{[\s\S]*?\n\}/)[0].replace('const xs=pts.map', 'return pts;const xs=pts.map') + ')');
const bbox = require('./bbox.js');
const S = 1000;
function offset(pts, d) {
  const co = new ClipperLib.ClipperOffset(2, 0.05 * S);
  co.AddPath(pts.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) })), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const sol = new ClipperLib.Paths(); co.Execute(sol, -d * S);
  if (!sol.length) return [];
  sol.sort((a, b) => Math.abs(ClipperLib.Clipper.Area(b)) - Math.abs(ClipperLib.Clipper.Area(a)));
  return sol[0].map((p) => [p.X / S, p.Y / S]);
}
const f2 = (n) => n.toFixed(2);
function toPath(poly) { const step = Math.max(1, Math.floor(poly.length / 160)); const pts = poly.filter((_, i) => i % step === 0); return 'M' + pts.map(([x, y]) => f2(x) + ' ' + f2(y)).join(' L') + ' Z'; }
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = dx * dx + dy * dy; let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
function inside(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
function clear(p, poly, need) { if (!inside(p, poly)) return false; for (let i = 0; i < poly.length; i++) if (segDist(p, poly[i], poly[(i + 1) % poly.length]) < need) return false; return true; }
function boxPts(cx, base, size, text, wf) { const w = text.length * size * (wf || 0.64), h = size * 0.73, pts = []; for (let i = 0; i <= 6; i++) { const x = cx - w / 2 + w * i / 6; pts.push([x, base], [x, base - h]); } pts.push([cx - w / 2, base - h / 2], [cx + w / 2, base - h / 2]); return pts; }
const GAP = 1.4;              // clear space between any mark and the band's inner edge
const BAND_IN = 4.5 + 1.5;    // inner edge of a 3-wide band centred 4.5 in
const FLOOR = { f_5k: 40, h_300: 25 };
const FIXED = { h_emb: '' }; // marks drawn below this on purpose (the sill's grooves)
const out = { bands: {}, layout: {} };
const shapes = Object.keys(K.SH);
const inner = {};
for (const k of shapes) {
  const outline = sample(K.SH[k]);
  const band = offset(outline, 4.5);
  out.bands[k] = toPath(band);
  inner[k] = offset(outline, BAND_IN);
}
function solve(key, stamps, opts) {
  const poly = inner[key]; const floor = FLOOR[key] || 99;
  let stampY = null, size = 9, top = floor;
  if (stamps.length) {
    for (size = 9; size >= 6.5 && stampY === null; size -= 0.5) {
      for (let y = Math.min(floor, 62); y > 20; y -= 0.25) {
        if (stamps.every((s) => boxPts(32, y, size, s).every((p) => clear(p, poly, GAP)))) { stampY = y; break; }
      }
      if (stampY !== null) break;
    }
    top = stampY - size * 0.73 - 2.2;
  }
  if (key in FIXED) return { stampY, size, iconT: FIXED[key] };
  const icon = K.IC[key];
  if (!icon) return { stampY, size, iconT: '' };
  const ib = bbox(icon), ipts = sample(icon).filter((_, i) => i % 2 === 0);
  const cap = (opts && opts.cap) || 18;
  const xs = key === 'elev' ? [32, 33, 34, 35, 36, 37, 38] : key === 'h_neo' ? [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 24] : [32];
  for (let s = Math.min(1.05, cap / Math.max(ib.w, ib.h)); s > 0.3; s -= 0.01) {
    const r = (0.8 + 0.9) * s + GAP;
    const ok = [];
    for (const cx of xs) for (let cy = 6; cy < 60; cy += 0.25) {
      const tx = cx - s * ib.cx, ty = cy - s * ib.cy;
      if (ty + s * ib.y1 + r - GAP > top) continue;
      if (ipts.every(([x, y]) => clear([tx + s * x, ty + s * y], poly, r))) ok.push([cx, cy]);
    }
    if (ok.length) {
      const [cx, cy] = ok[Math.floor(ok.length / 2)];
      return { stampY, size, iconT: 'translate(' + f2(cx - s * ib.cx) + ' ' + f2(cy - s * ib.cy) + ') scale(' + s.toFixed(3) + ')', s };
    }
  }
  return { stampY, size, iconT: 'FAILED' };
}
for (const t of K.TRACKS) {
  if (t.keys) t.keys.forEach((k, i) => { out.layout[k] = solve(k, t.shorts[i] ? [t.shorts[i]] : []); });
  else out.layout[t.key] = solve(t.key, t.shorts.filter(Boolean));
}
for (const h of K.HIDDEN) out.layout[h[2]] = solve(h[2], h[1] ? [h[1]] : []);
// Hidden shards: the engraved sign, as large as fits (up to 10), centred
{
  const poly = inner.hidden; const lay = {};
  for (const [title, g] of [['?', '?']]) {
    let done = null;
    for (let size = 10; size >= 6 && !done; size -= 0.5) for (let dy = 0; dy < 8 && !done; dy += 0.5) for (const y of [36 + dy, 36 - dy]) { if (boxPts(32, y, size, g).every((p) => clear(p, poly, GAP))) { done = { size, y }; break; } }
    lay[g] = done;
  }
  out.layout.hidden = { glyphs: lay };
}
// Plates: label as high as it fits, weight as low as it fits, bar between
{
  const poly = inner.plate; let lblY = null, stampY = null;
  for (let y = 14; y < 40 && lblY === null; y += 0.25) if (['DEADLIFT'].every((s) => boxPts(32, y, 5.4, s, 0.78).every((p) => clear(p, poly, GAP)))) lblY = y;
  for (let y = 56; y > 30 && stampY === null; y -= 0.25) if (['405'].every((s) => boxPts(32, y, 9, s).every((p) => clear(p, poly, GAP)))) stampY = y;
  out.layout.plate = { lblY, stampY, barY: (lblY + stampY - 6.6) / 2 };
}
fs.writeFileSync(__dirname + '/layout.json', JSON.stringify(out, null, 1));
for (const k in out.layout) console.log(k.padEnd(10), JSON.stringify(out.layout[k]));
