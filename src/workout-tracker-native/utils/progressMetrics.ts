export type ChartMetric = 'volume' | 'sets' | 'workouts' | 'distance';

/** `metrics_logged` from GET /api/stats/progress: what the user has ever logged. */
export type MetricsLogged = Record<ChartMetric, boolean>;

export const CHART_METRICS: readonly ChartMetric[] = ['volume', 'sets', 'workouts', 'distance'];

/**
 * The chart tabs to show. A metric gets a tab only once the user has logged
 * something it can chart, judged across all time rather than the selected
 * range, so a lift from two years ago keeps Volume on the 1Y view.
 *
 * `null` means the backend predates `metrics_logged`. That falls back to the
 * three tabs the chart always had rather than to "nothing logged", which
 * would tell a user with years of history to start logging.
 */
export function visibleChartMetrics(logged: MetricsLogged | null | undefined): ChartMetric[] {
  if (!logged) return ['volume', 'sets', 'workouts'];
  return CHART_METRICS.filter(m => logged[m]);
}

/** True only when the backend has confirmed the user has no workouts at all. */
export function hasLoggedNothing(logged: MetricsLogged | null | undefined): boolean {
  return logged != null && !logged.workouts;
}
