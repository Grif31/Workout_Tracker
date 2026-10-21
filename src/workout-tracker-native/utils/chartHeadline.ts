import type { ChartMetric } from './progressMetrics';
import { formatDistanceValue } from './weeklyDistanceGoal';

export type ChartHeadline = {
  value: string;
  unit: string;
  when: string;
  /** Up or down against the periods before it; null for the period still in progress. */
  change: { pct: number; text: string } | null;
  /** The average of those earlier periods, shown instead of a change for the current one. */
  average: string | null;
};

const COMPARE_PERIODS = 4;

export function formatMetricValue(metric: ChartMetric, value: number): string {
  if (metric === 'distance') return formatDistanceValue(value);
  return Math.round(value).toLocaleString('en-US');
}

/**
 * The number above the progress chart: the picked bar, or the newest one.
 * The newest bucket is the week or month still in progress, so it gets the
 * earlier average beside it rather than a percentage, which would read as a
 * drop every Monday. A finished period gets its change against the average
 * of up to four periods before it.
 */
export function chartHeadline(args: {
  metric: ChartMetric;
  values: number[];
  /** The periods before the first bar, oldest first, so the oldest bars have something to compare with. */
  previous?: number[];
  labels: string[];
  index: number;
  monthly: boolean;
  weightUnit: string;
  distanceUnit: string;
}): ChartHeadline {
  const { metric, values, labels, index, monthly } = args;
  const v = values[index] ?? 0;
  const unit = metric === 'volume' ? args.weightUnit
    : metric === 'distance' ? args.distanceUnit
    : metric === 'sets' ? (v === 1 ? 'set' : 'sets')
    : (v === 1 ? 'workout' : 'workouts');
  const period = monthly ? 'month' : 'week';
  const isCurrent = index === values.length - 1;
  const when = isCurrent
    ? `this ${period} so far`
    : monthly ? `in ${labels[index]}` : `week of ${labels[index]}`;

  const series = [...(args.previous ?? []), ...values];
  const at = series.length - values.length + index;
  const before = series.slice(Math.max(0, at - COMPARE_PERIODS), at);
  const avg = before.length >= 2 ? before.reduce((a, b) => a + b, 0) / before.length : null;
  const n = before.length;
  let change: ChartHeadline['change'] = null;
  let average: string | null = null;
  if (avg != null && avg > 0) {
    if (isCurrent) {
      average = `${n}-${period} average ${formatMetricValue(metric, avg)}`;
    } else {
      const pct = Math.round((v - avg) / avg * 100);
      change = {
        pct,
        text: pct === 0
          ? `Level with the ${n} ${period}s before`
          : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs the ${n} ${period}s before`,
      };
    }
  }
  return { value: formatMetricValue(metric, v), unit, when, change, average };
}
