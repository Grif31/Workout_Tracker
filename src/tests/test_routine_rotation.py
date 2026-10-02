"""Routine rotation (Coach's "next up") and cardio totals in Workout.to_dict.

The rotation mirrors routineRotation in the app's utils/routineRotation.ts,
which has the same cases in __tests__/routineRotation.test.ts.
"""
from datetime import datetime, timedelta

import pytest

from models import db, Routine, RoutineDay, WorkoutTemplate, Workout, Exercise, Set
from routes.ai_routes import _routine_rotation_context


@pytest.fixture
def uid(registered_user):
    return registered_user['user']['id']


def _today():
    return datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)


def _routine(user_id, labels):
    template = WorkoutTemplate(user_id=user_id, name='T')
    routine = Routine(user_id=user_id, name='Split')
    db.session.add_all([template, routine])
    db.session.flush()
    for order, label in enumerate(labels):
        db.session.add(RoutineDay(routine_id=routine.id, workout_template_id=template.id, day_order=order, label=label))
    db.session.commit()
    return routine.id


def _log(user_id, name, days_ago):
    db.session.add(Workout(user_id=user_id, name=name, date=_today() - timedelta(days=days_ago)))
    db.session.commit()


def _context(app, user_id, routine_id):
    with app.test_request_context():
        return _routine_rotation_context(user_id, routine_id)


def test_no_history_gives_no_context(app, uid):
    rid = _routine(uid, ['Legs', 'Push', 'Pull'])
    assert _context(app, uid, rid) is None


def test_continues_across_weeks(app, uid):
    rid = _routine(uid, ['Legs', 'Push', 'Pull'])
    _log(uid, 'Legs', 8)
    _log(uid, 'Push', 7)
    ctx = _context(app, uid, rid)
    assert ctx['next_day'] == 'Pull'
    assert ctx['last_day'] == 'Push'
    assert ctx['restarted'] is False


def test_repeated_labels_advance_one_copy_at_a_time(app, uid):
    rid = _routine(uid, ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'])
    for days_ago, name in [(4, 'Push'), (3, 'Pull'), (2, 'Legs'), (1, 'push ')]:
        _log(uid, name, days_ago)
    ctx = _context(app, uid, rid)
    # The second Push was day 4, so the second Pull is next
    assert ctx['next_order'] == 5
    assert ctx['next_day'] == 'Pull'


def test_same_day_workouts_order_by_id(app, uid):
    rid = _routine(uid, ['Legs', 'Push', 'Pull'])
    _log(uid, 'Legs', 1)
    _log(uid, 'Push', 1)
    assert _context(app, uid, rid)['next_day'] == 'Pull'


def test_restarts_after_two_weeks_off(app, uid):
    rid = _routine(uid, ['Legs', 'Push', 'Pull'])
    _log(uid, 'Legs', 15)
    _log(uid, 'Push', 14)
    ctx = _context(app, uid, rid)
    assert ctx['next_day'] == 'Legs'
    assert ctx['restarted'] is True


def test_keeps_rotating_just_short_of_two_weeks(app, uid):
    rid = _routine(uid, ['Legs', 'Push', 'Pull'])
    _log(uid, 'Legs', 14)
    _log(uid, 'Push', 13)
    ctx = _context(app, uid, rid)
    assert ctx['next_day'] == 'Pull'
    assert ctx['restarted'] is False


def test_a_layoff_inside_the_history_starts_a_fresh_run(app, uid):
    rid = _routine(uid, ['Legs', 'Push', 'Pull'])
    _log(uid, 'Legs', 30)
    _log(uid, 'Push', 29)
    _log(uid, 'Push', 1)  # day 2 of a new run after three weeks off
    assert _context(app, uid, rid)['next_day'] == 'Pull'


def _cardio_workout(user_id, bouts, extra_strength_first=False):
    w = Workout(user_id=user_id, name='Cardio', date=_today())
    db.session.add(w)
    db.session.flush()
    if extra_strength_first:
        lift = Exercise(workout_id=w.id, name='Squat', exercise_type='strength', order=0)
        db.session.add(lift)
        db.session.flush()
        db.session.add(Set(exercise_id=lift.id, reps=5, weight=225, order=0))
    run = Exercise(workout_id=w.id, name='Run', exercise_type='cardio', order=1)
    db.session.add(run)
    db.session.flush()
    for i, (minutes, distance, unit) in enumerate(bouts):
        db.session.add(Set(exercise_id=run.id, cardio_duration=minutes, distance=distance, distance_unit=unit, order=i))
    db.session.commit()
    return db.session.get(Workout, w.id).to_dict()


def test_cardio_totals_sum_every_bout(app, uid):
    d = _cardio_workout(uid, [(20, 3.0, 'km'), (10, 1.5, 'km')])
    assert d['cardio_duration'] == 30
    assert d['distance'] == 4.5
    assert d['distance_unit'] == 'km'


def test_cardio_totals_convert_mixed_units_to_the_first_bouts(app, uid):
    d = _cardio_workout(uid, [(20, 2.0, 'mi'), (10, 1.609344, 'km')])
    assert d['distance_unit'] == 'mi'
    assert d['distance'] == 3.0


def test_a_lifting_session_with_a_cardio_warm_up_is_strength(app, uid):
    d = _cardio_workout(uid, [(10, 1.0, 'km')], extra_strength_first=True)
    assert d['workout_type'] == 'strength'
    assert 'cardio_duration' not in d


def test_an_all_cardio_workout_is_cardio(app, uid):
    d = _cardio_workout(uid, [(25, 5.0, 'km')])
    assert d['workout_type'] == 'cardio'
