// Builds the redesigned Your Journey artboard (owner's picks 1, 2 and 5) from the badge sheet's own
// badge data. Rank names, colours and bands are the app's (constants/greekRanks.ts).
const fs = require('fs');
const sheetPath = process.argv[2], outPath = process.argv[3];
const html = fs.readFileSync(sheetPath, 'utf8');
const js = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
const K = new Function('DCLogic', js + '\nreturn { look, metalFor, TRACKS };')(class {});
const defs = html.match(/<defs>[\s\S]*?<\/defs>/)[0];
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const tpl = html.match(/<svg viewBox="-8 -8 80 80" width="72" height="72" role="img" aria-label="\{\{b\.title\}\}">[\s\S]*?<\/svg>/)[0];
const svg = (size, v) => tpl.replace('width="72" height="72"', 'width="' + size + '" height="' + size + '"').split('{{b.').join('{{' + v + '.').replace(' role="img" aria-label="{{' + v + '.title}}"', ' aria-hidden="true"');
const FIELDS = ['shape', 'band', 'crown', 'fillUrl', 'rimUrl', 'inkUrl', 'iconUrl', 'veins', 'bandW', 'bandDash', 'extra', 'detail', 'iconT', 'icon', 'art', 'hid', 'lbl', 'glyph', 'stampY', 'short', 'title'];
const pickF = (b) => Object.fromEntries(FIELDS.map((f) => [f, b[f] == null ? '' : b[f]]));
function badge(trackKey, i) {
  const t = K.TRACKS.find((x) => x.key === trackKey);
  return pickF(Object.assign(K.look(t.key, K.metalFor(i, t.shorts.length)), { short: t.shorts[i], title: t.titles[i] }));
}

const RANKS = [['Neophyte', '#888888', '#A1A1A6'], ['Athlete', '#4A9EFF', '#4A9EFF'], ['Hero', '#4CAF50', '#4CAF50'], ['Demigod', '#FF9800', '#FF9800'], ['Olympian', '#9C27B0', '#CE82E0'], ['Titan', '#E53935', '#FF6B66'], ['Aretē', '#FFD700', '#FFD700']];
// Sample: Hero, score 41 (Hero runs 28 to 48), so 7 points to Demigod and 65% through the band
const ranks = RANKS.map(([n, c, t], i) => ({ name: n, letter: n === 'Aretē' ? 'Ā' : n[0], ring: i <= 2 ? c : '#48484A', text: i <= 2 ? t : '#8E8E93', bg: i === 2 ? c + '22' : 'transparent' }));
const comps = [
  { label: 'Consistency', weight: '40%', value: 55, what: 'Weeks you trained, out of the last 12' },
  { label: 'Dedication', weight: '30%', value: 40, what: 'Workouts in the last 3 months' },
  { label: 'Volume', weight: '30%', value: 24, what: 'Working sets and cardio a week' }
].map((c) => Object.assign(c, { width: c.value + '%', low: c.label === 'Volume' }));
const recent = [
  { b: badge('vol', 4), dot: true, label: 'Half Million, new' },
  { b: badge('work', 4), dot: true, label: 'Hekaton, new' },
  { b: badge('dist', 3), dot: false, label: '100 Miles' }
].map((r) => Object.assign(r, { dotBg: r.dot ? '{{accent}}' : 'transparent' }));
const data = { ranks: ranks, comps: comps, recent: recent };

const HERO = '#4CAF50', HERO_T = '#4CAF50';
const chevron = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" style="stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round;"></path></svg>';
const icon = (d) => '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '" fill="none" stroke="#8E8E93" style="stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;"></path></svg>';
const note = (n, t, d) => '      <div style="display: flex; gap: 12px;"><div style="flex: 0 0 26px; height: 26px; border-radius: 13px; background: #2C2C2E; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800;">' + n + '</div><div style="display: flex; flex-direction: column; gap: 4px;"><div style="font-size: 16px; font-weight: 800;">' + t + '</div><div style="font-size: 13px; color: #8E8E93; line-height: 1.5;">' + d + '</div></div></div>';
const H = 1150;

function phone(open) {
  return [
'  <div style="width: 390px; height: ' + H + 'px; flex-shrink: 0; border-radius: 28px; overflow: hidden; background: #141416; display: flex; flex-direction: column;">',
'    <div style="height: 54px; flex-shrink: 0;"></div>',
'    <div style="display: flex; align-items: center; padding: 8px 16px; flex-shrink: 0;">',
'      <button aria-label="Go back" style="appearance: none; background: none; border: 0; padding: 10px; margin: -10px; color: #FFFFFF; display: flex;"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" style="stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;"></path></svg></button>',
'      <h1 style="margin: 0; font-size: 20px; font-weight: 700; flex: 1; text-align: center;">Your Journey</h1>',
'      <button aria-label="How Greek Rank works" style="appearance: none; background: none; border: 0; padding: 10px; margin: -10px; color: #FFFFFF; display: flex;"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 .01 0zM12 11v5M12 7.6v.4" fill="none" stroke="currentColor" style="stroke-width: 2; stroke-linecap: round;"></path></svg></button>',
'    </div>',
'',
'    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 0 8px; flex-shrink: 0;">',
'      <button class="plain" aria-label="Change frame. Hero frame in use" style="position: relative; display: flex;">',
'        <div style="width: 112px; height: 112px; border-radius: 56px; border: 4px solid ' + HERO + '; box-sizing: border-box; display: flex; align-items: center; justify-content: center;">',
'          <div style="width: 92px; height: 92px; border-radius: 46px; background: #2C2C2E; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 700; color: #8E8E93;">G</div>',
'        </div>',
'        <div style="position: absolute; right: -2px; bottom: 2px; width: 34px; height: 34px; border-radius: 17px; background: #3A3A3C; border: 3px solid #141416; box-sizing: border-box; display: flex; align-items: center; justify-content: center;"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="#FFFFFF" style="stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;"></path></svg></div>',
'      </button>',
'      <div style="margin-top: 6px; font-size: 28px; font-weight: 800; color: ' + HERO_T + ';">Hero</div>',
'      <div style="font-size: 17px; font-weight: 700;">7 points to Demigod</div>',
'      <button class="plain" aria-expanded="' + open + '" aria-label="Score 41 of 100. ' + (open ? 'Hide' : 'Show') + ' what builds it" style="margin-top: 4px; display: flex; align-items: center; gap: 6px; background: #1C1C1E; border-radius: 16px; padding: 8px 14px; min-height: 36px; font-size: 13px; color: #C7C7CC;">Score 41 of 100<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6') + '" fill="none" stroke="#C7C7CC" style="stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round;"></path></svg></button>',
'    </div>',
  ].concat(open ? [
'    <section aria-label="What builds your score" style="margin: 4px 16px 6px; background: #1C1C1E; border-radius: 16px; padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 14px; flex-shrink: 0;">',
'      <h2 style="margin: 0; font-size: 15px; font-weight: 700;">What builds your score</h2>',
'      <sc-for list="{{comps}}" as="c" hint-placeholder-count="3">',
'        <div style="display: flex; flex-direction: column; gap: 6px;">',
'          <div style="display: flex; align-items: baseline; gap: 8px;">',
'            <span style="font-size: 14px; font-weight: 600;">{{c.label}}</span>',
'            <span style="font-size: 12px; color: #8E8E93;">{{c.weight}} of your score</span>',
'            <span style="margin-left: auto; font-size: 14px; font-weight: 700;">{{c.value}}</span>',
'          </div>',
'          <div style="height: 6px; border-radius: 3px; background: #38383A; overflow: hidden;"><div style="height: 6px; width: {{c.width}}; border-radius: 3px; background: ' + HERO + ';"></div></div>',
'          <span style="font-size: 12px; color: #8E8E93;">{{c.what}}</span>',
'        </div>',
'      </sc-for>',
'      <div style="display: flex; gap: 10px; align-items: flex-start; background: #232325; border-radius: 12px; padding: 12px;">',
'        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink: 0; margin-top: 1px;"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" fill="none" stroke="{{accent}}" style="stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;"></path></svg>',
'        <span style="font-size: 13px; line-height: 1.45;"><b>Volume is your lowest.</b> A couple more working sets each session moves it most.</span>',
'      </div>',
'    </section>',
  ] : [], [
'',
'    <div style="display: flex; gap: 10px; padding: 12px 16px 12px; overflow: hidden; flex-shrink: 0;">',
'      <sc-for list="{{ranks}}" as="r" hint-placeholder-count="7">',
'        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 0 0 60px;">',
'          <div style="width: 50px; height: 50px; border-radius: 25px; border: 3px solid {{r.ring}}; background: {{r.bg}}; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: {{r.text}};">{{r.letter}}</div>',
'          <div style="font-size: 11px; color: {{r.text}};">{{r.name}}</div>',
'        </div>',
'      </sc-for>',
'    </div>',
'',
'    <section aria-label="Progress to Demigod" style="margin: 20px 16px 0; background: #1C1C1E; border-radius: 16px; padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; flex-shrink: 0;">',
'      <div style="display: flex; justify-content: space-between; align-items: baseline;">',
'        <h2 style="margin: 0; font-size: 15px; font-weight: 700;">Progress to Demigod</h2>',
'        <span style="font-size: 13px; color: #8E8E93;">65%</span>',
'      </div>',
'      <div style="height: 8px; border-radius: 4px; background: #38383A; overflow: hidden;"><div style="height: 8px; width: 65%; border-radius: 4px; background: ' + HERO + ';"></div></div>',
'      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #8E8E93;"><span>Hero · 28</span><span>Demigod · 48</span></div>',
'    </section>',
'',
'    <section aria-label="Trophy Hall" style="margin: 14px 16px 0; background: #1C1C1E; border-radius: 16px; padding: 4px 16px 14px; display: flex; flex-direction: column; flex-shrink: 0;">',
'      <button class="plain" aria-label="Trophy Hall, 30 of 70 earned, 2 new. Open" style="display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 0;">',
'        <h2 style="margin: 0; font-size: 15px; font-weight: 700;">Trophy Hall</h2>',
'        <span style="font-size: 13px; color: #8E8E93;">30 of 70 earned</span>',
'        <span style="margin-left: auto; display: flex; color: #8E8E93;">' + chevron + '</span>',
'      </button>',
'      <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 4px 0 12px;">',
'        <sc-for list="{{recent}}" as="e" hint-placeholder-count="3">',
'          <button class="plain" aria-label="{{e.label}}" style="display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center;">',
'            <div style="position: relative; display: flex;">' + svg(84, 'e.b'),
'              <div style="position: absolute; top: 4px; right: 4px; width: 10px; height: 10px; border-radius: 5px; background: {{e.dotBg}};"></div>',
'            </div>',
'            <span style="font-size: 13px; font-weight: 700;">{{e.b.title}}</span>',
'          </button>',
'        </sc-for>',
'      </div>',
'      <div style="border-top: 1px solid #38383A; padding-top: 12px; display: flex; align-items: center; gap: 8px; font-size: 13px;">',
'        <span style="color: #8E8E93;">Almost there</span>',
'        <span style="font-weight: 600;">500 PRs, 61 to go</span>',
'      </div>',
'    </section>',
'',
'  </div>',
  ]);
}

// A Top ranks score card: name, percentile, and "Counts" on the higher of the two, which is the one the gates read
function scoreCard(name, pct, counts) {
  return '          <button class="plain" aria-label="' + name + ', ' + pct + ' percentile' + (counts ? ', counts toward the top ranks' : '') + '. Open" style="flex: 1; background: #232325; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; min-height: 44px; border: 1.5px solid ' + (counts ? '#CE82E0' : 'transparent') + ';">' +
    '<span style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #8E8E93;">' + name + '<span style="display: flex; color: #8E8E93;">' + chevron + '</span></span>' +
    '<span style="font-size: 20px; font-weight: 800;">' + pct + ' <span style="font-size: 12px; font-weight: 500; color: #8E8E93;">percentile</span></span>' +
    '<span style="font-size: 11px; font-weight: 700; color: ' + (counts ? '#CE82E0' : 'transparent') + ';">Counts</span></button>';
}

const page = [
'<!doctype html>',
'<html lang="en">',
'<head>',
'<meta charset="utf-8">',
'<title>Your Journey redesign</title>',
'<script src="./support.js"></script>',
'</head>',
'<body>',
'<x-dc>',
'<helmet>',
'<link rel="preconnect" href="https://fonts.googleapis.com">',
'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet">',
'<style>' + css + '.plain{appearance:none;background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;text-align:left}</style>',
'</helmet>',
'<div style="width: 1318px; height: ' + (H + 72) + 'px; box-sizing: border-box; background: #0B0B0C; color: #FFFFFF; font-family: Inter, -apple-system, sans-serif; padding: 36px 40px; display: flex; gap: 48px;">',
'  <svg width="0" height="0" aria-hidden="true" style="position: absolute;">' + defs + '</svg>',
'',
...phone(false),
...phone(true),
'',
'  <div style="flex: 1; display: flex; flex-direction: column; gap: 26px; padding-top: 8px;">',
'    <div style="display: flex; flex-direction: column; gap: 6px;"><div style="font-size: 12px; font-weight: 700; letter-spacing: 1.5px; color: #8E8E93;">YOUR JOURNEY · REDESIGN</div><div style="font-size: 24px; font-weight: 800;">Next step first, one job per card</div></div>',
note('1', 'Points to the next rank lead', 'Under the rank name: "7 points to Demigod". The score is a small button. Left phone as the screen opens, right phone after a tap.'),
note('2', 'The big card is split in three', 'Progress is only the bar. What builds your score opens from the score button. Top ranks is its own card, shown only once the gates are in reach (an Olympian\'s below).'),
'      <div style="margin-left: 38px; background: #1C1C1E; border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;">',
'        <div style="display: flex; justify-content: space-between; align-items: baseline;"><span style="font-size: 15px; font-weight: 700;">Top ranks</span><span style="font-size: 12px; color: #8E8E93;">for an Olympian</span></div>',
'        <div style="font-size: 12px; color: #8E8E93; line-height: 1.45;">Effort earns the points. The top two ranks also need your best performance score.</div>',
'        <div style="display: flex; gap: 8px;">',
scoreCard('Strength Score', '62nd', true),
scoreCard('Endurance Score', '38th', false),
'        </div>',
'        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px;">' + icon('M5 12l4 4 10-10') + '<span style="color: #FF6B66; font-weight: 700;">Titan</span><span style="color: #8E8E93;">50th percentile</span></div>',
'        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px;">' + icon('M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z') + '<span style="font-weight: 700;">Aretē</span><span style="color: #8E8E93;">80th percentile · you\'re at 62nd</span></div>',
'      </div>',
note('3', 'Frames move to the avatar', 'The Frame Equipped button is gone. The pencil on the avatar opens Choose a frame; a tap puts one on.'),
'      <div style="margin-left: 38px; background: #1C1C1E; border-radius: 16px; padding: 14px 12px 16px; display: flex; flex-direction: column; gap: 12px;">',
'        <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 0 4px;"><span style="font-size: 15px; font-weight: 700;">Choose a frame</span><span style="font-size: 12px; color: #8E8E93;">3 of 7 unlocked</span></div>',
'        <div style="display: flex;">',
'          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1;"><div style="position: relative; width: 56px; height: 56px; border-radius: 28px; border: 3px solid #888888; box-sizing: border-box; display: flex; align-items: center; justify-content: center;"><div style="width: 42px; height: 42px; border-radius: 21px; background: #2C2C2E; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #8E8E93;">G</div></div><span style="font-size: 12px; font-weight: 600; color: #FFFFFF;">Neophyte</span><span style="font-size: 11px; color: #8E8E93;"></span></div>',
'          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1;"><div style="position: relative; width: 56px; height: 56px; border-radius: 28px; border: 3px solid #4A9EFF; box-sizing: border-box; display: flex; align-items: center; justify-content: center;"><div style="width: 42px; height: 42px; border-radius: 21px; background: #2C2C2E; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #8E8E93;">G</div></div><span style="font-size: 12px; font-weight: 600; color: #FFFFFF;">Athlete</span><span style="font-size: 11px; color: #8E8E93;"></span></div>',
'          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1;"><div style="position: relative; width: 56px; height: 56px; border-radius: 28px; border: 3px solid #4CAF50; box-sizing: border-box; display: flex; align-items: center; justify-content: center;"><div style="width: 42px; height: 42px; border-radius: 21px; background: #2C2C2E; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #8E8E93;">G</div><div style="position: absolute; right: -4px; bottom: -2px; width: 20px; height: 20px; border-radius: 10px; background: #4CAF50; border: 2px solid #1C1C1E; display: flex; align-items: center; justify-content: center;"><svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4 10-10" fill="none" stroke="#000000" style="stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round;"></path></svg></div></div><span style="font-size: 12px; font-weight: 600; color: #FFFFFF;">Hero</span><span style="font-size: 11px; color: #8E8E93;">In use</span></div>',
'          <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1;"><div style="position: relative; width: 56px; height: 56px; border-radius: 28px; border: 3px dashed #48484A; box-sizing: border-box; display: flex; align-items: center; justify-content: center;"><div style="width: 42px; height: 42px; border-radius: 21px; background: #2C2C2E; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #8E8E93;"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" fill="none" stroke="#8E8E93" style="stroke-width: 2; stroke-linejoin: round;"></path></svg></div></div><span style="font-size: 12px; font-weight: 600; color: #8E8E93;">Demigod</span><span style="font-size: 11px; color: #8E8E93;">At 48</span></div>',
'        </div>',
'      </div>',
note('5', 'Trophy Hall card matches the hall', 'Latest three badges, a dot on unseen ones, the earned count and one Almost there line. No bar, no border.'),
note('6', 'Score cards live in Top ranks', 'The score links at the bottom are gone. Only the top ranks need the scores, so they are two cards inside Top ranks, the one that counts outlined. Below that, Progress still opens both.'),
'    <div style="font-size: 13px; color: #8E8E93; line-height: 1.5; border-top: 1px solid #2C2C2E; padding-top: 16px;">Unchanged: the letters in the rank circles (idea 4, not picked).</div>',
'  </div>',
'</div>',
'</x-dc>',
'<script type="text/x-dc" data-dc-script data-props=\'{"accent":{"editor":"color","default":"#30D158","options":["#30D158","#0A84FF","#BF5AF2","#FF9F0A"]},"$preview":{"width":1318,"height":' + (H + 72) + '}}\'>',
'// Badge drawing data exported from the badge sheet by tools/gen_journey.js, so this screen matches it exactly',
'const DATA = ' + JSON.stringify(data) + ';',
'class Component extends DCLogic {',
'  renderVals() {',
'    const accent = this.props.accent ?? \'#30D158\';',
'    return Object.assign({ accent: accent }, DATA, { recent: DATA.recent.map((r) => Object.assign({}, r, { dotBg: r.dotBg.replace(\'{{accent}}\', accent) })) });',
'  }',
'}',
'</script>',
'</body>',
'</html>',
''].join('\n');
fs.writeFileSync(outPath, page);
console.log('journey written', page.length, 'bytes');
