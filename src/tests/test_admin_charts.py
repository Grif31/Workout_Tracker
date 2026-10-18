"""Geometry for the admin's SVG charts (utils/admin_charts.py), and the
chart data the Coach and AI pages build from it."""
from datetime import date, datetime
from types import SimpleNamespace

import pytest

from utils import admin_charts, admin_stats
from utils.admin_charts import line_chart, nice_scale, stacked_columns


class TestNiceScale:

    @pytest.mark.parametrize('value, expected', [
        (24, (25, 5)), (7, (8, 2)), (100, (100, 20)), (13, (15, 5)), (0.25, (0.25, 0.05)), (0.27, (0.3, 0.1)),
    ])
    def test_round_top_and_step(self, value, expected):
        top, step = nice_scale(value)
        assert (top, step) == pytest.approx(expected)

    def test_every_tick_is_a_round_number(self):
        for value in (3, 18, 19.5, 230, 0.188):
            top, step = nice_scale(value)
            assert top >= value
            assert top / step <= 5
            mantissa = step / 10 ** int(f'{step:e}'.split('e')[1])
            assert round(mantissa, 6) in (1, 2, 5)

    def test_nothing_to_show_still_has_an_axis(self):
        assert nice_scale(0) == (1, 0.25)


def _point(value, label='x'):
    return {'label': label, 'value': value, 'tip': {'rows': []}}


class TestLineChart:

    def test_a_missing_week_breaks_the_line_instead_of_dropping_to_zero(self):
        c = line_chart([_point(50), _point(60), _point(None), _point(70)], y_max=100, fmt='pct')
        assert len(c['paths']) == 2
        assert len(c['dots']) == 3
        assert len(c['hits']) == 4

    def test_values_map_inside_the_plot(self):
        c = line_chart([_point(0), _point(100)], y_max=100)
        assert c['dots'][0]['y'] == pytest.approx(c['plot']['y1'])
        assert c['dots'][1]['y'] == pytest.approx(c['plot']['y0'])

    def test_end_label_is_the_last_real_value(self):
        c = line_chart([_point(40), _point(55), _point(None)], y_max=100, fmt='pct')
        assert c['end_label']['text'] == '55%'

    def test_percent_axis_has_quarter_ticks(self):
        c = line_chart([_point(50)], y_max=100, fmt='pct')
        assert [t['label'] for t in c['ticks']] == ['0%', '25%', '50%', '75%', '100%']

    def test_a_marker_near_the_right_edge_reads_leftward(self):
        pts = [_point(50) for _ in range(12)]
        c = line_chart(pts, y_max=100, markers=[{'index': 1, 'label': 'a'}, {'index': 11, 'label': 'b'}])
        assert [m['anchor'] for m in c['markers']] == ['start', 'end']

    def test_a_marker_outside_the_range_is_dropped(self):
        c = line_chart([_point(1)], markers=[{'index': 5, 'label': 'x'}])
        assert c['markers'] == []

    def test_no_values_at_all(self):
        c = line_chart([_point(None), _point(None)], y_max=100)
        assert c['paths'] == [] and c['end_label'] is None


class TestStackedColumns:

    def test_series_keep_their_slot_whatever_is_present(self):
        cols = [{'label': 'a', 'parts': {'generate': 2}, 'tip': {}},
                {'label': 'b', 'parts': {'insights': 1, 'generate': 1}, 'tip': {}}]
        c = stacked_columns(cols, ['insights', 'weekly-review', 'generate'])
        assert [s['series'] for s in c['bars'][0]['segments']] == [2]
        assert [s['series'] for s in c['bars'][1]['segments']] == [0, 2]

    def test_only_the_top_segment_is_rounded_and_segments_have_a_gap(self):
        c = stacked_columns([{'label': 'a', 'parts': {'x': 4, 'y': 4}, 'tip': {}}], ['x', 'y'])
        lower, upper = c['bars'][0]['segments']
        assert (lower['top'], upper['top']) == (False, True)
        assert upper['y'] + upper['h'] == pytest.approx(lower['y'] - admin_charts.BAR_GAP)

    def test_bars_are_never_wider_than_the_cap(self):
        c = stacked_columns([{'label': 'a', 'parts': {'x': 1}, 'tip': {}}], ['x'])
        assert c['bars'][0]['segments'][0]['w'] <= admin_charts.BAR_MAX

    def test_an_empty_day_draws_nothing_but_keeps_its_hover_area(self):
        c = stacked_columns([{'label': 'a', 'parts': {}, 'tip': {'head': 'a'}}], ['x'])
        assert c['bars'][0]['segments'] == []
        assert c['hits'][0]['tip'] == {'head': 'a'}

    def test_money_ticks(self):
        c = stacked_columns([{'label': 'a', 'parts': {'cost': 0.23}, 'tip': {}}], ['cost'], fmt='money')
        assert [t['label'] for t in c['ticks']] == ['$0.00', '$0.05', '$0.10', '$0.15', '$0.20', '$0.25']


class TestPageCharts:

    def test_weekly_chart_marks_prompt_changes_and_skips_empty_weeks(self):
        weekly = admin_stats.weekly_helpful_rate(
            [SimpleNamespace(helpful=True, created_at=datetime(2026, 10, 13, 9))], date(2026, 10, 18))
        c = admin_stats.coach_weekly_chart(weekly)
        assert len(c['dots']) == 1
        assert [m['label'] for m in c['markers']] == ['2 changes']
        tip = c['hits'][-1]['tip']
        assert tip['head'] == 'Week of 10/12/2026'
        assert ['100%', 'helpful', 'key-0'] in tip['rows']

    def test_ai_charts_are_oldest_first_with_cost_on_its_own_chart(self):
        by_day = [
            {'day': date(2026, 10, 18), 'calls': 2, 'failures': 1, 'cost': 0.01,
             'by_endpoint': {'insights': 1, 'generate': 1}},
            {'day': date(2026, 10, 17), 'calls': 0, 'failures': 0, 'cost': 0.0, 'by_endpoint': {}},
        ]
        calls, cost = admin_stats.ai_daily_charts(by_day)
        assert [h['tip']['head'] for h in calls['hits']] == ['Sat 10/17', 'Sun 10/18']
        assert [s['key'] for s in calls['bars'][1]['segments']] == ['insights', 'generate']
        assert ['1', 'failed', None] in calls['hits'][1]['tip']['rows']
        assert cost['ticks'][-1]['label'].startswith('$')
