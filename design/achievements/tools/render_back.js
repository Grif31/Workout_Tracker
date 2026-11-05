// Renders Back.dc.html as plain HTML by filling its holes with the values its script returns.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const js = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
const C = new Function('DCLogic', js + '\nreturn Component;')(class { constructor() { this.props = {}; } });
const v = new C().renderVals();
let html = src.replace(/<script[\s\S]*?<\/script>/g, '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in v ? v[k] : m));
fs.writeFileSync(process.argv[3], html);
