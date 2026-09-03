"""Pace-percentile standards for the Endurance Score (running only in v1).

Mirrors utils/strength_standards.py's shape — lookup tables, an interpolating
percentile function, an age factor, and a tiered overall aggregator — with one
key inversion: LOWER pace = better, so interpolation walks the breakpoints
downward and the fast end clamps where strength's heavy end does.

Only exercises whose ExerciseTemplate.standards_key == 'Running' feed this
(the two seeded Running templates, pooled — outdoor + treadmill). Other cardio
(cycling, rowing, walking) still logs and earns PRs but has no comparable pace
standards, so it doesn't produce a percentile.
"""

# Milestone tables previously lived in routes/workout_routes.py (which now
# imports them from here). They double as PACE_STANDARDS' distance keys — the
# per-distance dicts below are keyed off these exact floats so the join key
# against PersonalRecord.weight_context can never drift.
CARDIO_DISTANCE_MILESTONES = [
    (0.4,     '400m'),
    (0.8,     '800m'),
    (1.0,     '1K'),
    (1.60934, '1 Mile'),
    (5.0,     '5K'),
    (10.0,    '10K'),
    (21.0975, 'Half Marathon'),
    (42.195,  'Marathon'),
]

CARDIO_DURATION_MILESTONES = [
    (10.0,  '10 min'),
    (20.0,  '20 min'),
    (30.0,  '30 min'),
    (60.0,  '60 min'),
]

DISTANCE_LABELS = dict(CARDIO_DISTANCE_MILESTONES)

_D400, _D800, _D1K, _DMILE, _D5K, _D10K, _DHALF, _DFULL = (
    d for d, _ in CARDIO_DISTANCE_MILESTONES
)

# Core distances measure endurance proper; speed distances play the role
# isolation lifts play for strength — and they're the only tier a sub-5K-only
# runner ever generates data for (best_time PRs only exist for milestones the
# run actually covered), which is why they can't just be dropped.
CORE_DISTANCES  = {_D5K, _D10K, _DHALF, _DFULL}
SPEED_DISTANCES = {_D400, _D800, _D1K, _DMILE}

CORE_WEIGHT  = 0.70
SPEED_WEIGHT = 0.30

# Pace (min/km) at each percentile breakpoint, calibrated against recreational
# race-finisher distributions (sanity anchors, men: sub-20 5K ~= 90th pct,
# sub-3:00 marathon ~= high-90s, median marathon ~4:25; women ~12% slower per
# breakpoint). Percentile = "faster than X% of recreational runners".
# Speed-distance rows assume true all-out efforts — extrapolated times from
# longer runs will rank low against them, which is why the speed tier is
# best-within-tier at 30%, not averaged (see compute_endurance_overall).
PACE_STANDARDS: dict[str, dict[float, dict[int, float]]] = {
    'male': {
        _D400:  {10: 6.50, 25: 5.60, 50: 4.80, 75: 4.10, 90: 3.50, 95: 3.20, 99: 2.80},
        _D800:  {10: 6.80, 25: 5.90, 50: 5.00, 75: 4.30, 90: 3.70, 95: 3.40, 99: 3.00},
        _D1K:   {10: 7.00, 25: 6.00, 50: 5.20, 75: 4.50, 90: 3.90, 95: 3.60, 99: 3.10},
        _DMILE: {10: 7.20, 25: 6.20, 50: 5.40, 75: 4.70, 90: 4.00, 95: 3.70, 99: 3.25},
        _D5K:   {10: 8.00, 25: 6.80, 50: 5.60, 75: 4.80, 90: 4.10, 95: 3.80, 99: 3.40},
        _D10K:  {10: 8.30, 25: 7.00, 50: 5.80, 75: 5.00, 90: 4.40, 95: 4.00, 99: 3.55},
        _DHALF: {10: 8.60, 25: 7.30, 50: 6.00, 75: 5.20, 90: 4.60, 95: 4.25, 99: 3.80},
        _DFULL: {10: 9.20, 25: 7.80, 50: 6.30, 75: 5.50, 90: 4.90, 95: 4.50, 99: 4.00},
    },
    'female': {
        _D400:  {10: 7.30, 25: 6.30, 50: 5.40, 75: 4.60, 90: 3.95, 95: 3.60, 99: 3.15},
        _D800:  {10: 7.60, 25: 6.60, 50: 5.60, 75: 4.85, 90: 4.15, 95: 3.80, 99: 3.35},
        _D1K:   {10: 7.85, 25: 6.70, 50: 5.85, 75: 5.05, 90: 4.40, 95: 4.05, 99: 3.50},
        _DMILE: {10: 8.05, 25: 6.95, 50: 6.05, 75: 5.25, 90: 4.50, 95: 4.15, 99: 3.65},
        _D5K:   {10: 8.95, 25: 7.60, 50: 6.30, 75: 5.40, 90: 4.60, 95: 4.25, 99: 3.80},
        _D10K:  {10: 9.30, 25: 7.85, 50: 6.50, 75: 5.60, 90: 4.95, 95: 4.50, 99: 4.00},
        _DHALF: {10: 9.65, 25: 8.20, 50: 6.70, 75: 5.85, 90: 5.15, 95: 4.75, 99: 4.25},
        _DFULL: {10: 10.30, 25: 8.75, 50: 7.05, 75: 6.15, 90: 5.50, 95: 5.05, 99: 4.50},
    },
}

# WMA running age-grading (inverse of expected decline vs. the open class) —
# deliberately NOT the Masters powerlifting curve in strength_standards
# (running declines differently, steeper past ~60). Same piecewise-linear
# interpolation pattern as _AGE_FACTOR_ANCHORS so no cliff at boundaries.
_ENDURANCE_AGE_ANCHORS: list[tuple[int, float]] = [
    (25, 1.00),
    (35, 1.02),
    (45, 1.09),
    (55, 1.18),
    (65, 1.28),
    (75, 1.47),
]


def endurance_age_factor(age: int) -> float:
    """Pace credit for older runners: divide raw pace by this before lookup."""
    if age <= _ENDURANCE_AGE_ANCHORS[0][0]:
        return _ENDURANCE_AGE_ANCHORS[0][1]
    if age >= _ENDURANCE_AGE_ANCHORS[-1][0]:
        return _ENDURANCE_AGE_ANCHORS[-1][1]
    for (age_lo, f_lo), (age_hi, f_hi) in zip(_ENDURANCE_AGE_ANCHORS, _ENDURANCE_AGE_ANCHORS[1:]):
        if age_lo <= age <= age_hi:
            t = (age - age_lo) / (age_hi - age_lo)
            return f_lo + t * (f_hi - f_lo)
    return _ENDURANCE_AGE_ANCHORS[-1][1]


def compute_pace_percentile(distance_km: float, gender: str, pace: float) -> float | None:
    """Percentile for a pace (min/km) at one milestone distance.

    Inverted axis vs. strength's compute_percentile: lower pace is better, so
    the walk goes from the slow (10th) breakpoint toward the fast (99th) one.
    Same clamping rules: faster than the 99th breakpoint caps at that
    percentile; slower than the 10th extrapolates but floors at 1.0.
    """
    standards = PACE_STANDARDS.get(gender, {}).get(distance_km)
    if not standards or pace <= 0:
        return None
    points = sorted(standards.items())
    pcts  = [p for p, _ in points]
    paces = [v for _, v in points]  # descending: slower pace at low pct
    if pace >= paces[0]:
        # Slower than the 10th-pct breakpoint — 0% is a display artifact, not
        # a meaningful rank (mirrors the strength-side floor)
        return max(1.0, (paces[0] / pace) * pcts[0])
    if pace <= paces[-1]:
        return min(99.9, float(pcts[-1]))
    for i in range(len(paces) - 1):
        if paces[i] >= pace >= paces[i + 1]:
            t = (paces[i] - pace) / (paces[i] - paces[i + 1])
            return pcts[i] + t * (pcts[i + 1] - pcts[i])
    return None


def compute_endurance_overall(percentiles_by_distance: dict[float, float]) -> float | None:
    """Overall endurance percentile from per-distance percentiles.

    Best-within-tier, not mean: every stored short-distance best_time is
    linearly-scaled average pace from a longer run (systematically slower than
    a true effort), and all of a runner's per-distance times derive from the
    same runs — a mean would double-count that extrapolation penalty. A tier
    with no data drops out and the weights renormalize (a sub-5K-only runner
    is scored 100% on the speed tier rather than locked at zero).
    """
    core  = [v for d, v in percentiles_by_distance.items() if d in CORE_DISTANCES]
    speed = [v for d, v in percentiles_by_distance.items() if d in SPEED_DISTANCES]
    parts = []
    if core:
        parts.append((CORE_WEIGHT, max(core)))
    if speed:
        parts.append((SPEED_WEIGHT, max(speed)))
    if not parts:
        return None
    total_weight = sum(w for w, _ in parts)
    return sum(w * v for w, v in parts) / total_weight
