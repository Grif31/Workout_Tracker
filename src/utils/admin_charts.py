"""Geometry for the admin's server-rendered SVG charts. Each function returns
plain numbers and strings; templates/admin/_charts.html draws them. Kept in
Python so the layout is testable and the pages need no chart library."""
import math

# About the width a chart card renders at on a desktop, so its text draws at
# the size it's set in rather than scaled up or down
WIDTH = 960
PAD_LEFT, PAD_RIGHT, PAD_TOP, PAD_BOTTOM = 44, 16, 28, 30
BAR_MAX = 24        # bars never thicker than this; the rest of the band is air
BAR_GAP = 2         # surface gap between stacked segments
CORNER = 4          # rounded data-end


def nice_scale(value, max_ticks=5):
    """(top, step) for an axis covering 0..value: step is 1, 2 or 5 x 10^n and
    there are at most max_ticks steps, so every tick is a round number."""
    if value <= 0:
        return 1, 0.25
    raw = value / max_ticks
    exp = 10 ** math.floor(math.log10(raw))
    step = next(m * exp for m in (1, 2, 5, 10) if m * exp >= raw)
    return round(step * math.ceil(value / step - 1e-9), 10), step


def nice_max(value):
    return nice_scale(value)[0]


def _ticks(y_max, step=None):
    step = step or y_max / 4
    n = int(round(y_max / step))
    return [step * i for i in range(n + 1)]


def _fmt(v, fmt):
    if fmt == 'pct':
        return f'{v:.0f}%'
    if fmt == 'money':
        return f'${v:.2f}'
    if v >= 1000:
        return f'{v / 1000:.1f}K'.replace('.0K', 'K')
    return f'{v:g}'


def _plot(height):
    return {'x0': PAD_LEFT, 'x1': WIDTH - PAD_RIGHT, 'y0': PAD_TOP, 'y1': height - PAD_BOTTOM}


def _y(plot, value, y_max):
    return plot['y1'] - (plot['y1'] - plot['y0']) * (value / y_max if y_max else 0)


def _x_labels(n, every):
    """Indexes to label on the x axis: every `every`th, always the last."""
    picks = set(range(n - 1, -1, -every))
    return sorted(picks)


def line_chart(points, *, y_max=None, fmt='num', height=220, markers=(), label_every=1):
    """points: [{'label', 'value' (None = no data), 'tip': [lines]}].
    markers: [{'index', 'label'}] drawn as labelled vertical rules.
    A None value breaks the line rather than dropping to zero."""
    plot = _plot(height)
    n = len(points)
    values = [p['value'] for p in points if p['value'] is not None]
    if y_max:
        step = y_max / 4
    else:
        y_max, step = nice_scale(max(values) if values else 1)
    band = (plot['x1'] - plot['x0']) / max(n, 1)
    xs = [plot['x0'] + band * (i + 0.5) for i in range(n)]

    segments, current = [], []
    dots = []
    for i, p in enumerate(points):
        if p['value'] is None:
            if current:
                segments.append(current)
            current = []
            continue
        y = _y(plot, p['value'], y_max)
        current.append((xs[i], y))
        dots.append({'x': xs[i], 'y': y})
    if current:
        segments.append(current)
    paths = [' '.join(('M' if j == 0 else 'L') + f'{x:.1f},{y:.1f}' for j, (x, y) in enumerate(seg))
             for seg in segments]

    last = next((d for d in reversed(dots)), None)
    last_point = next((p for p in reversed(points) if p['value'] is not None), None)
    return {
        'width': WIDTH, 'height': height, 'plot': plot,
        'ticks': [{'y': _y(plot, t, y_max), 'label': _fmt(t, fmt)} for t in _ticks(y_max, step)],
        'x_labels': [{'x': xs[i], 'label': points[i]['label']} for i in _x_labels(n, label_every)],
        'paths': paths,
        'dots': dots,
        'end_label': ({'x': last['x'], 'y': last['y'], 'text': _fmt(last_point['value'], fmt)} if last else None),
        # A label near the right edge reads leftward from its line, so it isn't cut off
        'markers': [{'x': xs[m['index']], 'label': m['label'],
                     'anchor': 'end' if xs[m['index']] > plot['x0'] + 0.75 * (plot['x1'] - plot['x0']) else 'start'}
                    for m in markers if 0 <= m['index'] < n],
        'hits': [{'x': plot['x0'] + band * i, 'w': band, 'tip': p['tip']} for i, p in enumerate(points)],
    }


def stacked_columns(columns, series, *, fmt='num', height=220, label_every=1):
    """columns: [{'label', 'parts': {series_key: value}, 'tip': [lines]}].
    series: [series_key, ...] in fixed order, bottom first, so a key keeps its
    color whatever is present. Each segment gets a 2px surface gap; the top
    one carries the rounded end."""
    plot = _plot(height)
    n = len(columns)
    totals = [sum(c['parts'].get(s, 0) for s in series) for c in columns]
    y_max, step = nice_scale(max(totals) if totals and max(totals) > 0 else 1)
    band = (plot['x1'] - plot['x0']) / max(n, 1)
    width = min(BAR_MAX, band * 0.7)
    bars = []
    for i, c in enumerate(columns):
        x = plot['x0'] + band * i + (band - width) / 2
        base = plot['y1']
        stack = [(s, c['parts'].get(s, 0)) for s in series if c['parts'].get(s, 0) > 0]
        segs = []
        for j, (key, value) in enumerate(stack):
            h = (plot['y1'] - plot['y0']) * value / y_max
            top = base - h
            gap = BAR_GAP if j > 0 else 0
            seg_h = max(h - gap, 0.5)
            segs.append({'series': series.index(key), 'key': key, 'x': x, 'y': top, 'w': width,
                         'h': seg_h, 'top': j == len(stack) - 1, 'd': _column_path(x, top, width, seg_h,
                                                                                   j == len(stack) - 1)})
            base = top
        bars.append({'segments': segs})
    return {
        'width': WIDTH, 'height': height, 'plot': plot,
        'ticks': [{'y': _y(plot, t, y_max), 'label': _fmt(t, fmt)} for t in _ticks(y_max, step)],
        'x_labels': [{'x': plot['x0'] + band * (i + 0.5), 'label': columns[i]['label']}
                     for i in _x_labels(n, label_every)],
        'bars': bars,
        'hits': [{'x': plot['x0'] + band * i, 'w': band, 'tip': c['tip']} for i, c in enumerate(columns)],
    }


def _column_path(x, y, w, h, rounded):
    """A column, square at the baseline; the top segment's data-end rounded."""
    r = min(CORNER, w / 2, h) if rounded else 0
    return (f'M{x:.1f},{y + h:.1f} L{x:.1f},{y + r:.1f} Q{x:.1f},{y:.1f} {x + r:.1f},{y:.1f} '
            f'L{x + w - r:.1f},{y:.1f} Q{x + w:.1f},{y:.1f} {x + w:.1f},{y + r:.1f} '
            f'L{x + w:.1f},{y + h:.1f} Z')
