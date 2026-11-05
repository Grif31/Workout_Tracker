// Measures each badge: how evenly the key band sits inside the outline, and how much room
// the icon, stamp and labels leave before the band or the outline.
const load = require('./load.js');
const src = require('fs').readFileSync(__dirname + '/bbox.js', 'utf8');
const sample = eval('(' + src.match(/function bbox\(d\)\{[\s\S]*?\n\}/)[0].replace('const xs=pts.map', 'return pts;const xs=pts.map') + ')');
const file = process.argv[2];
const { badges } = load(file);
function parseT(t) {
  if (!t) return { tx: 0, ty: 0, s: 1 };
  const m = t.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)(?:\s*scale\(([-\d.]+)\))?/);
  return { tx: +m[1], ty: +m[2], s: m[3] ? +m[3] : 1 };
}
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = dx * dx + dy * dy; let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
function polyDist(p, poly) { let m = 1e9; for (let i = 0; i < poly.length; i++) m = Math.min(m, segDist(p, poly[i], poly[(i + 1) % poly.length])); return m; }
function inside(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
function textBox(cx, base, size, text, weight) { const w = text.length * size * (weight || 0.66), h = size * 0.73; const pts = []; for (let i = 0; i <= 8; i++) { const x = cx - w / 2 + w * i / 8; pts.push([x, base], [x, base - h]); } for (let i = 0; i <= 4; i++) { pts.push([cx - w / 2, base - h * i / 4], [cx + w / 2, base - h * i / 4]); } return pts; }
module.exports = function audit(bandOf) {
  const rows = [];
  for (const b of badges) {
    const outline = sample(b.shape);
    const band = sample(b.band);
    // inset evenness: distance from the outline to the band, all round
    let iMin = 1e9, iMax = 0; for (let i = 0; i < outline.length; i += 3) { const d = polyDist(outline[i], band); iMin = Math.min(iMin, d); iMax = Math.max(iMax, d); }
    const els = [];
    if (b.icon) { const T = parseT(b.iconT); const r = 0.8 * T.s + 0.9 * T.s; sample(b.icon).forEach(([x, y]) => els.push({ p: [T.tx + T.s * x, T.ty + T.s * y], r, what: 'icon' })); }
    if (b.art) sample(b.art).forEach((p) => els.push({ p: [p[0] + 0.25, p[1] + 0.3], r: 0.35, what: 'art' }));
    if (b.short) textBox(32, b.stampY, 9, b.short).forEach((p) => els.push({ p, r: 0, what: 'stamp' }));
    if (b.lbl) textBox(32, 23.5, 5.4, b.lbl, 0.78).forEach((p) => els.push({ p, r: 0, what: 'label' }));
    if (b.hid) textBox(32, 36, 9, b.hid).forEach((p) => els.push({ p, r: 0, what: 'glyph' }));
    let worst = { c: 1e9 };
    for (const e of els) {
      const inBand = inside(e.p, band), inOut = inside(e.p, outline);
      const cBand = b.bandW > 0 ? (inBand ? 1 : -1) * polyDist(e.p, band) - b.bandW / 2 - e.r : 1e9;
      const cOut = (inOut ? 1 : -1) * polyDist(e.p, outline) - 1.5 - e.r;
      const c = Math.min(cBand, cOut);
      if (c < worst.c) worst = { c, what: e.what, p: e.p };
    }
    rows.push({ track: b.track, title: b.title, inset: [iMin, iMax], gap: worst.c, what: worst.what, at: worst.p });
  }
  return rows;
};
if (require.main === module) {
  const rows = module.exports();
  const seen = new Set();
  for (const r of rows) {
    const key = r.track + '|' + r.title;
    if (seen.has(key)) continue; seen.add(key);
    const flag = r.gap < 1.5 ? 'TIGHT' : '';
    console.log(r.track.padEnd(17), r.title.padEnd(18), 'inset', r.inset[0].toFixed(1) + '-' + r.inset[1].toFixed(1), 'gap', r.gap.toFixed(2).padStart(6), (r.what || '').padEnd(6), r.at ? r.at.map((v) => v.toFixed(1)).join(',') : '', flag);
  }
}
