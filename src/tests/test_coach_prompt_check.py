"""scripts/coach_prompt_check.py without the API: its fixtures build and
reach the prompt, and its scoring counts what the model got wrong."""
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

import coach_prompt_check as check  # noqa: E402


def test_every_fixture_builds_and_reaches_a_prompt(capsys):
    assert check.main(['--dry-run']) == []
    out = capsys.readouterr().out
    for name in ('new', 'progressing', 'plateaued', 'overreaching', 'cardio_only', 'kg'):
        assert f'{name} ' in out
    # The fixtures with an earlier batch reach the follow-through section
    for name, batch in check.PREVIOUS_BATCHES.items():
        line = next(l for l in out.splitlines() if l.startswith(f'{name} '))
        assert line.endswith(f'{len(batch)} earlier suggestions')


def test_score_counts_follow_ups():
    ctx = {**_ctx(), 'previous_insights': [{'id': 7, 'type': 'rest', 'title': 'Rest', 'body': '.', 'days_ago': 7}]}
    r = check.score([{**_insight('Rested'), 'type': 'follow_up', 'follows': 1}], ctx)
    assert r['follow_ups'] == 1 and r['insights'][0]['follows_id'] == 7


def _ctx():
    return {
        'recent_pr_facts': [{'exercise': 'Bench Press', 'metric': 'Max Weight', 'before': 225, 'after': 235}],
        'stalled_lifts': [], 'top_prs': [], 'cardio_prs': [],
        'muscle_sets_week': {'Chest': 10}, 'now': datetime.now(),
    }


def _insight(title, body='Do 3 sets of 5.', type_='suggestion', exercise=None, before=None, after=None):
    return {'type': type_, 'title': title, 'body': body, 'priority': 'medium',
            'evidence': {'exercise': exercise, 'metric': None, 'before': before, 'after': after, 'window_days': 7}}


def test_score_counts_ungrounded_duplicates_and_banned_copy():
    raw = [
        _insight('Bench Up', 'Your bench rose from 225 to 235 lbs!', 'achievement', 'Bench Press', 225, 235),
        _insight('Squat Up', 'Squat rose — nice.', 'frequency', 'Squat', 300, 310),
        _insight('Bench Wrong', 'From 200 to 300.', 'deload', 'Bench Press', 200, 300),
        _insight('Second Achievement', type_='achievement'),
        _insight('Chest Volume'),
    ]
    r = check.score(raw, _ctx())
    assert (r['returned'], r['ungrounded'], r['other_dropped'], r['kept']) == (5, 2, 1, 2)
    assert set(r['ungrounded_titles']) == {'Squat Up', 'Bench Wrong'}
    assert r['banned'] == {'em dash': 1, 'exclamation mark': 1}
    # What users see has the banned copy patched out
    assert all('!' not in i['body'] and '—' not in i['body'] for i in r['insights'])


def test_score_flags_insights_over_the_length_limits():
    r = check.score([_insight('T' * (check.TITLE_MAX + 1)), _insight('Fine', 'x' * (check.BODY_MAX + 1), 'rest')], _ctx())
    assert r['too_long'] == 2
