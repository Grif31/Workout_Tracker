// Builds the Trophy Hall artboard (layout C) from the badge sheet's own badge data, so every badge
// on the screen is drawn exactly as on the sheet.
const fs = require('fs');
const sheetPath = process.argv[2], outPath = process.argv[3];
const html = fs.readFileSync(sheetPath, 'utf8');
const js = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
const K = new Function('DCLogic', js + '\nreturn { look, metalFor, TRACKS, barbell };')(class {});
const defs = html.match(/<defs>[\s\S]*?<\/defs>/)[0];
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const tpl = html.match(/<svg viewBox="-8 -8 80 80" width="72" height="72" role="img" aria-label="\{\{b\.title\}\}">[\s\S]*?<\/svg>/)[0];
const svg = (size, v) => tpl.replace('width="72" height="72"', 'width="' + size + '" height="' + size + '"').split('{{b.').join('{{' + v + '.');
const FIELDS = ['shape', 'band', 'crown', 'fillUrl', 'rimUrl', 'inkUrl', 'iconUrl', 'veins', 'bandW', 'bandDash', 'extra', 'detail', 'iconT', 'icon', 'art', 'hid', 'lbl', 'glyph', 'stampY', 'short', 'title'];
const pickF = (b) => Object.fromEntries(FIELDS.map((f) => [f, b[f] == null ? '' : b[f]]));
function badge(trackKey, i, metalOverride) {
  const t = K.TRACKS.find((x) => x.key === trackKey);
  const key = t.keys ? t.keys[i] : t.key, n = t.shorts.length;
  const metal = metalOverride || (t.key === 'feat' ? 'gold' : K.metalFor(i, n));
  return pickF(Object.assign(K.look(key, metal), { short: t.shorts[i], title: t.titles[i] }));
}
function plate(lift, i) {
  return pickF(Object.assign(K.look('plate', K.metalFor(i, 4)), { short: ['135', '225', '315', '405'][i], art: K.barbell(i + 1), lbl: lift.toUpperCase(), title: (i + 1) + ' Plate ' + lift }));
}
const hiddenB = (key, stamp, title, metal) => pickF(Object.assign(K.look(key, metal), { short: stamp, title: title }));

// Sample athlete: lifts and runs, has never logged a ride
const L = [
  ['Workouts', 'work', 5, 8], ['Hours trained', 'hours', 3, 7], ['Volume lifted', 'vol', 5, 8], ['Weekly streak', 'streak', 4, 7], ['PRs', 'pr', 4, 8],
  ['Running distance', 'dist', 4, 7], ['Elevation', 'elev', 4, 6], ['Exercises tried', 'explore', 2, 4]
];
const tiles = L.map(([name, track, got, n]) => {
  const b = badge(track, got - 1);
  return { track: name, earned: got + ' of ' + n + ' earned', label: name + ': ' + b.title + ', ' + got + ' of ' + n + ' earned', b: b };
});
tiles.push({ track: 'Plates', earned: '8 of 12 earned', label: 'Plates: 3 Plate Deadlift, 8 of 12 earned', b: plate('Deadlift', 2) });
const showcase = [Object.assign(badge('work', 4), { size: 92 }), Object.assign(badge('vol', 4), { size: 116 }), Object.assign(badge('feat', 0), { size: 92 })];
const CIRC = 2 * Math.PI * 39;
const close = [
  [badge('pr', 4, 'locked'), '500 PRs', '61 PRs to go', 0.76],
  [badge('dist', 4, 'locked'), '250 Miles', '68 mi to go', 0.73],
  [badge('vol', 5, 'locked'), 'Atlas', '387,600 lbs to go', 0.61]
].map(([b, name, toGo, pct]) => ({ b: b, name: name, toGo: toGo, dash: (pct * CIRC).toFixed(1) + ' ' + CIRC.toFixed(1), label: name + ', ' + Math.round(pct * 100) + ' percent, ' + toGo }));
const featT = K.TRACKS.find((t) => t.keys);
const earnedFeats = new Set([0, 3]);
const feats = featT.keys.map((k, i) => { const b = badge('feat', i, earnedFeats.has(i) ? 'gold' : 'locked'); return { b: b, label: b.title + (earnedFeats.has(i) ? ', earned' : ', locked') }; });
const hid = [{ b: hiddenB('h_neo', '', 'Neomenia', 'gold'), label: 'Neomenia, earned' }];
for (let i = 0; i < 3; i++) { const b = hiddenB('hidden', '', 'Hidden', 'locked'); b.hid = '?'; hid.push({ b: b, label: 'Hidden badge, not found yet' }); }
const recent = [
  { b: badge('vol', 4), title: 'Half Million', how: '500,000 lbs lifted, all time', date: 'Oct 6' },
  { b: badge('work', 4), title: 'Hekaton', how: 'Your 100th workout', date: 'Sep 28' },
  { b: badge('dist', 3), title: '100 Miles', how: 'On a 6.2 mi run', date: 'Sep 2' }
];
const data = { showcase: showcase, close: close, tiles: tiles, feats: feats, hid: hid, recent: recent };
const noRole = (s, v) => s.replace(' role="img" aria-label="{{' + v + '.title}}"', ' aria-hidden="true"');

const page = [
'<!doctype html>',
'<html lang="en">',
'<head>',
'<meta charset="utf-8">',
'<title>Trophy Hall</title>',
'<script src="./support.js"></script>',
'</head>',
'<body>',
'<x-dc>',
'<helmet>',
'<link rel="preconnect" href="https://fonts.googleapis.com">',
'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet">',
'<style>' + css + '.plain{appearance:none;background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;text-align:left}',
'</style>',
'</helmet>',
'<div style="width: 390px; height: 1830px; box-sizing: border-box; background: #141416; color: #FFFFFF; font-family: Inter, -apple-system, sans-serif; display: flex; flex-direction: column;">',
'  <svg width="0" height="0" aria-hidden="true" style="position: absolute;">' + defs + '</svg>',
'  <div style="height: 54px;"></div>',
'  <div style="display: flex; align-items: center; gap: 12px; padding: 8px 16px 12px;">',
'    <button aria-label="Go back" style="appearance: none; background: none; border: 0; padding: 10px; margin: -10px; color: #FFFFFF; display: flex;">',
'      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" style="stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;"></path></svg>',
'    </button>',
'    <h1 style="margin: 0; font-size: 20px; font-weight: 700; flex: 1;">Trophy Hall</h1>',
'    <span style="font-size: 14px; color: #8E8E93;">30 of 70 earned</span>',
'  </div>',
'',
'  <section style="margin: 4px 16px 0; border-radius: 20px; background: #1C1C1E; padding: 20px 12px 16px; display: flex; flex-direction: column; align-items: center; gap: 12px;">',
'    <div style="display: flex; align-items: flex-end; justify-content: center; gap: 10px;">',
'      <sc-for list="{{showcase}}" as="b" hint-placeholder-count="3">',
'        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; width: 112px;">',
'          ' + svg('{{b.size}}', 'b'),
'          <div style="font-size: 13px; font-weight: 700; text-align: center;">{{b.title}}</div>',
'        </div>',
'      </sc-for>',
'    </div>',
'    <div style="display: flex; align-items: center; justify-content: space-between; align-self: stretch; border-top: 1px solid #38383A; padding: 10px 4px 0;">',
'      <span style="font-size: 13px; color: #8E8E93;">Pinned to your profile</span>',
'      <button style="appearance: none; background: none; border: 0; padding: 10px 0; font: 600 14px Inter, sans-serif; color: {{accent}};">Change</button>',
'    </div>',
'  </section>',
'',
'  <h2 style="margin: 24px 16px 10px; font-size: 17px; font-weight: 700;">Almost there</h2>',
'  <div style="display: flex; flex-shrink: 0; gap: 12px; padding: 0 16px; overflow: hidden;">',
'    <sc-for list="{{close}}" as="c" hint-placeholder-count="3">',
'      <button class="plain" aria-label="{{c.label}}" style="flex: 0 0 148px; background: #1C1C1E; border-radius: 16px; padding: 14px 12px; display: flex; flex-direction: column; align-items: center; gap: 8px;">',
'        <div style="position: relative; width: 96px; height: 96px;">',
'          <svg viewBox="0 0 84 84" width="96" height="96" aria-hidden="true" style="position: absolute; left: 0; top: 0;">',
'            <circle cx="42" cy="42" r="39" fill="none" stroke="#38383A" style="stroke-width: 3.5;"></circle>',
'            <circle cx="42" cy="42" r="39" fill="none" stroke="{{accent}}" transform="rotate(-90 42 42)" style="stroke-width: 3.5; stroke-linecap: round; stroke-dasharray: {{c.dash}};"></circle>',
'          </svg>',
'          <div style="position: absolute; left: 13px; top: 13px;">' + noRole(svg(70, 'c.b'), 'c.b') + '</div>',
'        </div>',
'        <div style="font-size: 14px; font-weight: 700; text-align: center;">{{c.name}}</div>',
'        <div style="font-size: 12px; color: #8E8E93; text-align: center;">{{c.toGo}}</div>',
'      </button>',
'    </sc-for>',
'  </div>',
'',
'  <h2 style="margin: 26px 16px 12px; font-size: 17px; font-weight: 700;">Milestones</h2>',
'  <div style="margin: 0 16px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 6px;">',
'    <sc-for list="{{tiles}}" as="t" hint-placeholder-count="8">',
'      <button class="plain" aria-label="{{t.label}}" style="display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; min-height: 44px;">',
'        ' + noRole(svg(100, 't.b'), 't.b'),
'        <div style="margin-top: 2px; font-size: 10px; font-weight: 700; letter-spacing: 0.8px; color: #8E8E93; text-transform: uppercase; line-height: 1.3;">{{t.track}}</div>',
'        <div style="font-size: 15px; font-weight: 800; line-height: 1.2;">{{t.b.title}}</div>',
'        <div style="font-size: 12px; color: #8E8E93;">{{t.earned}}</div>',
'      </button>',
'    </sc-for>',
'  </div>',
'  <div style="margin: 18px 16px 0; font-size: 12px; color: #8E8E93; line-height: 1.4;">Ride distance appears after your first ride.</div>',
'',
'  <div style="margin: 26px 16px 10px; display: flex; justify-content: space-between; align-items: baseline;">',
'    <h2 style="margin: 0; font-size: 17px; font-weight: 700;">Feats</h2>',
'    <span style="font-size: 13px; color: #8E8E93;">2 of 8</span>',
'  </div>',
'  <div style="margin: 0 16px; background: #1C1C1E; border-radius: 16px; padding: 12px 6px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px 4px;">',
'    <sc-for list="{{feats}}" as="f" hint-placeholder-count="8">',
'      <button class="plain" aria-label="{{f.label}}" style="display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 44px; text-align: center;">',
'        ' + noRole(svg(72, 'f.b'), 'f.b'),
'        <div style="font-size: 11px; font-weight: 600; color: #8E8E93; line-height: 1.2;">{{f.b.title}}</div>',
'      </button>',
'    </sc-for>',
'  </div>',
'',
'  <div style="margin: 26px 16px 10px; display: flex; justify-content: space-between; align-items: baseline;">',
'    <h2 style="margin: 0; font-size: 17px; font-weight: 700;">Hidden</h2>',
'    <span style="font-size: 13px; color: #8E8E93;">1 found · 7 to find</span>',
'  </div>',
'  <div style="margin: 0 16px; background: #1C1C1E; border-radius: 16px; padding: 12px 6px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px;">',
'    <sc-for list="{{hid}}" as="h" hint-placeholder-count="4">',
'      <div role="img" aria-label="{{h.label}}" style="display: flex; justify-content: center;">' + noRole(svg(72, 'h.b'), 'h.b') + '</div>',
'    </sc-for>',
'  </div>',
'',
'  <h2 style="margin: 26px 16px 10px; font-size: 17px; font-weight: 700;">Recently earned</h2>',
'  <div style="margin: 0 16px; display: flex; flex-direction: column; gap: 10px;">',
'    <sc-for list="{{recent}}" as="e" hint-placeholder-count="3">',
'      <div style="display: flex; align-items: center; gap: 12px;">',
'        ' + noRole(svg(52, 'e.b'), 'e.b'),
'        <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">',
'          <span style="font-size: 15px; font-weight: 700;">{{e.title}}</span>',
'          <span style="font-size: 12px; color: #8E8E93;">{{e.how}}</span>',
'        </div>',
'        <span style="font-size: 12px; color: #8E8E93;">{{e.date}}</span>',
'      </div>',
'    </sc-for>',
'  </div>',
'</div>',
'</x-dc>',
'<script type="text/x-dc" data-dc-script data-props=\'{"accent":{"editor":"color","default":"#30D158","options":["#30D158","#0A84FF","#BF5AF2","#FF9F0A"]},"$preview":{"width":390,"height":1830}}\'>',
'// Badge drawing data exported from the badge sheet by tools/gen_hall.js, so this screen matches it exactly',
'const DATA = ' + JSON.stringify(data) + ';',
'class Component extends DCLogic {',
'  renderVals() {',
'    return Object.assign({ accent: this.props.accent ?? \'#30D158\' }, DATA);',
'  }',
'}',
'</script>',
'</body>',
'</html>',
''].join('\n');
fs.writeFileSync(outPath, page);
console.log('hall written', page.length, 'bytes');
