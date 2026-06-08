/**
 * @jest-environment node
 *
 * Unit tests for the pure utility functions used by the muscle volume card.
 * These functions live in TrainingScreen.tsx but their logic is self-contained.
 */

// ── Mirrors of the helpers under test ────────────────────────────────────────

function daysAgoStr(iso: string | undefined): string {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function weekRangeLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// ── daysAgoStr ────────────────────────────────────────────────────────────────

describe('daysAgoStr', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns "Never" for undefined', () => {
    expect(daysAgoStr(undefined)).toBe('Never');
  });

  it('returns "Today" for today\'s date', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(daysAgoStr(iso)).toBe('Today');
  });

  it('returns "1d ago" for yesterday', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(daysAgoStr(iso)).toBe('1d ago');
  });

  it('returns "Nd ago" for N days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(daysAgoStr(iso)).toBe('5d ago');
  });
});

// ── weekRangeLabel ────────────────────────────────────────────────────────────

describe('weekRangeLabel', () => {
  it('spans exactly 7 days (Mon → Sun)', () => {
    const label = weekRangeLabel('2026-06-01'); // Monday Jun 1
    expect(label).toBe('Jun 1 – Jun 7');
  });

  it('handles a month boundary correctly', () => {
    const label = weekRangeLabel('2026-05-25'); // Monday May 25
    expect(label).toBe('May 25 – May 31');
  });

  it('handles a month crossover', () => {
    const label = weekRangeLabel('2026-06-29'); // Monday Jun 29
    expect(label).toBe('Jun 29 – Jul 5');
  });

  it('handles a year crossover', () => {
    const label = weekRangeLabel('2025-12-29'); // Monday Dec 29
    expect(label).toBe('Dec 29 – Jan 4');
  });

  it('always produces the "–" separator', () => {
    expect(weekRangeLabel('2026-06-01')).toContain('–');
  });
});
