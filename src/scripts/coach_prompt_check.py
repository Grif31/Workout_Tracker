"""Run before any change to the insights prompt or model (TODO.md section 23).

Builds a handful of fixture users in an in-memory database, logging their
workouts through the real POST /api/workouts so PRs, stalls and weekly volume
come out the way production computes them. Then each one goes through the
same path as POST /api/ai/insights: _build_insights_context, the prompt, the
model (_request_insights) and _verify_insights. Reports, per user and in
total, how many insights came back, how many _is_grounded dropped, their
length, and copy the brand voice bans (em dashes, exclamation marks), which
_brand_copy patches over in production but which show the prompt slipping.

Calls the Anthropic API, so it is not part of the pytest suite and costs a
few cents a run. Needs ANTHROPIC_API_KEY, except with --dry-run.

    ./venv/Scripts/python.exe scripts/coach_prompt_check.py
    ./venv/Scripts/python.exe scripts/coach_prompt_check.py --model claude-sonnet-5-5 --effort medium --runs 3
    ./venv/Scripts/python.exe scripts/coach_prompt_check.py --model claude-haiku-4-5-20251001 --effort none
    ./venv/Scripts/python.exe scripts/coach_prompt_check.py --dry-run --show-prompt plateaued
    ./venv/Scripts/python.exe scripts/coach_prompt_check.py --json results.json
"""
import argparse
import json
import os
import sys
import time
from datetime import date, timedelta
from statistics import mean

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app  # noqa: E402
from models import db, ExerciseTemplate, ExerciseMuscleMapping, User  # noqa: E402
import seed  # noqa: E402
from routes import ai_routes  # noqa: E402
from utils.ai_client import estimate_cost  # noqa: E402

BANNED = {'em dash': '—', 'exclamation mark': '!'}
TITLE_MAX = 60
BODY_MAX = 300


# ── Fixtures ──────────────────────────────────────────────────

def _strength(day, name, lifts):
    """lifts: [(exercise, equipment, [(reps, weight, rpe), ...])]"""
    return {'date': day, 'workoutName': name, 'duration': 60, 'exercises': [
        {'name': ex, 'equipment': equip, 'exercise_type': 'strength',
         'sets': [{'reps': r, 'weight': w, 'rpe': rpe, 'set_type': 'N'} for r, w, rpe in sets]}
        for ex, equip, sets in lifts
    ]}


def _run(day, km, minutes):
    return {'date': day, 'workoutName': 'Run', 'duration': round(minutes), 'exercises': [
        {'name': 'Running', 'equipment': None, 'exercise_type': 'cardio',
         'sets': [{'cardio_duration': minutes, 'distance': km, 'distance_unit': 'km',
                   'intensity': round(minutes / km, 2)}]}
    ]}


def _sets(n, reps, weight, rpe=8):
    return [(reps, weight, rpe)] * n


def _ppl_weeks(today, weeks, bench, squat, row, step_weeks, rpe=8, chest_sets=4):
    """Push / pull / legs three days a week. bench/squat/row are (start, weekly
    gain); the gain stops after step_weeks, which makes a plateau."""
    out = []
    for w in range(weeks):
        k = min(w, step_weeks)
        monday = today - timedelta(weeks=weeks - 1 - w, days=today.weekday())
        b, s, r = bench[0] + bench[1] * k, squat[0] + squat[1] * k, row[0] + row[1] * k
        for offset, workout in (
            (0, _strength(monday, 'Push Day', [('Bench Press', 'Barbell', _sets(chest_sets, 5, b, rpe)),
                                               ('Overhead Press', 'Barbell', _sets(3, 8, round(b * 0.6), rpe))])),
            (2, _strength(monday + timedelta(days=2), 'Pull Day', [('Bent Over Row', 'Barbell', _sets(4, 8, r, rpe)),
                                                                   ('Lat Pulldown', 'Cable', _sets(3, 10, round(r * 0.8), rpe))])),
            (4, _strength(monday + timedelta(days=4), 'Leg Day', [('Squat', 'Barbell', _sets(4, 5, s, rpe)),
                                                                  ('Romanian Deadlift', 'Barbell', _sets(3, 8, round(s * 0.7), rpe))])),
        ):
            if monday + timedelta(days=offset) <= today:
                out.append(workout)
    return out


def fixtures(today):
    """name -> (profile, coach settings, workouts). Weights are in the user's unit."""
    overreaching = _ppl_weeks(today, 6, (155, 5), (225, 5), (135, 5), 6)
    last_monday = today - timedelta(days=today.weekday())
    for d in range(0, min(today.weekday(), 5) + 1):
        overreaching.append(_strength(last_monday + timedelta(days=d), 'Chest Volume', [
            ('Bench Press', 'Barbell', _sets(8, 8, 165, 10)),
            ('Incline Bench Press', 'Dumbbell', _sets(6, 10, 60, 10)),
        ]))
    return {
        'new': (
            {'bodyweight': 165, 'gender': 'female'}, {'experience': 'beginner', 'goal': 'general_fitness'},
            [_strength(today - timedelta(days=d), 'Full Body', [('Squat', 'Barbell', _sets(3, 8, 95, 7)),
                                                                ('Bench Press', 'Barbell', _sets(3, 8, 65, 7)),
                                                                ('Lat Pulldown', 'Cable', _sets(3, 10, 70, 7))])
             for d in (5, 2)],
        ),
        'progressing': (
            {'bodyweight': 180, 'gender': 'male'}, {'experience': 'intermediate', 'goal': 'strength'},
            _ppl_weeks(today, 8, (185, 5), (255, 10), (155, 5), 8),
        ),
        'plateaued': (
            {'bodyweight': 190, 'gender': 'male'}, {'experience': 'intermediate', 'goal': 'strength'},
            _ppl_weeks(today, 8, (185, 5), (265, 10), (155, 5), 3, rpe=9),
        ),
        'overreaching': (
            {'bodyweight': 175, 'gender': 'male'}, {'experience': 'intermediate', 'goal': 'hypertrophy'},
            overreaching,
        ),
        'cardio_only': (
            {'bodyweight': 140, 'gender': 'female'}, {'experience': 'intermediate', 'goal': 'endurance'},
            [_run(today - timedelta(days=d), km, km * pace)
             for i, d in enumerate(range(41, -1, -3))
             for km, pace in [((5, 8, 6)[i % 3], 6.0 - 0.03 * i)]],
        ),
        'kg': (
            {'bodyweight': 82, 'gender': 'male', 'weight_unit': 'kg'}, {'experience': 'intermediate', 'goal': 'strength'},
            _ppl_weeks(today, 6, (80, 2.5), (110, 5), (70, 2.5), 6),
        ),
    }


def _seed_library():
    for name, muscles, equipment in seed.EXERCISES:
        t = ExerciseTemplate(name=name, equipment=equipment, exercise_type='strength')
        db.session.add(t)
        db.session.flush()
        for j, mg in enumerate(p.strip() for p in muscles.split(',')):
            db.session.add(ExerciseMuscleMapping(exercise_template_id=t.id, muscle_group=mg, is_primary=j == 0))
    for name, equipment in seed.CARDIO_EXERCISES:
        t = ExerciseTemplate(name=name, equipment=equipment, exercise_type='cardio')
        db.session.add(t)
        db.session.flush()
        db.session.add(ExerciseMuscleMapping(exercise_template_id=t.id, muscle_group='Cardio', is_primary=True))
    db.session.commit()


def _template_id(name, equipment, exercise_type):
    q = ExerciseTemplate.query.filter_by(name=name, user_id=None, exercise_type=exercise_type)
    t = q.filter_by(equipment=equipment).first() or q.first()
    if not t:
        raise SystemExit(f'Fixture names an exercise the library lacks: {name} ({equipment})')
    return t.id


def build_users(app, today):
    """Signs each fixture up and logs its workouts. Returns name -> (user_id, coach settings)."""
    client = app.test_client()
    users = {}
    for name, (profile, coach, workouts) in fixtures(today).items():
        res = client.post('/api/signup', json={'username': f'fx_{name}', 'email': f'{name}@fixture.test',
                                               'password': 'fixture-password'})
        assert res.status_code == 201, res.get_json()
        token = client.post('/api/login', json={'email': f'{name}@fixture.test', 'password': 'fixture-password'}
                            ).get_json()['access_token']
        headers = {'Authorization': f'Bearer {token}', 'X-Local-Date': today.isoformat()}
        res = client.patch('/api/me', json=profile, headers=headers)
        assert res.status_code == 200, res.get_json()
        for w in sorted(workouts, key=lambda w: w['date']):
            body = {**w, 'date': w['date'].isoformat(), 'exercises': [
                {**ex, 'exercise_template_id': _template_id(ex['name'], ex['equipment'], ex['exercise_type'])}
                for ex in w['exercises']
            ]}
            res = client.post('/api/workouts', json=body, headers=headers)
            assert res.status_code == 201, (name, res.get_json())
        users[name] = (User.query.filter_by(username=f'fx_{name}').one().id, coach)
    return users


# ── Scoring ───────────────────────────────────────────────────

def score(raw_insights, ctx):
    """What one model answer did: counts, why insights were dropped, length
    and banned copy. raw_insights is the model's JSON before _brand_copy."""
    branded = [{**i, 'title': ai_routes._brand_copy(i.get('title'), heading=True),
                'body': ai_routes._brand_copy(i.get('body'))} for i in raw_insights]
    known = ai_routes._known_subjects(ctx)
    ungrounded = [i for i in branded if not ai_routes._is_grounded(i, ctx, known)]
    kept = ai_routes._verify_insights(branded, ctx)
    banned = {label: sum((i.get('title') or '').count(ch) + (i.get('body') or '').count(ch) for i in raw_insights)
              for label, ch in BANNED.items()}
    return {
        'returned': len(raw_insights),
        'ungrounded': len(ungrounded),
        'ungrounded_titles': [i.get('title') for i in ungrounded],
        'ungrounded_evidence': [i.get('evidence') for i in ungrounded],
        'other_dropped': len(branded) - len(ungrounded) - len(kept),
        'kept': len(kept),
        'types': [i.get('type') for i in kept],
        'title_len': [len(i.get('title') or '') for i in kept],
        'body_len': [len(i.get('body') or '') for i in kept],
        'too_long': sum(1 for i in kept if len(i.get('title') or '') > TITLE_MAX or len(i.get('body') or '') > BODY_MAX),
        'banned': banned,
        'insights': kept,
    }


# ── Run ───────────────────────────────────────────────────────

def run(args):
    app = create_app(test_config={'TESTING': True, 'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
                                  'JWT_SECRET_KEY': 'coach-prompt-check', 'RATELIMIT_ENABLED': False})
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key and not args.dry_run:
        raise SystemExit('Set ANTHROPIC_API_KEY, or pass --dry-run to build the prompts without calling the model.')
    today = date.today()
    results = []
    with app.app_context():
        db.create_all()
        _seed_library()
        users = build_users(app, today)
        for name, (user_id, coach) in users.items():
            if args.only and name not in args.only:
                continue
            ctx = ai_routes._build_insights_context(user_id, **coach)
            ctx['insight_feedback'] = []
            prompt = ai_routes._build_insights_prompt(ctx)
            if name in (args.show_prompt or []):
                print(f'\n===== prompt: {name} =====\n{prompt}\n')
            if args.dry_run:
                print(f'{name:<13} prompt {len(prompt):>6} chars, {len(ai_routes._known_subjects(ctx))} known subjects')
                continue
            for run_no in range(args.runs):
                start = time.monotonic()
                try:
                    msg, _ = ai_routes._request_insights(ctx, None, api_key, model=args.model, effort=args.effort)
                    raw = ai_routes._parse_ai_json(ai_routes._response_text(msg)).get('insights', [])
                except Exception as exc:  # a failed call is a result, not a crash
                    results.append({'fixture': name, 'run': run_no, 'error': f'{type(exc).__name__}: {exc}'[:200]})
                    print(f'{name:<13} run {run_no + 1}: FAILED {type(exc).__name__}')
                    continue
                u = msg.usage
                r = {'fixture': name, 'run': run_no, 'seconds': round(time.monotonic() - start, 1),
                     'cost': estimate_cost(args.model, u.input_tokens, u.output_tokens,
                                           getattr(u, 'cache_read_input_tokens', 0),
                                           getattr(u, 'cache_creation_input_tokens', 0)),
                     **score(raw, ctx)}
                results.append(r)
                _print_result(r, args.show)
    if not args.dry_run:
        _print_summary(results, args.model)
    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump({'model': args.model, 'date': today.isoformat(), 'results': results}, f, indent=2, default=str)
        print(f'\nWrote {args.json}')
    return results


def _print_result(r, show):
    banned = ', '.join(f'{n} {label}' for label, n in r['banned'].items() if n) or 'none'
    print(f"{r['fixture']:<13} run {r['run'] + 1}: {r['kept']}/{r['returned']} kept "
          f"({r['ungrounded']} ungrounded, {r['other_dropped']} duplicate type or over {ai_routes.MAX_INSIGHTS}), "
          f"banned copy: {banned}, {r['seconds']}s, ${r['cost']:.4f}")
    for title, evidence in zip(r['ungrounded_titles'], r['ungrounded_evidence']):
        print(f'    dropped: {title} | {evidence}')
    if show:
        for i in r['insights']:
            print(f"    [{i.get('type')}/{i.get('priority')}] {i.get('title')}\n        {i.get('body')}")


def _print_summary(results, model):
    ok = [r for r in results if 'error' not in r]
    print(f'\n== {model}: {len(ok)} answers, {len(results) - len(ok)} failed ==')
    if not ok:
        return
    returned = sum(r['returned'] for r in ok)
    print(f"Insights kept: {sum(r['kept'] for r in ok)} of {returned} returned "
          f"({sum(r['ungrounded'] for r in ok)} ungrounded, {sum(r['other_dropped'] for r in ok)} other drops)")
    bodies = [n for r in ok for n in r['body_len']]
    titles = [n for r in ok for n in r['title_len']]
    if bodies:
        print(f'Length: title avg {mean(titles):.0f} (max {max(titles)}), body avg {mean(bodies):.0f} (max {max(bodies)}); '
              f"{sum(r['too_long'] for r in ok)} over {TITLE_MAX}/{BODY_MAX} chars")
    for label in BANNED:
        print(f"{label.capitalize()}s in raw output: {sum(r['banned'][label] for r in ok)}")
    print(f"Time: avg {mean(r['seconds'] for r in ok):.1f}s; cost: ${sum(r['cost'] for r in ok):.4f} total")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--model', default=ai_routes.COACH_MODEL, help='Model id (default: what production uses)')
    parser.add_argument('--effort', default=ai_routes.INSIGHTS_EFFORT,
                        help='output_config.effort (default: what production uses). Pass "none" for a model '
                             'without effort levels, such as claude-haiku-4-5')
    parser.add_argument('--runs', type=int, default=1, help='Answers per fixture; the model varies, so 3+ to compare')
    parser.add_argument('--only', nargs='+', help='Fixture names to run (default: all)')
    parser.add_argument('--show', action='store_true', help='Print the insights that were kept')
    parser.add_argument('--show-prompt', nargs='+', metavar='FIXTURE', help='Print the prompt for these fixtures')
    parser.add_argument('--dry-run', action='store_true', help='Build fixtures and prompts only; no API call')
    parser.add_argument('--json', help='Also write every result to this file, to diff two models or prompts')
    args = parser.parse_args(argv)
    if args.effort == 'none':
        args.effort = None
    return run(args)


if __name__ == '__main__':
    main()
