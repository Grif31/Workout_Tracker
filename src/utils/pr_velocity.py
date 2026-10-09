"""How fast a lift's estimated 1RM is climbing, and whether it has stopped.

Pure functions over (date, estimated 1RM) points, one per workout, so the route
only has to fetch the points. Beginners gain 5-10% a month, intermediates 2-5%,
advanced lifters under 2%; a gain under 1% a month over 8 weeks is a plateau.
"""
from datetime import date

DAYS_PER_MONTH = 30.44
PLATEAU_WINDOW_DAYS = 56
PLATEAU_PCT_PER_MONTH = 1.0
MIN_SESSIONS = 4


def _slope_per_day(points):
    """Least-squares slope of value against day, or None with no spread in time."""
    first = points[0][0]
    xs = [(d - first).days for d, _ in points]
    ys = [v for _, v in points]
    n = len(points)
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom == 0:
        return None, mean_y
    return sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom, mean_y


def compute_velocity(points: list[tuple[date, float]], today: date) -> dict:
    """points: (workout date, best estimated 1RM that day), any order.

    status:
      gaining      climbing at 1% a month or more
      plateau      flat (within 1% a month) over the last 8 weeks, which the data covers
      declining    falling at 1% a month or more
      insufficient too few sessions, too short a span, or flat over less than 8 weeks
                   (a plateau can't be claimed before the data spans one)
    """
    points = sorted(points)
    base = {'sessions': len(points), 'current_e1rm': round(points[-1][1], 1) if points else None}
    insufficient = {**base, 'status': 'insufficient', 'rate_per_month': None, 'rate_pct_per_month': None}
    if len(points) < MIN_SESSIONS or (points[-1][0] - points[0][0]).days < 14:
        return insufficient

    covers_window = (today - points[0][0]).days >= PLATEAU_WINDOW_DAYS
    recent = [p for p in points if (today - p[0]).days <= PLATEAU_WINDOW_DAYS]
    # Judge by the last 8 weeks once there are enough of them, else by everything
    window = recent if covers_window and len(recent) >= MIN_SESSIONS else points
    slope, mean_y = _slope_per_day(window)
    if slope is None or mean_y <= 0:
        return insufficient

    rate = slope * DAYS_PER_MONTH
    pct = rate / mean_y * 100
    if pct >= PLATEAU_PCT_PER_MONTH:
        status = 'gaining'
    elif pct <= -PLATEAU_PCT_PER_MONTH:
        status = 'declining'
    elif window is recent:
        status = 'plateau'
    else:
        return insufficient
    return {**base, 'status': status, 'rate_per_month': round(rate, 1), 'rate_pct_per_month': round(pct, 1)}
