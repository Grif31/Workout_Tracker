// Renders a one-level .dc.html artboard as plain HTML: expands each <sc-for> and fills {{a.b.c}} holes.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const js = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
const Comp = new Function('DCLogic', js + '\nreturn Component;')(class { constructor() { this.props = {}; } });
const v = new Comp().renderVals();
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
let h = src.replace(/<script[\s\S]*?<\/script>/g, '');
h = h.replace(/<sc-for list="\{\{(\w+)\}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/sc-for>/g, (m, list, as, inner) =>
  (v[list] || []).map((item) => inner.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (mm, p) => (p === as || p.startsWith(as + '.') ? esc(get({ [as]: item }, p)) : mm))).join(''));
h = h.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, p) => esc(get(v, p)));
fs.writeFileSync(process.argv[3], h);
