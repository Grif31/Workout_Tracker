// Loads the badge sheet's own script and returns every badge exactly as the canvas renders it.
const fs = require('fs');
module.exports = function load(file) {
  const html = fs.readFileSync(file, 'utf8');
  const js = html.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/)[1];
  const Component = new Function('DCLogic', js + '\nreturn Component;')(class { constructor() { this.props = {}; } });
  const v = new Component().renderVals();
  const out = [];
  v.tracks.forEach((t) => t.badges.forEach((b) => out.push(Object.assign({ track: t.name }, b))));
  return { badges: out, vals: v, html };
};
