// Builds the profile frame sheet: seven rank frames that each add one ornament to the one below,
// in the badges' metal finish. Everything is gradients and offset copies (no SVG filters), so it
// ports to react-native-svg. Units: avatar radius 36 at the centre of a 120 box (-10..110).
const fs = require('fs');
const out = process.argv[2];
const f = (n) => n.toFixed(2);
const RANKS = [['Neophyte', '#888888'], ['Athlete', '#4A9EFF'], ['Hero', '#4CAF50'], ['Demigod', '#FF9800'], ['Olympian', '#9C27B0'], ['Titan', '#E53935'], ['Aretē', '#FFD700']];
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const C = 50, AV = 36, RAIL_IN = 38.6, KEY_IN = 40, KEY_OUT = 45.4, RAIL_OUT = 47;
const pol = (r, a) => [C + r * Math.sin(a), C - r * Math.cos(a)];
const circle = (r) => 'M' + f(C) + ' ' + f(C - r) + ' A' + r + ' ' + r + ' 0 1 1 ' + f(C - 0.01) + ' ' + f(C - r) + ' Z';

// Running Greek key between two radii: one hooked spiral per cell standing on the inner rail
function meander(n, rIn, rOut) {
  const cell = [[0.1, 1], [0.1, 0.12], [0.86, 0.12], [0.86, 0.74], [0.4, 0.74], [0.4, 0.44], [0.62, 0.44]];
  let d = '';
  for (let i = 0; i < n; i++) {
    d += cell.map(([u, v], k) => { const [x, y] = pol(rOut - v * (rOut - rIn), (i + u) / n * 2 * Math.PI); return (k ? 'L' : 'M') + f(x) + ' ' + f(y); }).join(' ') + ' ';
  }
  return d;
}
// Palmette (anthemion): five leaves fanned from a base on the outer rail, pointing outward
function palmette(angle, base, len) {
  let d = '';
  [-52, -26, 0, 26, 52].forEach((deg, i) => {
    const L = len * (i === 2 ? 1 : i === 1 || i === 3 ? 0.86 : 0.68), w = L * 0.24;
    const a = angle + deg * Math.PI / 180, [bx, by] = pol(base, angle);
    const tx = bx + L * Math.sin(a), ty = by - L * Math.cos(a), nx = Math.cos(a) * w, ny = Math.sin(a) * w;
    const mx = (bx + tx) / 2, my = (by + ty) / 2;
    d += 'M' + f(bx) + ' ' + f(by) + ' Q' + f(mx + nx) + ' ' + f(my + ny) + ' ' + f(tx) + ' ' + f(ty) + ' Q' + f(mx - nx) + ' ' + f(my - ny) + ' ' + f(bx) + ' ' + f(by) + ' Z ';
  });
  const [x0, y0] = pol(base - 0.6, angle - 0.11), [x1, y1] = pol(base - 0.6, angle + 0.11), [xc, yc] = pol(base + 2.2, angle);
  return d + 'M' + f(x0) + ' ' + f(y0) + ' Q' + f(xc) + ' ' + f(yc) + ' ' + f(x1) + ' ' + f(y1) + ' Z ';
}
const dot = (r, a, s) => { const [x, y] = pol(r, a); return 'M' + f(x) + ' ' + f(y - s) + ' A' + s + ' ' + s + ' 0 1 1 ' + f(x - 0.01) + ' ' + f(y - s) + ' Z '; };
// Titan's stone ring: 24 blocks with mortar gaps
function blocks(rIn, rOut, n) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i + 0.06) / n * 2 * Math.PI, a1 = (i + 0.94) / n * 2 * Math.PI;
    const p = [pol(rOut, a0), pol(rOut, a1), pol(rIn, a1), pol(rIn, a0)];
    d += 'M' + f(p[0][0]) + ' ' + f(p[0][1]) + ' A' + rOut + ' ' + rOut + ' 0 0 1 ' + f(p[1][0]) + ' ' + f(p[1][1]) + ' L' + f(p[2][0]) + ' ' + f(p[2][1]) + ' A' + rIn + ' ' + rIn + ' 0 0 0 ' + f(p[3][0]) + ' ' + f(p[3][1]) + ' Z ';
  }
  return d;
}
// Olive crown (kotinos): broad leaves in pairs up both sides from the bottom, open at the top
function olive(r) {
  let d = '';
  [1, -1].forEach((side) => {
    for (let t = 0; t < 12; t++) {
      const a = Math.PI + side * (0.16 + t * 0.215);
      const [px, py] = pol(r, a);
      const tx = side * Math.cos(a) * -1, ty = side * Math.sin(a) * -1, nx = Math.sin(a), ny = -Math.cos(a);
      [0.55, -0.55].forEach((k) => {
        let dx = tx + nx * k, dy = ty + ny * k; const l = Math.hypot(dx, dy); dx /= l; dy /= l;
        const L = t > 9 ? 7 : 9;
        const qx = px + dx * L, qy = py + dy * L, mx = (px + qx) / 2, my = (py + qy) / 2, ox = -dy * 2.4, oy = dx * 2.4;
        d += 'M' + f(px) + ' ' + f(py) + ' Q' + f(mx + ox) + ' ' + f(my + oy) + ' ' + f(qx) + ' ' + f(qy) + ' Q' + f(mx - ox) + ' ' + f(my - oy) + ' ' + f(px) + ' ' + f(py) + ' Z ';
      });
    }
  });
  return d;
}
function oliveStem(r) {
  return [1, -1].map((side) => { const [x0, y0] = pol(r, Math.PI + side * 0.1), [x1, y1] = pol(r, Math.PI + side * (0.16 + 11 * 0.215)); return 'M' + f(x0) + ' ' + f(y0) + ' A' + r + ' ' + r + ' 0 0 ' + (side > 0 ? 1 : 0) + ' ' + f(x1) + ' ' + f(y1); }).join(' ');
}
const defs = RANKS.map(([n, c], i) => {
  const hi = mix(c, '#FFFFFF', 0.6), lo = mix(c, '#000000', 0.5);
  return '<linearGradient id="r' + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color: ' + hi + ';"></stop><stop offset="0.42" style="stop-color: ' + c + ';"></stop><stop offset="0.78" style="stop-color: ' + lo + ';"></stop><stop offset="1" style="stop-color: ' + c + ';"></stop></linearGradient>' +
    '<radialGradient id="b' + i + '" cx="0.38" cy="0.3" r="0.8"><stop offset="0" style="stop-color: ' + mix(c, '#141416', 0.55) + ';"></stop><stop offset="1" style="stop-color: ' + mix(c, '#141416', 0.85) + ';"></stop></radialGradient>';
}).join('') + '<linearGradient id="glint" x1="0" y1="0" x2="1" y2="1"><stop offset="0.25" style="stop-color: #FFFFFF; stop-opacity: 0;"></stop><stop offset="0.36" style="stop-color: #FFFFFF; stop-opacity: 0.55;"></stop><stop offset="0.47" style="stop-color: #FFFFFF; stop-opacity: 0;"></stop></linearGradient>' +
  '<radialGradient id="olv" cx="0.5" cy="0.4" r="0.7"><stop offset="0" style="stop-color: #C9D6A8;"></stop><stop offset="1" style="stop-color: #7E9466;"></stop></radialGradient>';

// One frame. Each rank adds its ornament to everything below it; under 64 px the key band drops out.

// Demigod's ornament, kept by every rank above it. ORN picks the option being compared.
let ORN = process.env.ORN || 'egg';
// 'dark' or 'light': light mode softens the shadows and adds an edge in a darker tint of the rank colour
let MODE = 'dark';
function ellipse(cx, cy, rr, rt, a) {
  const pts = [];
  for (let k = 0; k < 14; k++) { const t = k / 14 * 2 * Math.PI, u = rr * Math.cos(t), v = rt * Math.sin(t); pts.push([cx + u * Math.sin(a) + v * Math.cos(a), cy - u * Math.cos(a) + v * Math.sin(a)]); }
  return 'M' + pts.map(([x, y]) => f(x) + ' ' + f(y)).join(' L') + ' Z ';
}
function ornament(kind, i, small, rim, solid) {
  const r0 = i === 5 ? 52.9 : i === 6 ? 50 : 50.4;
  let d = '';
  if (kind === 'palm') {
    const angles = i === 6 ? [0] : [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
    return solid(angles.map((a) => palmette(a, i === 5 ? 50.4 : RAIL_OUT + 0.6, i === 6 ? 12 : 10)).join(''), rim);
  }
  if (kind === 'egg') {
    // Eggs nearly touching, darts as fine points between them, framed by a rim on the outside
    const n = small ? 26 : 40, rt = small ? 3.3 : 2.6, rr = small ? 2.6 : 2.1;
    const ground = '<path d="' + circle(r0 + 0.45) + '" fill="none" stroke="url(#b' + i + ')" style="stroke-width: ' + (2 * rr + 1.6) + ';"></path>';
    for (let k = 0; k < n; k++) {
      const a = k / n * 2 * Math.PI, b = (k + 0.5) / n * 2 * Math.PI;
      const [x, y] = pol(r0, a); d += ellipse(x, y, rr, rt, a);
      const [p0x, p0y] = pol(r0 - rr, b), [p1x, p1y] = pol(r0 + rr * 0.7, b - 0.008), [p2x, p2y] = pol(r0 + rr * 0.7, b + 0.008);
      d += 'M' + f(p0x) + ' ' + f(p0y) + ' L' + f(p1x) + ' ' + f(p1y) + ' L' + f(p2x) + ' ' + f(p2y) + ' Z ';
    }
    return ground + solid(d, rim) + '<path d="' + circle(r0 + rr + 0.9) + '" fill="none" stroke="' + rim + '" style="stroke-width: ' + (small ? 1.6 : 1.1) + ';"></path>';
  }
  if (kind === 'boss') {
    const R = small ? 5 : 4.2;
    [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].forEach((a) => { const [x, y] = pol(r0 + 0.6, a); d += ellipse(x, y, R, R, 0); });
    let s2 = solid(d, rim), inner = '', hi = '';
    [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].forEach((a) => { const [x, y] = pol(r0 + 0.6, a); inner += ellipse(x, y, R * 0.58, R * 0.58, 0); hi += ellipse(x - R * 0.3, y - R * 0.32, R * 0.2, R * 0.2, 0); });
    return s2 + '<path d="' + inner + '" fill="none" stroke="rgba(0,0,0,0.45)" style="stroke-width: 0.8;"></path><path d="' + hi + '" fill="rgba(255,255,255,0.7)"></path>';
  }
  if (kind === 'bead') {
    // Long beads and paired reels end to end, between two fine rims
    const n = small ? 22 : 34, rt = small ? 3.2 : 2.7, rr = small ? 1.7 : 1.35;
    for (let k = 0; k < n; k++) {
      const a = k / n * 2 * Math.PI, b = (k + 0.5) / n * 2 * Math.PI, gap = (2 * Math.PI / n - 2 * rt / r0) / 4;
      const [x, y] = pol(r0, a); d += ellipse(x, y, rr, rt, a);
      [-gap, gap].forEach((o) => { const [qx, qy] = pol(r0, b + o); d += ellipse(qx, qy, rr * 0.75, gap * r0 * 0.75, b); });
    }
    const edge = small ? 1.2 : 0.8;
    return solid(d, rim) + '<path d="' + circle(r0 + rr + 0.9) + '" fill="none" stroke="' + rim + '" style="stroke-width: ' + edge + ';"></path>';
  }
  return '';
}
function frame(i, px) {
  const small = px < 64;
  const rim = 'url(#r' + i + ')', ink = mix(RANKS[i][1], '#FFFFFF', 0.35);
  const ring = (r, w) => '<path d="' + circle(r) + '" fill="none" stroke="rgba(0,0,0,' + (MODE === 'light' ? 0.2 : 0.55) + ')" style="stroke-width: ' + (w + 1.2) + ';" transform="translate(0.4 0.8)"></path><path d="' + circle(r) + '" fill="none" stroke="' + rim + '" style="stroke-width: ' + w + ';"></path>';
  const solid = (d, fill) => '<path d="' + d + '" fill="rgba(0,0,0,' + (MODE === 'light' ? 0.18 : 0.5) + ')" transform="translate(0.5 0.9)"></path><path d="' + d + '" fill="' + fill + '"></path>';
  let s = '';
  if (i === 6) s += '<path d="' + oliveStem(51.4) + '" fill="none" stroke="#7E9466" style="stroke-width: 1.2;"></path>' + solid(olive(51.4), 'url(#olv)');
  if (i >= 2 && !small) s += '<path d="' + circle((RAIL_IN + RAIL_OUT) / 2) + '" fill="none" stroke="url(#b' + i + ')" style="stroke-width: ' + (RAIL_OUT - RAIL_IN) + ';"></path>';
  if (i === 5) s += '<path d="' + circle((RAIL_OUT - 0.6 + 50.6) / 2) + '" fill="none" stroke="url(#b5)" style="stroke-width: ' + (50.6 - RAIL_OUT + 0.6) + ';"></path>' + solid(blocks(RAIL_OUT - 0.6, 50.6, 24), rim);
  if (i === 0) s += ring(39.5, 3);
  else if (i === 1) s += ring(40.4, 4) + ring(44, 0.9);
  else {
    if (small) s += ring(RAIL_OUT - 2.4, 6.4);
    else {
      s += ring(RAIL_IN, 1.3) + (i === 5 ? '' : ring(RAIL_OUT, 2.2));
      s += '<path d="' + meander(36, KEY_IN, KEY_OUT) + '" fill="none" stroke="rgba(0,0,0,0.5)" transform="translate(0.3 0.5)" style="stroke-width: 1; stroke-linejoin: miter;"></path><path d="' + meander(36, KEY_IN, KEY_OUT) + '" fill="none" stroke="' + ink + '" style="stroke-width: 1; stroke-linejoin: miter;"></path>';
    }
  }
  if (i >= 3 && i !== 6 && !(i === 5 && small)) s += ornament(ORN, i, small, rim, solid);
  if (i >= 4) {
    let d = '';
    for (let k = 0; k < 12; k++) { const a = (k + 0.5) / 12 * 2 * Math.PI; d += dot(i === 5 ? 48.6 : RAIL_OUT, a, small ? 1.9 : 1.75); }
    s += solid(d, ink);
  }
  if (MODE === 'light') {
    const outer = i === 0 ? 41 : i === 1 ? 44.45 : i === 2 || i === 6 ? (small ? 47.4 : 48.1) : i === 5 ? (small ? 50.6 : 56.45) : (small ? 54.4 : 53.95);
    s += '<path d="' + circle(outer + 0.3) + '" fill="none" stroke="' + mix(RANKS[i][1], '#000000', 0.45) + '" style="stroke-width: 0.7;"></path>';
  }
  const glint = '<path d="' + circle(i === 5 ? 48.6 : i <= 1 ? 44 : RAIL_OUT - 2) + '" fill="none" stroke="url(#glint)" style="stroke-width: ' + (i === 5 ? 4.5 : 5) + ';"></path>';
  const avatar = '<path d="' + circle(AV) + '" fill="#2C2C2E"></path><text x="50" y="62" style="font: 700 32px Inter, sans-serif; text-anchor: middle;" fill="#8E8E93">G</text>';
  return '<svg viewBox="-10 -10 120 120" width="' + Math.round(px * 120 / 72) + '" height="' + Math.round(px * 120 / 72) + '" role="img" aria-label="' + RANKS[i][0] + ' frame">' + avatar + s + (i >= 4 ? glint : '') + '</svg>';
}

const col = (i) => '<div style="display: flex; flex-direction: column; align-items: center; gap: 10px; width: 270px;">' +
  '<div style="height: 250px; display: flex; align-items: center;">' + frame(i, 144) + '</div>' +
  '<div style="font-size: 18px; font-weight: 800; color: ' + ['#A1A1A6', '#4A9EFF', '#4CAF50', '#FF9800', '#CE82E0', '#FF6B66', '#FFD700'][i] + ';">' + RANKS[i][0] + '</div>' +
  '<div style="font-size: 12px; color: #8E8E93; text-align: center; line-height: 1.4; height: 34px;">' + ['Plain ring', '+ fine outer line', '+ Greek key band', '+ egg-and-dart border', '+ twelve studs, glint', '+ carved stone blocks', 'Gold, olive crown for the border'][i] + '</div>' +
  '<div style="display: flex; align-items: center; gap: 22px; height: 130px;">' + frame(i, 72) + frame(i, 44) + '</div>' +
  lightTile(i) +
  '</div>';
function lightTile(i) {
  MODE = 'light';
  const html = '<div style="display: flex; align-items: center; justify-content: center; gap: 22px; height: 140px; align-self: stretch; background: #F2F2F7; border-radius: 16px;">' + frame(i, 72) + frame(i, 44) + '</div>';
  MODE = 'dark';
  return html;
}
const W = 7 * 270 + 6 * 16 + 96;
const page = [
'<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">', '<title>Profile frames</title>', '<script src="./support.js"></script>', '</head>', '<body>', '<x-dc>', '<helmet>',
'<link rel="preconnect" href="https://fonts.googleapis.com">',
'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet">',
'<style>body{margin:0}</style>', '</helmet>',
'<div style="width: ' + W + 'px; height: 920px; box-sizing: border-box; background: #141416; color: #FFFFFF; font-family: Inter, -apple-system, sans-serif; padding: 40px 48px; display: flex; flex-direction: column; gap: 22px;">',
'  <svg width="0" height="0" aria-hidden="true" style="position: absolute;"><defs>' + defs + '</defs></svg>',
'  <div style="display: flex; flex-direction: column; gap: 8px;">',
'    <h1 style="margin: 0; font-size: 30px; font-weight: 800;">Profile frames</h1>',
'    <p style="margin: 0; font-size: 15px; color: #8E8E93; line-height: 1.5; max-width: 1200px;">Each rank keeps everything below it and adds one Greek ornament, in the badges\' metal finish tinted by the rank\'s own colour. Top row: the Your Journey hero. Below: Profile (72) and the rank-up card (44) on the dark theme, then on the light theme, where shadows soften and each frame gets an edge in a darker tint of its colour. Under 64 px the key band drops out and Titan drops the egg-and-dart, so small frames stay clean. Olympian and up carry a glint that sweeps the rim (frozen here); with Reduce Motion it stays still.</p>',
'  </div>',
'  <div style="display: flex; gap: 16px;">' + RANKS.map((_, i) => col(i)).join('') + '</div>',
'  <div style="display: flex; gap: 40px; font-size: 13px; color: #8E8E93; line-height: 1.5; border-top: 1px solid #2C2C2E; padding-top: 16px;">',
'    <div style="flex: 1;"><b style="color: #FFFFFF;">Olive, not laurel.</b> Aretē trades the PR laurel for the olive crown the top badges wear, so ranks, badges and PRs never share an ornament.</div>',
'    <div style="flex: 1;"><b style="color: #FFFFFF;">Room.</b> Ornaments sit outside the ring, as the Aretē wreath already does (frameOverflow), so the photo keeps its size.</div>',
'    <div style="flex: 1;"><b style="color: #FFFFFF;">Motion.</b> The whole-frame pulse goes. A glint rotates on the native driver; under Reduce Motion it stays still, which the pulse never did.</div>',
'  </div>',
'</div>',
'</x-dc>',
'<script type="text/x-dc" data-dc-script data-props=\'{"$preview":{"width":' + W + ',"height":920}}\'>',
'class Component extends DCLogic { renderVals() { return {}; } }',
'</script>', '</body>', '</html>', ''].join('\n');
fs.writeFileSync(out, page);
if (process.argv[3]) {
  const OPTS = [['egg', 'Egg-and-dart', 'The moulding under every Greek temple cornice: a continuous border of eggs and darts. Reads as a fine beaded rim at 44 px.'], ['boss', 'Four phalerae', 'Round bronze bosses at the four points, the discs worn as honours. Keeps four marks like the palmettes, without the spikes.'], ['bead', 'Bead-and-reel', 'The astragal from column mouldings: long beads with paired reels. The quietest of the three.']];
  const card = (o) => { ORN = o[0]; return '<div style="flex: 1; background: #1C1C1E; border-radius: 20px; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 10px;">' +
    '<div style="font-size: 20px; font-weight: 800;">' + o[1] + '</div><div style="font-size: 13px; color: #8E8E93; text-align: center; line-height: 1.45; height: 38px;">' + o[2] + '</div>' +
    '<div style="display: flex; align-items: center; gap: 4px;">' + frame(3, 104) + frame(4, 104) + '</div>' +
    '<div style="display: flex; gap: 104px; font-size: 13px; font-weight: 700;"><span style="color: #FF9800;">Demigod</span><span style="color: #CE82E0;">Olympian</span></div>' +
    '<div style="display: flex; align-items: center; gap: 22px; margin-top: 6px;">' + frame(3, 72) + frame(3, 44) + frame(5, 72) + '</div>' +
    '<div style="font-size: 12px; color: #8E8E93;">Demigod at 72 and 44 · Titan at 72</div></div>'; };
  const P = ['<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">', '<title>Demigod ornament options</title>', '<script src="./support.js"></script>', '</head>', '<body>', '<x-dc>', '<helmet>', '<link rel="preconnect" href="https://fonts.googleapis.com">', '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet">', '<style>body{margin:0}</style>', '</helmet>',
    '<div style="width: 1480px; height: 640px; box-sizing: border-box; background: #141416; color: #FFFFFF; font-family: Inter, -apple-system, sans-serif; padding: 36px 40px; display: flex; flex-direction: column; gap: 20px;">',
    '  <svg width="0" height="0" aria-hidden="true" style="position: absolute;"><defs>' + defs + '</defs></svg>',
    '  <div><h1 style="margin: 0; font-size: 28px; font-weight: 800;">Demigod ornament · options</h1><p style="margin: 6px 0 0; font-size: 14px; color: #8E8E93;">Replacing the four palmettes. Whichever is picked, every rank above Demigod keeps it.</p></div>',
    '  <div style="display: flex; gap: 20px;">' + OPTS.map(card).join('') + '</div>', '</div>', '</x-dc>',
    '<script type="text/x-dc" data-dc-script data-props=\'{"$preview":{"width":1480,"height":640}}\'>', 'class Component extends DCLogic { renderVals() { return {}; } }', '</script>', '</body>', '</html>', ''].join('\n');
  fs.writeFileSync(process.argv[3], P);
  console.log('options written');
}
console.log('frames written', page.length, 'bytes, width', W);

// Review harness: every frame large and at app sizes on both themes, plus measured extents
if (process.env.REVIEW) {
  const ext = RANKS.map((_, i) => [144, 72, 44].map((px) => {
    const svgs = frame(i, px).replace(/<text[\s\S]*?<\/text>/g, '');
    let max = 0;
    for (const m of svgs.matchAll(/d="([^"]+)"/g)) {
      const nums = m[1].replace(/[A-Za-z]/g, ' ').trim().split(/[\s,]+/).map(Number);
      // pairs only from absolute M/L/Q points; arc flags make this approximate, so arcs use the circle radius instead
      if (/A/.test(m[1]) && /^M-?[\d.]+ -?[\d.]+ A([\d.]+)/.test(m[1])) { const r = +m[1].match(/A([\d.]+)/)[1]; max = Math.max(max, r); continue; }
      for (let k = 0; k + 1 < nums.length; k += 2) max = Math.max(max, Math.hypot(nums[k] - 50, nums[k + 1] - 50));
    }
    return max.toFixed(1);
  }));
  const big = (bg, i) => { MODE = bg === '#141416' ? 'dark' : 'light'; const html = '<div style="background:' + bg + ';padding:16px;border-radius:16px;display:flex;flex-direction:column;align-items:center;gap:8px">' + frame(i, 216) + '<div style="display:flex;gap:16px;align-items:center">' + frame(i, 72) + frame(i, 44) + '</div></div>'; MODE = 'dark'; return html; };
  const rows = RANKS.map((r, i) => (process.env.ONLYR && !process.env.ONLYR.split(',').includes(String(i))) ? '' : '<div style="display:flex;gap:16px;align-items:center"><div style="width:110px;color:#fff;font:700 15px Inter">' + r[0] + '<br><span style="font:12px Inter;color:#8E8E93">reach ' + ext[i].join(' / ') + '</span></div>' + big('#141416', i) + big('#F2F2F7', i) + big('#FFFFFF', i) + '</div>').join('');
  fs.writeFileSync(process.env.REVIEW, '<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap" rel="stylesheet"><style>body{margin:0;background:#000;padding:16px}</style></head><body><svg width="0" height="0" style="position:absolute"><defs>' + defs + '</defs></svg><div style="display:flex;flex-direction:column;gap:12px">' + rows + '</div></body></html>');
  console.log('extents (box edge is 60):', JSON.stringify(RANKS.map((r, i) => [r[0], ext[i]])));
}
