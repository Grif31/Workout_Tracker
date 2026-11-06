// Writes layout.json's bands and icon/stamp positions back into the badge sheet.
const fs = require('fs');
const L = require('./layout.json');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');
const ict = {}, sty = {};
for (const k in L.layout) { const v = L.layout[k]; if (v.iconT !== undefined) ict[k] = v.iconT; if (v.stampY) sty[k] = v.stampY; }
ict.plate = ''; ict.hidden = ''; sty.plate = L.layout.plate.stampY;
const bands = Object.keys(L.bands).map((k) => '  ' + k + ": '" + L.bands[k] + "'").join(',\n');
const re = /const ICT = \{[^\n]*\};\nconst STY = \{[^\n]*\};\nconst BANDS = \{[\s\S]*?\n\};/;
if (!re.test(s)) throw new Error('generated block not found');
s = s.replace(re, 'const ICT = ' + JSON.stringify(ict).replace(/","/g, '", "') + ';\nconst STY = ' + JSON.stringify(sty) + ';\nconst BANDS = {\n' + bands + '\n};');
fs.writeFileSync(p, s);
console.log('spliced');
