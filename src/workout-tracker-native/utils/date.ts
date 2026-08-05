// Never use `date.toISOString()` for a backend-bound date string — it outputs UTC
// and shifts the date in US timezones. This builds the string from local getters.
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
