// Never use `date.toISOString()` for a backend-bound date string — it outputs UTC
// and shifts the date in US timezones. This builds the string from local getters.
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Parse a date from the API. Some endpoints send a bare "YYYY-MM-DD", which
// `new Date()` reads as UTC midnight: the previous evening anywhere west of
// UTC, so the day shown is one early. Bare dates are read as local days;
// anything with a time component parses as usual.
export function parseApiDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

// Coarse "how long since" for a last-updated stamp, where recency reads better
// than a timestamp. Minute resolution below an hour, then hours, then days.
export function timeAgo(isoStr: string): string {
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
