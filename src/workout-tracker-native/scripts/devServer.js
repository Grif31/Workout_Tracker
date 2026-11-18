// `npm run dev`: expo start with ARETE_DEV_SERVER set, which app.config.js
// reads to skip the fingerprint runtime version. A script rather than an inline
// `VAR=1 expo start` because npm runs scripts through cmd.exe on Windows.
const { spawn } = require('child_process');

const child = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ARETE_DEV_SERVER: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
