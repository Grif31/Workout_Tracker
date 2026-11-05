// Renders every badge with the sheet's own badge markup, so the preview matches the canvas exactly.
const fs = require('fs');
const load = require('./load.js');
const { badges: all, html } = load(process.argv[2]);
const only = process.env.ONLY ? new Set(process.env.ONLY.split('|')) : null;
const badges = only ? all.filter((b) => only.has(b.track) || only.has(b.title)) : all;
const defs = html.match(/<defs>[\s\S]*?<\/defs>/)[0];
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const tpl = html.match(/<svg viewBox="-8 -8 80 80" width="72" height="72" role="img" aria-label="\{\{b\.title\}\}">[\s\S]*?<\/svg>/)[0];
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const size = +(process.env.SIZE || 150);
const one = (b) => tpl.replace('width="72" height="72"', `width="${size}" height="${size}"`).replace(/\{\{b\.(\w+)\}\}/g, (m, k) => esc(b[k]));
const cols = +(process.env.COLS || 10);
const cells = badges.map((b) => `<div class="c">${one(b)}<div>${esc(b.title)}</div></div>`).join('');
fs.writeFileSync(process.argv[3], `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet"><style>${css} body{margin:0;background:#1C1C1E;color:#fff;font:12px Inter,sans-serif} .g{display:flex;flex-wrap:wrap;gap:6px;padding:10px;width:${(size + 6) * cols + 20}px} .c{width:${size}px;text-align:center}</style></head><body><svg width="0" height="0" style="position:absolute">${defs}</svg><div class="g">${cells}</div></body></html>`);
console.log('badges', badges.length);
