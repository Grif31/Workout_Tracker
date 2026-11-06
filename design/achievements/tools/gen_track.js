// Builds the track ladder artboard (what a Milestones tile opens) from the badge sheet's own badge
// data, so every badge matches the sheet and the Trophy Hall.
const fs = require('fs');
const sheetPath = process.argv[2], outPath = process.argv[3];
const html = fs.readFileSync(sheetPath, 'utf8');
const js = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
const K = new Function('DCLogic', js + '\nreturn { look, metalFor, TRACKS, barbell };')(class {});
const defs = html.match(/<defs>[\s\S]*?<\/defs>/)[0];
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const tpl = html.match(/<svg viewBox="-8 -8 80 80" width="72" height="72" role="img" aria-label="\{\{b\.title\}\}">[\s\S]*?<\/svg>/)[0];
const svg = (size, v) => tpl.replace('width="72" height="72"', 'width="' + size + '" height="' + size + '"').split('{{b.').join('{{' + v + '.').replace(' role="img" aria-label="{{' + v + '.title}}"', ' aria-hidden="true"');
const FIELDS = ['shape', 'band', 'crown', 'fillUrl', 'rimUrl', 'inkUrl', 'iconUrl', 'veins', 'bandW', 'bandDash', 'extra', 'detail', 'iconT', 'icon', 'art', 'hid', 'lbl', 'glyph', 'stampY', 'short', 'title'];
const pickF = (b) => Object.fromEntries(FIELDS.map((f) => [f, b[f] == null ? '' : b[f]]));
const work = K.TRACKS.find((t) => t.key === 'work');
const workBadge = (i, metal) => pickF(Object.assign(K.look('work', metal || K.metalFor(i, 8)), { short: work.shorts[i], title: work.titles[i] }));

// Sample athlete: 137 workouts, so Hekaton (100) is the latest and Phalanx (250) is next
const COUNT = 137;
const thresholds = [1, 10, 25, 50, 100, 250, 500, 1000];
const dates = ['Feb 2, 2026', 'Feb 20, 2026', 'Mar 24, 2026', 'May 9, 2026', 'Sep 28, 2026'];
const rows = thresholds.map((n, i) => {
  const got = n <= COUNT;
  const what = n === 1 ? '1 workout' : n.toLocaleString('en-US') + ' workouts';
  return {
    b: workBadge(i, got ? null : 'locked'),
    what: what,
    right: got ? dates[i] : '',
    lineTop: i === 0 ? 'transparent' : (got ? '{{accent}}' : '#38383A'),
    lineBot: i === thresholds.length - 1 ? 'transparent' : (thresholds[i + 1] <= COUNT ? '{{accent}}' : '#38383A'),
    label: work.titles[i] + ', ' + what + (got ? ', earned ' + dates[i] : ', locked, ' + COUNT + ' so far')
  };
});
const CIRC = 2 * Math.PI * 39;
const next = { b: workBadge(5, 'locked'), dash: ((COUNT / 250) * CIRC).toFixed(1) + ' ' + CIRC.toFixed(1) };

// Plates: best completed set per lift; bench 2 plates, squat 3, deadlift 3 (8 of 12)
const plate = (lift, i, got) => pickF(Object.assign(K.look('plate', got ? K.metalFor(i, 4) : 'locked'), { short: ['135', '225', '315', '405'][i], art: K.barbell(i + 1), lbl: lift.toUpperCase(), title: (i + 1) + ' Plate ' + lift }));
const lift = (name, best, got, when) => [0, 1, 2, 3].map((i) => ({
  b: plate(name, i, i < got), name: (i + 1) + ' Plate', sub: i < got ? when[i] : 'Not yet',
  label: (i + 1) + ' Plate ' + name + ', ' + ['135', '225', '315', '405'][i] + ' lbs, ' + (i < got ? 'earned ' + when[i] : 'locked, best ' + best + ' lbs')
}));
const bench = lift('Bench', 245, 2, ['Feb 9', 'Jun 30']);
const squat = lift('Squat', 335, 3, ['Feb 4', 'Apr 21', 'Oct 13']);
const dead = lift('Deadlift', 385, 3, ['Feb 6', 'Mar 30', 'Aug 18']);

const data = { rows: rows, next: next, bench: bench, squat: squat, dead: dead, flip: workBadge(5, 'locked') };

const backArrow = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" style="stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;"></path></svg>';
const header = (title, right) => [
'    <div style="height: 54px; flex-shrink: 0;"></div>',
'    <div style="display: flex; align-items: center; gap: 12px; padding: 8px 16px 12px; flex-shrink: 0;">',
'      <button aria-label="Back to Trophy Hall" style="appearance: none; background: none; border: 0; padding: 10px; margin: -10px; color: #FFFFFF; display: flex;">' + backArrow + '</button>',
'      <h1 style="margin: 0; font-size: 20px; font-weight: 700; flex: 1;">' + title + '</h1>',
'      <span style="font-size: 14px; color: #8E8E93;">' + right + '</span>',
'    </div>'].join('\n');
const ladder = (v) => [
'    <div style="margin: 0 16px; display: flex; flex-direction: column;">',
'      <sc-for list="{{rows}}" as="' + v + '" hint-placeholder-count="8">',
'        <button class="plain" aria-label="{{' + v + '.label}}" style="display: flex; align-items: center; gap: 14px; height: 66px;">',
'          <div style="position: relative; width: 60px; height: 66px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">',
'            <div style="position: absolute; left: 29px; top: 0; width: 2px; height: 33px; background: {{' + v + '.lineTop}};"></div>',
'            <div style="position: absolute; left: 29px; top: 33px; width: 2px; height: 33px; background: {{' + v + '.lineBot}};"></div>',
'            <div style="position: relative; display: flex;">' + svg(60, v + '.b') + '</div>',
'          </div>',
'          <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">',
'            <span style="font-size: 16px; font-weight: 700;">{{' + v + '.b.title}}</span>',
'            <span style="font-size: 13px; color: #8E8E93;">{{' + v + '.what}}</span>',
'          </div>',
'          <span style="font-size: 12px; color: #8E8E93;">{{' + v + '.right}}</span>',
'        </button>',
'      </sc-for>',
'    </div>'].join('\n');
const liftRow = (title, best, list) => [
'    <div style="margin: 18px 16px 8px; display: flex; justify-content: space-between; align-items: baseline;">',
'      <h2 style="margin: 0; font-size: 17px; font-weight: 700;">' + title + '</h2>',
'      <span style="font-size: 13px; color: #8E8E93;">Best ' + best + ' lbs</span>',
'    </div>',
'    <div style="margin: 0 16px; background: #1C1C1E; border-radius: 16px; padding: 12px 4px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px;">',
'      <sc-for list="{{' + list + '}}" as="p" hint-placeholder-count="4">',
'        <button class="plain" aria-label="{{p.label}}" style="display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; min-height: 44px;">',
'          ' + svg(76, 'p.b'),
'          <span style="font-size: 13px; font-weight: 700;">{{p.name}}</span>',
'          <span style="font-size: 12px; color: #8E8E93;">{{p.sub}}</span>',
'        </button>',
'      </sc-for>',
'    </div>'].join('\n');
const caption = (n, t, d) => '    <div style="display: flex; flex-direction: column; gap: 4px; height: 112px; flex-shrink: 0;"><div style="font-size: 12px; font-weight: 700; letter-spacing: 1.5px; color: #8E8E93;">' + n + '</div><div style="font-size: 18px; font-weight: 800;">' + t + '</div><div style="font-size: 13px; color: #8E8E93; line-height: 1.45;">' + d + '</div></div>';
const PHONE = 'width: 390px; height: 844px; flex-shrink: 0; border-radius: 28px; overflow: hidden; background: #141416; position: relative; display: flex; flex-direction: column;';

const page = [
'<!doctype html>',
'<html lang="en">',
'<head>',
'<meta charset="utf-8">',
'<title>Milestone ladder</title>',
'<script src="./support.js"></script>',
'</head>',
'<body>',
'<x-dc>',
'<helmet>',
'<link rel="preconnect" href="https://fonts.googleapis.com">',
'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet">',
'<style>' + css + '.plain{appearance:none;background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;text-align:left}',
'.e1{font:800 4.6px Inter,sans-serif;text-anchor:middle;letter-spacing:.9px}',
'.e2{font:600 2.9px Inter,sans-serif;text-anchor:middle;letter-spacing:.5px}',
'.e3{font:800 4.4px Inter,sans-serif;text-anchor:middle}',
'.e4{font:500 3px Inter,sans-serif;text-anchor:middle}',
'.e5{font:italic 500 2.5px Inter,sans-serif;text-anchor:middle}',
'.e6{font:700 3.2px Inter,sans-serif;text-anchor:middle}',
'</style>',
'</helmet>',
'<div style="width: 1346px; height: 1060px; box-sizing: border-box; background: #0B0B0C; color: #FFFFFF; font-family: Inter, -apple-system, sans-serif; padding: 36px 40px; display: flex; gap: 48px;">',
'  <svg width="0" height="0" aria-hidden="true" style="position: absolute;">' + defs + '</svg>',
'',
'  <div style="display: flex; flex-direction: column; gap: 16px; width: 390px;">',
caption('1 · TAP A MILESTONE TILE', 'The track\'s full ladder', 'Next badge on top with its progress ring, then every badge in order on a line that fills as you climb. Earned rows carry the date.'),
'  <div style="' + PHONE + '">',
header('Workouts', '5 of 8'),
'    <div style="margin: 4px 16px 0; background: #1C1C1E; border-radius: 20px; padding: 14px 16px; display: flex; align-items: center; gap: 16px; flex-shrink: 0;">',
'      <div style="position: relative; width: 96px; height: 96px; flex-shrink: 0;">',
'        <svg viewBox="0 0 84 84" width="96" height="96" aria-hidden="true" style="position: absolute; left: 0; top: 0;">',
'          <circle cx="42" cy="42" r="39" fill="none" stroke="#38383A" style="stroke-width: 3.5;"></circle>',
'          <circle cx="42" cy="42" r="39" fill="none" stroke="{{accent}}" transform="rotate(-90 42 42)" style="stroke-width: 3.5; stroke-linecap: round; stroke-dasharray: {{next.dash}};"></circle>',
'        </svg>',
'        <div style="position: absolute; left: 13px; top: 13px;">' + svg(70, 'next.b') + '</div>',
'      </div>',
'      <div style="display: flex; flex-direction: column; gap: 3px;">',
'        <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.8px; color: #8E8E93;">NEXT</span>',
'        <span style="font-size: 20px; font-weight: 800;">Phalanx</span>',
'        <span style="font-size: 14px; color: #8E8E93;">250 workouts</span>',
'        <span style="font-size: 14px; font-weight: 600; color: {{accent}};">137 so far · 113 to go</span>',
'      </div>',
'    </div>',
'    <div style="height: 14px; flex-shrink: 0;"></div>',
ladder('r'),
'  </div>',
'  </div>',
'',
'  <div style="display: flex; flex-direction: column; gap: 16px; width: 390px;">',
caption('2 · PLATES', 'One tile, three lifts', 'Each lift is its own row of four, with its best set beside the name. Earned plates show the date, the rest say Not yet.'),
'  <div style="' + PHONE + '">',
header('Plates', '8 of 12'),
liftRow('Bench', 245, 'bench'),
liftRow('Squat', 335, 'squat'),
liftRow('Deadlift', 385, 'dead'),
'    <p style="margin: 18px 16px 0; font-size: 12px; color: #8E8E93; line-height: 1.45;">Your best completed set on a barbell bench press, squat and deadlift. Warm-ups don\'t count.</p>',
'  </div>',
'  </div>',
'',
'  <div style="display: flex; flex-direction: column; gap: 16px; width: 390px;">',
caption('3 · TAP A LOCKED BADGE', 'It opens and flips to what it takes', 'The badge lifts out over the ladder and turns over. A locked back shows the goal and how far along you are, with no buttons. An earned back shows the date, the workout, View Workout and Share.'),
'  <div style="' + PHONE + '">',
header('Workouts', '5 of 8'),
'    <div style="height: 158px; flex-shrink: 0;"></div>',
ladder('q'),
'    <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.6);"></div>',
'    <div role="dialog" aria-label="Phalanx, locked" style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center;">',
'      <div style="width: 340px; background: #1C1C1E; border-radius: 24px; padding: 8px 16px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px;">',
'      <svg viewBox="-8 -8 80 80" width="300" height="300" role="img" aria-label="Back of Phalanx: 250 workouts. 137 so far, 113 to go. The phalanx was the hoplite battle line.">',
'        <path d="M32 4 A28 28 0 1 1 31.99 4 Z" fill="rgba(0,0,0,0.45)" transform="translate(0.8 1.6)"></path>',
'        <path class="bs" d="M32 4 A28 28 0 1 1 31.99 4 Z" fill="#232325" stroke="#5A5A5E"></path>',
'        <path d="M32 4 A28 28 0 1 1 31.99 4 Z" fill="url(#gloss)"></path>',
'        <path d="M32 4 A28 28 0 1 1 31.99 4 Z" fill="none" stroke="#5A5A5E" transform="translate(5.12 5.12) scale(0.84)" style="stroke-width: 1.2; stroke-dasharray: 1.2 1;"></path>',
'        <text class="e1" x="32" y="21.3" fill="#E5E5EA">PHALANX</text>',
'        <path d="M24 24.1 H40" stroke="#5A5A5E" style="stroke-width: 0.4;"></path>',
'        <text class="e2" x="32" y="28" fill="#8E8E93">NOT YET</text>',
'        <text class="e3" x="32" y="32.6" fill="#E5E5EA">250 workouts</text>',
'        <text class="e6" x="32" y="37.3" fill="#C7C7CC">137 so far</text>',
'        <text class="e4" x="32" y="41" fill="#C7C7CC">113 to go</text>',
'        <path d="M26 44 H38" stroke="#5A5A5E" style="stroke-width: 0.4;"></path>',
'        <text class="e5" x="32" y="47.6" fill="#8E8E93">The phalanx was the</text>',
'        <text class="e5" x="32" y="51" fill="#8E8E93">hoplite battle line.</text>',
'      </svg>',
'      <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #C7C7CC;">',
'        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" fill="none" stroke="#C7C7CC" style="stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;"></path></svg>',
'        Tap to flip back',
'      </div>',
'      <button style="appearance: none; border: 1px solid #38383A; background: #2C2C2E; color: #FFFFFF; border-radius: 12px; align-self: stretch; padding: 13px; font: 600 15px Inter, sans-serif;">Close</button>',
'      </div>',
'    </div>',
'  </div>',
'  </div>',
'</div>',
'</x-dc>',
'<script type="text/x-dc" data-dc-script data-props=\'{"accent":{"editor":"color","default":"#30D158","options":["#30D158","#0A84FF","#BF5AF2","#FF9F0A"]},"$preview":{"width":1346,"height":1060}}\'>',
'// Badge drawing data exported from the badge sheet by tools/gen_track.js, so these screens match it exactly',
'const DATA = ' + JSON.stringify(data) + ';',
'class Component extends DCLogic {',
'  renderVals() {',
'    const accent = this.props.accent ?? \'#30D158\';',
'    const fill = (r) => Object.assign({}, r, { lineTop: r.lineTop.replace(\'{{accent}}\', accent), lineBot: r.lineBot.replace(\'{{accent}}\', accent) });',
'    return Object.assign({ accent: accent }, DATA, { rows: DATA.rows.map(fill) });',
'  }',
'}',
'</script>',
'</body>',
'</html>',
''].join('\n');
fs.writeFileSync(outPath, page);
console.log('track written', page.length, 'bytes');
