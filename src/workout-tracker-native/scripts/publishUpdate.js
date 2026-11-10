// Publishes an over-the-air update: npm run update:<preview|production> -- "What changed"
//
// `eas update --environment` bundles with the EAS environment's variables and
// ignores both eas.json's build env and the local .env (which sets
// EXPO_PUBLIC_BETA_PREMIUM). So before publishing, the EXPO_PUBLIC_* values in
// that EAS environment must equal the build profile's exactly: a missing
// EXPO_PUBLIC_API_URL sends every request nowhere, and a stray BETA_PREMIUM
// gives premium away, to every installed app at once with no review in between.
const { execSync } = require('child_process');
const path = require('path');
const eas = require('../eas.json');

const CHANNELS = ['preview', 'production'];

function publicVars(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([k]) => k.startsWith('EXPO_PUBLIC_')),
  );
}

// Returns a list of problems; empty means the update bundles what the build did
function envMismatches(profileEnv, actualEnv) {
  const expected = publicVars(profileEnv);
  const actual = publicVars(actualEnv);
  const problems = [];
  for (const [k, v] of Object.entries(expected)) {
    if (!(k in actual)) problems.push(`${k} is missing`);
    else if (actual[k] !== v) problems.push(`${k} differs from eas.json`);
  }
  for (const k of Object.keys(actual)) {
    if (!(k in expected)) problems.push(`${k} is set but the build profile doesn't set it`);
  }
  return problems;
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });

function main() {
  const args = process.argv.slice(2);

  // Runs inside `eas env:exec`, so process.env is the EAS environment
  if (args[0] === '--check') {
    const problems = envMismatches(eas.build[args[1]].env, process.env);
    if (problems.length) {
      console.error(`EAS "${args[1]}" environment doesn't match eas.json build.${args[1]}.env:`);
      problems.forEach((p) => console.error(`  - ${p}`));
      console.error(`Fix it with eas env:create / eas env:update --environment ${args[1]}, then publish again.`);
      process.exit(1);
    }
    console.log(`EAS "${args[1]}" environment matches the build profile.`);
    return;
  }

  const [channel, ...rest] = args;
  const message = rest.join(' ').replace(/"/g, "'");
  if (!CHANNELS.includes(channel) || !message) {
    console.error('Usage: npm run update:<preview|production> -- "What changed"');
    process.exit(1);
  }

  run(`npx eas-cli env:exec ${channel} "node scripts/publishUpdate.js --check ${channel}" --non-interactive`);
  run(`npx eas-cli update --channel ${channel} --environment ${channel} --message "${message}" --non-interactive`);
  // Crashes inside an update only symbolicate against that update's own maps
  run(`npx eas-cli env:exec ${channel} "npx sentry-expo-upload-sourcemaps dist" --non-interactive`);
}

if (require.main === module) main();

module.exports = { envMismatches };
