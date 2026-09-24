// Run every test in a timezone behind UTC. Date bugs in this app (a bare
// "YYYY-MM-DD" parsed as UTC, toISOString() used for a local day) only show
// west of UTC, so on a UTC CI runner they'd pass. Set here, before the
// workers start, because Node reads TZ when a process launches.
module.exports = () => {
  process.env.TZ = 'America/Los_Angeles';
};
