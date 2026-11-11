"""Workout imports from Hevy and Strong: parsing each format, exercise matching,
unit conversion, idempotent re-imports, PRs rebuilt in date order, and undo."""
from models import db, ExerciseTemplate, PersonalRecord, PREvent, Set, UserAchievement, Workout
from routes.user_routes import convert_weight_value
import time

import pytest

import utils.importers as importers
from utils.importers import ImportFormatError, parse, parse_duration_seconds, to_float, to_reps, to_rpe
from utils.importers.matching import key, split_title


def hdrs(token):
    return {'Authorization': f'Bearer {token}'}


HEVY = '''title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe
Push Day,"15 Jan 2024, 18:00","15 Jan 2024, 19:05",Felt good,Bench Press (Barbell),,Paused,0,warmup,135,10,,,
Push Day,"15 Jan 2024, 18:00","15 Jan 2024, 19:05",Felt good,Bench Press (Barbell),,Paused,1,normal,185,5,,,8
Push Day,"15 Jan 2024, 18:00","15 Jan 2024, 19:05",Felt good,Bench Press (Barbell),,Paused,2,failure,185,4,,,9.5
Push Day,"15 Jan 2024, 18:00","15 Jan 2024, 19:05",Felt good,Plank,,,0,normal,,,,60,
Push Day,"15 Jan 2024, 18:00","15 Jan 2024, 19:05",Felt good,Cable Fly Crossovers (Band),,,0,normal,,12,,,
Cardio,"16 Jan 2024, 07:00","16 Jan 2024, 07:30",,Running,,,0,normal,,,3.1,1800,
Push Day,"22 Jan 2024, 18:00","22 Jan 2024, 19:00",,Bench Press (Barbell),,,0,normal,195,5,,,
'''

STRONG_OLD = '''Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2023-03-01 18:30:00,Legs,1h 5m,Squat (Barbell),W,60,8,0,0,,,
2023-03-01 18:30:00,Legs,1h 5m,Squat (Barbell),1,100,5,0,0,Deep,,8
2023-03-01 18:30:00,Legs,1h 5m,Squat (Barbell),Rest Timer,0,0,0,90,,,
2023-03-01 18:30:00,Legs,1h 5m,Pull-Ups,1,0,10,0,0,,,
'''

# A real Strong export (2026-11, notes and rest timers left out of the export)
STRONG_REAL = '''Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE
2026-05-08 11:57:30,"Morning Workout",13s,"Around the World",1,2.0,2.0,0,0.0,
2026-11-10 21:20:54,"Evening Workout",1m,"Bench Press (Barbell)",1,135.0,10.0,0,0.0,
2026-11-10 21:20:54,"Evening Workout",1m,"Bench Press (Barbell)",2,225.0,10.0,0,0.0,
2026-11-10 21:20:54,"Evening Workout",1m,"Triceps Dip",1,25.0,10.0,0,0.0,'''

# Real exports (2026-11): Hevy, and Strong with rest timers and notes turned on
HEVY_REAL = '''"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_lbs","reps","distance_miles","duration_seconds","rpe"
"Chest","11 May 2026, 15:48","11 May 2026, 15:55","","Bench Press (Barbell)",,"",0,"normal",10,100,,,
"Chest","11 May 2026, 15:48","11 May 2026, 15:55","","Bench Press (Barbell)",,"",1,"normal",10,100,,,
"Chest","11 May 2026, 15:48","11 May 2026, 15:55","","Behind the Back Curl (Cable)",,"",0,"normal",5,5,,,
"Day 1","24 Apr 2026, 15:35","24 Apr 2026, 15:57","","Bench Press (Barbell)",,"",0,"normal",10,100,,,
"Day 1","24 Apr 2026, 15:35","24 Apr 2026, 15:57","","Bench Press (Barbell)",,"",1,"normal",10,100,,,
"Day 1","24 Apr 2026, 15:35","24 Apr 2026, 15:57","","Bench Press (Dumbbell)",,"",0,"normal",8,50,,,
"Day 1","24 Apr 2026, 15:35","24 Apr 2026, 15:57","","Bench Press (Dumbbell)",,"",1,"normal",8,50,,,
"Day 1","6 Nov 2025, 12:39","6 Nov 2025, 12:39","","Bench Press (Barbell)",,"",0,"normal",10,100,,,
"Day 1","6 Nov 2025, 12:39","6 Nov 2025, 12:39","","Bench Press (Barbell)",,"",1,"normal",10,100,,,
"Day 1","6 Nov 2025, 12:39","6 Nov 2025, 12:39","","Bench Press (Dumbbell)",,"",0,"normal",8,50,,,
"Day 1","6 Nov 2025, 12:39","6 Nov 2025, 12:39","","Bench Press (Dumbbell)",,"",1,"normal",8,50,,,
"Day 1","6 Nov 2025, 12:39","6 Nov 2025, 12:39","","Bent Over Row (Barbell)",,"",0,"normal",5,10,,,
"Day 1","6 Nov 2025, 12:39","6 Nov 2025, 12:39","","Bent Over Row (Barbell)",,"",1,"normal",5,10,,,'''

# The same account exported again after logging set types, a run and a plank
_HEVY_HEADER, _HEVY_BODY = HEVY_REAL.split('\n', 1)
HEVY_REAL_TYPES = _HEVY_HEADER + '\n' + '''"Day 1","10 Nov 2026, 21:57","10 Nov 2026, 22:22","","Bench Press (Barbell)",,"",0,"warmup",135,10,,,
"Day 1","10 Nov 2026, 21:57","10 Nov 2026, 22:22","","Bench Press (Barbell)",,"",1,"normal",135,12,,,
"Day 1","10 Nov 2026, 21:57","10 Nov 2026, 22:22","","Bench Press (Barbell)",,"",2,"failure",150,12,,,
"Day 1","10 Nov 2026, 21:57","10 Nov 2026, 22:22","","Bench Press (Dumbbell)",,"",0,"dropset",50,10,,,
"Day 1","10 Nov 2026, 21:57","10 Nov 2026, 22:22","","Bench Press (Dumbbell)",,"",1,"normal",50,10,,,
"Day 1","10 Nov 2026, 21:57","10 Nov 2026, 22:22","","Bent Over Row (Barbell)",,"",0,"normal",135,10,,,
"Day 1","10 Nov 2026, 21:57","10 Nov 2026, 22:22","","Bent Over Row (Barbell)",,"",1,"normal",135,12,,,
"Day 1","10 Nov 2026, 21:57","10 Nov 2026, 22:22","","Running",,"",0,"normal",,,3,1440,
"Day 1","10 Nov 2026, 21:57","10 Nov 2026, 22:22","","Plank",,"",0,"normal",,,,60,
''' + _HEVY_BODY

STRONG_REAL_FULL = '''Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-05-08 11:57:30,"Morning Workout",13s,"Around the World",1,2.0,2.0,0,0.0,"","",
2026-05-08 11:57:30,"Morning Workout",13s,"Around the World",Rest Timer,0,0.0,0,120.0,,,
2026-11-10 21:20:54,"Evening Workout",1m,"Bench Press (Barbell)",1,135.0,10.0,0,0.0,"","",
2026-11-10 21:20:54,"Evening Workout",1m,"Bench Press (Barbell)",Rest Timer,0,0.0,0,120.0,,,
2026-11-10 21:20:54,"Evening Workout",1m,"Bench Press (Barbell)",2,225.0,10.0,0,0.0,,,
2026-11-10 21:20:54,"Evening Workout",1m,"Bench Press (Barbell)",Rest Timer,0,0.0,0,120.0,,,
2026-11-10 21:20:54,"Evening Workout",1m,"Triceps Dip",1,25.0,10.0,0,0.0,"",,
2026-11-10 21:20:54,"Evening Workout",1m,"Triceps Dip",Rest Timer,0,0.0,0,120.0,,,'''

STRONG_NEW = '''Workout #;Date;Workout Name;Duration (sec);Exercise Name;Set Order;Weight (kg);Reps;RPE;Distance (meters);Seconds;Notes;Workout Notes
1;2024-05-11 18:30:00;Upper A;3720;Bench Press (Barbell);1;80;5;;;;;
1;2024-05-11 18:30:00;Upper A;3720;Bench Press (Barbell);2;82,5;5;;;;;
1;2024-05-11 18:30:00;Upper A;3720;Rowing (Machine);1;;;;2000;480;;
'''


def _library(app, *rows):
    with app.app_context():
        ids = {}
        for name, equipment, etype in rows:
            t = ExerciseTemplate(name=name, equipment=equipment, exercise_type=etype)
            db.session.add(t)
            db.session.flush()
            ids[(name, equipment)] = t.id
        db.session.commit()
        return ids


LIBRARY = (
    ('Bench Press', 'Barbell', 'strength'),
    ('Bench Press', 'Dumbbell', 'strength'),
    ('Squat', 'Barbell', 'strength'),
    ('Bent Over Row', 'Barbell', 'strength'),
    ('Behind the Back Wrist Curl', 'Cable', 'strength'),
    ('Pull Up', 'Bodyweight', 'strength'),
    ('Dips', 'Bodyweight', 'strength'),
    ('Dips', 'Weighted', 'strength'),
    ('Plank', None, 'duration'),
    ('Running', None, 'cardio'),
    ('Rowing', 'Rowing Machine', 'cardio'),
)


def _import(client, token, source, text, **extra):
    return client.post('/api/import', json={'source': source, 'csv': text, **extra}, headers=hdrs(token))


# ── Parsers ──────────────────────────────────────────────────

def test_hevy_parses_workouts_exercises_and_set_types():
    parsed = parse('hevy', HEVY)
    assert parsed.weight_unit == 'lbs'
    assert [w.title for w in parsed.workouts] == ['Push Day', 'Cardio', 'Push Day']
    push = parsed.workouts[0]
    assert push.duration_seconds == 65 * 60
    assert push.notes == 'Felt good'
    assert push.has_time and push.start.hour == 18
    bench = push.exercises[0]
    assert bench.notes == 'Paused'
    assert [s.set_type for s in bench.sets] == ['W', 'N', 'F']
    assert [s.rpe for s in bench.sets] == [None, 8, 10]
    run = parsed.workouts[1].exercises[0].sets[0]
    assert (run.distance, run.distance_unit, run.seconds) == (3.1, 'mi', 1800)


def test_strong_old_format_has_no_unit_and_skips_rest_timers():
    parsed = parse('strong', STRONG_OLD)
    assert parsed.weight_unit is None
    w = parsed.workouts[0]
    assert w.duration_seconds == 65 * 60
    squat = w.exercises[0]
    assert [s.set_type for s in squat.sets] == ['W', 'N']
    assert squat.notes == 'Deep'


def test_strong_new_format_reads_units_from_the_header_and_semicolons():
    parsed = parse('strong', STRONG_NEW)
    assert parsed.weight_unit == 'kg'
    w = parsed.workouts[0]
    assert w.duration_seconds == 3720
    assert [s.weight for s in w.exercises[0].sets] == [80, 82.5]
    row = w.exercises[1].sets[0]
    assert (row.distance, row.distance_unit, row.seconds) == (2.0, 'km', 480)


def test_wrong_file_is_rejected_with_a_reason():
    for source, text in (('hevy', STRONG_OLD), ('strong', HEVY), ('hevy', ''), ('strong', 'a,b\n1,2\n')):
        try:
            parse(source, text)
        except ImportFormatError as e:
            assert str(e)
        else:
            raise AssertionError(f'{source} accepted the wrong file')


def test_matching_keys_ignore_spelling_noise():
    assert key('Pull-Ups') == key('pull up') == key('Pullup')
    assert key('Triceps Pushdown') == key('Tricep Pushdown')
    assert split_title('Bench Press (Barbell)') == ('Bench Press', 'Barbell', 'Barbell')
    assert split_title('Fly (Band)') == ('Fly', None, 'Band')
    assert split_title('Plank') == ('Plank', None, None)


def test_a_comma_is_a_thousands_separator_only_in_a_comma_file():
    assert to_float('1,000') == 1000
    assert to_float('1,000', ';') == 1.0
    assert to_float('62,5') == to_float('62,5', ';') == 62.5


def test_time_only_sets_are_cardio_when_the_title_or_length_says_so():
    from routes.import_routes import _infer_type
    from utils.importers import ParsedSet
    held = [ParsedSet(seconds=60)]
    assert _infer_type('Wall Sit', held) == 'duration'
    assert _infer_type('Jump Rope', held) == 'cardio'
    assert _infer_type('Mystery Machine', [ParsedSet(seconds=1200)]) == 'cardio'
    assert _infer_type('Farmer Carry', [ParsedSet(seconds=60, weight=50)]) == 'strength'


# ── Preview ──────────────────────────────────────────────────

def test_preview_writes_nothing_and_reports_matches(app, client, auth_token):
    _library(app, *LIBRARY)
    res = client.post('/api/import/preview', json={'source': 'hevy', 'csv': HEVY}, headers=hdrs(auth_token))
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body['workouts'] == 3
    assert body['already_imported'] == 0
    assert (body['first_date'], body['last_date']) == ('2024-01-15', '2024-01-22')
    assert {m['title'] for m in body['matched_exercises']} == {'Bench Press (Barbell)', 'Plank', 'Running'}
    assert body['new_exercises'] == ['Cable Fly Crossovers (Band)']
    assert body['unit_in_file'] is True
    with app.app_context():
        assert Workout.query.count() == 0
        assert ExerciseTemplate.query.filter(ExerciseTemplate.user_id.isnot(None)).count() == 0


def test_preview_rejects_a_bad_file(client, auth_token):
    res = client.post('/api/import/preview', json={'source': 'strong', 'csv': HEVY}, headers=hdrs(auth_token))
    assert res.status_code == 400
    assert 'Strong' in res.get_json()['message']


# ── Import ───────────────────────────────────────────────────

def test_import_writes_workouts_with_matched_and_custom_exercises(app, client, auth_token):
    ids = _library(app, *LIBRARY)
    res = _import(client, auth_token, 'hevy', HEVY)
    assert res.status_code == 201, res.get_json()
    body = res.get_json()
    assert body['imported'] == 3
    assert body['exercises_created'] == 1
    with app.app_context():
        workouts = Workout.query.order_by(Workout.date).all()
        assert [w.name for w in workouts] == ['Push Day', 'Cardio', 'Push Day']
        push = workouts[0]
        assert push.duration == 65   # minutes, like a logged workout
        assert push.local_start_hour == 18
        assert push.volume > 0
        bench, plank, fly = push.exercises
        assert bench.exercise_template_id == ids[('Bench Press', 'Barbell')]
        assert [(s.set_type, s.reps, s.weight) for s in bench.sets] == [('W', 10, 135), ('N', 5, 185), ('F', 4, 185)]
        assert plank.exercise_type == 'duration'
        assert plank.sets[0].cardio_duration == 1.0 and plank.sets[0].reps is None
        custom = db.session.get(ExerciseTemplate, fly.exercise_template_id)
        assert (custom.name, custom.equipment, custom.user_id) == ('Cable Fly Crossovers', 'Band', push.user_id)
        run = workouts[1].exercises[0]
        assert run.exercise_type == 'cardio'
        assert (run.sets[0].distance, run.sets[0].distance_unit, run.sets[0].cardio_duration) == (3.1, 'mi', 30.0)


def test_reimporting_the_same_file_adds_nothing(app, client, auth_token):
    _library(app, *LIBRARY)
    assert _import(client, auth_token, 'hevy', HEVY).status_code == 201
    again = _import(client, auth_token, 'hevy', HEVY)
    assert again.status_code == 201
    assert again.get_json()['imported'] == 0
    assert again.get_json()['already_imported'] == 3
    preview = client.post('/api/import/preview', json={'source': 'hevy', 'csv': HEVY}, headers=hdrs(auth_token))
    assert preview.get_json()['workouts'] == 0
    with app.app_context():
        assert Workout.query.count() == 3
        assert ExerciseTemplate.query.filter(ExerciseTemplate.user_id.isnot(None)).count() == 1


def test_kg_file_converts_into_a_lbs_account(app, client, auth_token):
    ids = _library(app, *LIBRARY)
    assert _import(client, auth_token, 'strong', STRONG_NEW).status_code == 201
    with app.app_context():
        weights = [s.weight for s in Set.query.join(Set.exercises).filter_by(
            exercise_template_id=ids[('Bench Press', 'Barbell')]).order_by(Set.order)]
        assert weights == [convert_weight_value(80, 'lbs'), convert_weight_value(82.5, 'lbs')]
        rowing = Workout.query.one().exercises[1]
        assert rowing.exercise_template_id == ids[('Rowing', 'Rowing Machine')]


def test_unitless_strong_file_uses_the_unit_the_user_picks(app, client, auth_token):
    ids = _library(app, *LIBRARY)
    assert _import(client, auth_token, 'strong', STRONG_OLD, weight_unit='kg').status_code == 201
    with app.app_context():
        workout = Workout.query.one()
        squat, pullup = workout.exercises
        assert [s.weight for s in squat.sets] == [convert_weight_value(60, 'lbs'), convert_weight_value(100, 'lbs')]
        assert squat.notes == 'Deep'
        assert pullup.exercise_template_id == ids[('Pull Up', 'Bodyweight')]


def test_real_strong_export_imports(app, client, auth_token):
    ids = _library(app, *LIBRARY)
    preview = client.post('/api/import/preview', json={'source': 'strong', 'csv': STRONG_REAL},
                          headers=hdrs(auth_token)).get_json()
    assert preview['unit_in_file'] is False
    assert preview['new_exercises'] == ['Around the World']
    assert {m['title']: (m['name'], m['equipment']) for m in preview['matched_exercises']} == {
        'Bench Press (Barbell)': ('Bench Press', 'Barbell'),
        'Triceps Dip': ('Dips', 'Weighted'),
    }
    assert _import(client, auth_token, 'strong', STRONG_REAL, weight_unit='lbs').get_json()['imported'] == 2
    with app.app_context():
        morning, evening = Workout.query.order_by(Workout.date).all()
        assert (morning.duration, morning.local_start_hour) == (None, 11)   # 13 seconds
        assert (evening.duration, evening.local_start_hour) == (1, 21)
        bench, dip = evening.exercises
        assert [(s.reps, s.weight) for s in bench.sets] == [(10, 135), (10, 225)]
        assert dip.exercise_template_id == ids[('Dips', 'Weighted')]
        assert (dip.sets[0].reps, dip.sets[0].weight) == (10, 25)


def test_real_hevy_export_imports(app, client, auth_token):
    ids = _library(app, *LIBRARY)
    preview = client.post('/api/import/preview', json={'source': 'hevy', 'csv': HEVY_REAL},
                          headers=hdrs(auth_token)).get_json()
    assert preview['workouts'] == 3
    assert (preview['first_date'], preview['last_date']) == ('2025-11-06', '2026-05-11')
    assert preview['unit_in_file'] is True
    # Close to a library name is not the same lift: it becomes the user's own
    assert preview['new_exercises'] == ['Behind the Back Curl (Cable)']
    assert _import(client, auth_token, 'hevy', HEVY_REAL).get_json()['imported'] == 3
    with app.app_context():
        nov, apr, may = Workout.query.order_by(Workout.date).all()
        assert [w.name for w in (nov, apr, may)] == ['Day 1', 'Day 1', 'Chest']
        assert nov.duration is None  # started and ended the same minute
        assert (apr.duration, may.duration) == (22, 7)
        assert [ex.exercise_template_id for ex in nov.exercises] == [
            ids[('Bench Press', 'Barbell')], ids[('Bench Press', 'Dumbbell')], ids[('Bent Over Row', 'Barbell')]]
        assert [(s.weight, s.reps) for s in nov.exercises[0].sets] == [(10, 100), (10, 100)]


def test_real_hevy_export_with_set_types_cardio_and_holds(app, client, auth_token):
    ids = _library(app, *LIBRARY)
    body = _import(client, auth_token, 'hevy', HEVY_REAL_TYPES).get_json()
    assert body['imported'] == 4
    with app.app_context():
        latest = Workout.query.order_by(Workout.date.desc()).first()
        assert (latest.duration, latest.local_start_hour) == (25, 21)
        barbell, dumbbell, row, run, plank = latest.exercises
        assert [(s.set_type, s.reps, s.weight) for s in barbell.sets] == [
            ('W', 10, 135), ('N', 12, 135), ('F', 12, 150)]
        assert [s.set_type for s in dumbbell.sets] == ['D', 'N']
        assert run.exercise_template_id == ids[('Running', None)]
        assert run.exercise_type == 'cardio'
        assert [(s.distance, s.distance_unit, s.cardio_duration, s.reps, s.weight) for s in run.sets] == [
            (3.0, 'mi', 24.0, None, None)]
        assert plank.exercise_template_id == ids[('Plank', None)]
        assert plank.exercise_type == 'duration'
        assert [(s.cardio_duration, s.reps, s.weight) for s in plank.sets] == [(1.0, None, None)]
        assert latest.to_dict()['workout_type'] == 'strength'
        best = PersonalRecord.query.filter_by(
            exercise_template_id=ids[('Bench Press', 'Barbell')], pr_type='max_weight').one()
        assert best.value == 150
        assert PersonalRecord.query.filter_by(exercise_template_id=ids[('Running', None)]).count() > 0
        assert PersonalRecord.query.filter_by(
            exercise_template_id=ids[('Plank', None)], pr_type='max_duration').one().value == 1.0
    # Exported again with more logged: only the new workout comes in
    again = _import(client, auth_token, 'hevy', HEVY_REAL).get_json()
    assert (again['imported'], again['already_imported']) == (0, 3)


def test_real_strong_export_with_rest_timers_and_notes(app, client, auth_token):
    _library(app, *LIBRARY)
    parsed = parse('strong', STRONG_REAL_FULL)
    assert [[len(ex.sets) for ex in w.exercises] for w in parsed.workouts] == [[1], [2, 1]]
    assert all(ex.notes is None for w in parsed.workouts for ex in w.exercises)
    assert _import(client, auth_token, 'strong', STRONG_REAL_FULL, weight_unit='lbs').get_json()['imported'] == 2
    # The same history exported without rest timers is the same workouts
    again = _import(client, auth_token, 'strong', STRONG_REAL, weight_unit='lbs').get_json()
    assert (again['imported'], again['already_imported']) == (0, 2)


def test_no_equipment_title_without_added_weight_stays_bodyweight(app, client, auth_token):
    ids = _library(app, *LIBRARY)
    text = STRONG_REAL.replace('"Triceps Dip",1,25.0', '"Triceps Dip",1,0')
    _import(client, auth_token, 'strong', text, weight_unit='lbs')
    with app.app_context():
        dip = Workout.query.order_by(Workout.date.desc()).first().exercises[1]
        assert dip.exercise_template_id == ids[('Dips', 'Bodyweight')]


def test_prs_are_replayed_in_date_order_with_existing_history(app, client, auth_token):
    ids = _library(app, *LIBRARY)
    bench = ids[('Bench Press', 'Barbell')]
    # Logged here first, but dated after the whole Hevy history
    res = client.post('/api/workouts', json={
        'workoutName': 'Bench', 'date': '2024-03-01',
        'exercises': [{'name': 'Bench Press', 'exercise_template_id': bench, 'sets': [{'reps': 5, 'weight': 190}]}],
    }, headers=hdrs(auth_token))
    assert res.status_code == 201
    body = _import(client, auth_token, 'hevy', HEVY).get_json()
    assert body['prs'] > 0
    with app.app_context():
        record = PersonalRecord.query.filter_by(exercise_template_id=bench, pr_type='max_weight').one()
        assert record.value == 195
        chain = (PREvent.query.filter_by(exercise_template_id=bench, pr_type='max_weight')
                 .order_by(PREvent.achieved_at).all())
        assert [e.value for e in chain] == [185, 195]  # each workout's heaviest set
        assert chain[-1].previous_value == 185


def test_import_badges_arrive_already_seen(app, client, auth_token):
    _library(app, *LIBRARY)
    body = _import(client, auth_token, 'hevy', HEVY).get_json()
    assert body['badges'] > 0
    with app.app_context():
        assert UserAchievement.query.count() == body['badges']
        assert UserAchievement.query.filter_by(seen=False).count() == 0


def test_imports_never_match_another_users_custom_exercise(app, client, auth_token, auth_token2):
    res = client.post('/api/exercises', json={'name': 'Cable Fly Crossovers', 'equipment': 'Band'},
                      headers=hdrs(auth_token2))
    assert res.status_code == 201
    other_id = res.get_json()['id']
    _library(app, *LIBRARY)
    _import(client, auth_token, 'hevy', HEVY)
    with app.app_context():
        fly = next(ex for w in Workout.query.all() for ex in w.exercises if ex.name == 'Cable Fly Crossovers')
        assert fly.exercise_template_id != other_id


def test_a_custom_made_from_an_aliased_title_is_matched_on_the_next_import(app, client, auth_token):
    _library(app, *LIBRARY)
    first = _HEVY_HEADER + '\n' + (
        '"Day 1","1 Mar 2026, 10:00","1 Mar 2026, 11:00","","Triceps Dip (Assisted)",,"",0,"normal",40,8,,,\n'
        '"Day 1","1 Mar 2026, 10:00","1 Mar 2026, 11:00","","Chest Dip (Ring)",,"",0,"normal",,8,,,\n')
    second = first + (
        '"Day 1","8 Mar 2026, 10:00","8 Mar 2026, 11:00","","Triceps Dip (Assisted)",,"",0,"normal",30,8,,,\n'
        '"Day 1","8 Mar 2026, 10:00","8 Mar 2026, 11:00","","Chest Dip (Ring)",,"",0,"normal",,9,,,\n')
    assert _import(client, auth_token, 'hevy', first).get_json()['exercises_created'] == 2
    res = _import(client, auth_token, 'hevy', second)
    assert res.status_code == 201
    assert (res.get_json()['imported'], res.get_json()['exercises_created']) == (1, 0)
    with app.app_context():
        assert ExerciseTemplate.query.filter(ExerciseTemplate.user_id.isnot(None)).count() == 2


def test_trap_bar_deadlift_matches_the_library_row(app, client, auth_token):
    ids = _library(app, ('Trap Bar Deadlift', 'Other', 'strength'))
    text = _HEVY_HEADER + '\n' + (
        '"Legs","1 Mar 2026, 10:00","1 Mar 2026, 11:00","","Deadlift (Trap bar)",,"",0,"normal",315,5,,,\n')
    preview = client.post('/api/import/preview', json={'source': 'hevy', 'csv': text},
                          headers=hdrs(auth_token)).get_json()
    assert preview['new_exercises'] == []
    _import(client, auth_token, 'hevy', text)
    with app.app_context():
        assert Workout.query.one().exercises[0].exercise_template_id == ids[('Trap Bar Deadlift', 'Other')]


# ── Status and undo ──────────────────────────────────────────

def test_undo_removes_only_that_apps_imports_and_rebuilds_prs(app, client, auth_token):
    ids = _library(app, *LIBRARY)
    _import(client, auth_token, 'hevy', HEVY)
    _import(client, auth_token, 'strong', STRONG_NEW)
    status = client.get('/api/import', headers=hdrs(auth_token)).get_json()
    assert status['imported'] == {'hevy': 3, 'strong': 1}

    res = client.delete('/api/import/hevy', headers=hdrs(auth_token))
    assert res.status_code == 200
    assert res.get_json()['removed'] == 3
    with app.app_context():
        assert Workout.query.count() == 1
        record = PersonalRecord.query.filter_by(
            exercise_template_id=ids[('Bench Press', 'Barbell')], pr_type='max_weight').one()
        assert record.value == convert_weight_value(82.5, 'lbs')
        assert PREvent.query.filter(PREvent.value == 195).count() == 0
    assert client.get('/api/import', headers=hdrs(auth_token)).get_json()['imported'] == {'hevy': 0, 'strong': 1}


def test_undo_unknown_source_is_404(client, auth_token):
    assert client.delete('/api/import/fitbod', headers=hdrs(auth_token)).status_code == 404


# ── Hostile files ────────────────────────────────────────────
# The import runs in one request on the only worker: a file that takes 30s to
# parse takes the API down for everyone and resets the in-memory rate limits

_HEVY_COLS = 'title,start_time,exercise_title,weight_lbs,reps\n'


def test_split_title_matches_what_the_regex_did():
    assert split_title('Bench Press (Barbell)') == ('Bench Press', 'Barbell', 'Barbell')
    assert split_title('  Row  ( Cable )  ') == ('Row', 'Cable', 'Cable')
    assert split_title('Squat') == ('Squat', None, None)
    assert split_title('Curl (EZ) (Cable)') == ('Curl (EZ)', 'Cable', 'Cable')
    assert split_title('Lunge (Barbell') == ('Lunge (Barbell', None, None)
    assert split_title('Odd) name)') == ('Odd) name)', None, None)
    assert split_title('(Dumbbell)') == ('(Dumbbell)', 'Dumbbell', 'Dumbbell')
    assert split_title('Press ()') == ('Press', None, None)
    assert split_title(None) == ('', None, None)


def test_a_title_of_unclosed_parentheses_is_split_in_linear_time():
    started = time.perf_counter()
    assert split_title('(' * 200_000) == ('(' * 200_000, None, None)
    assert split_title('(' * 200_000 + ')')[2] == '(' * 199_999
    assert time.perf_counter() - started < 1


def test_an_overlong_cell_is_refused(client, auth_token):
    text = _HEVY_COLS + f'w,2024-01-01 10:00:00,{"(" * (importers.MAX_CELL_CHARS + 1)},100,5\n'
    for path in ('/api/import/preview', '/api/import'):
        res = client.post(path, json={'source': 'hevy', 'csv': text}, headers=hdrs(auth_token))
        assert res.status_code == 400, path
        assert 'too long' in res.get_json()['message']


def test_a_cell_past_the_csv_modules_limit_is_a_400_not_a_500(client, auth_token):
    text = _HEVY_COLS + f'w,2024-01-01 10:00:00,{"a" * 140_000},100,5\n'
    res = client.post('/api/import/preview', json={'source': 'hevy', 'csv': text}, headers=hdrs(auth_token))
    assert res.status_code == 400


def test_too_many_rows_or_workouts_are_refused(app, client, auth_token, monkeypatch):
    rows = ''.join(f'w,2024-01-0{d} 10:00:00,Bench Press (Barbell),100,5\n' for d in (1, 2, 3))
    monkeypatch.setattr(importers, 'MAX_ROWS', 2)
    res = _import(client, auth_token, 'hevy', _HEVY_COLS + rows)
    assert res.status_code == 400 and 'too large' in res.get_json()['message']
    monkeypatch.setattr(importers, 'MAX_ROWS', 3)
    monkeypatch.setattr(importers, 'MAX_WORKOUTS', 2)
    res = _import(client, auth_token, 'hevy', _HEVY_COLS + rows)
    assert res.status_code == 400 and 'too large' in res.get_json()['message']
    with app.app_context():
        assert Workout.query.count() == 0
    monkeypatch.setattr(importers, 'MAX_WORKOUTS', 3)
    assert _import(client, auth_token, 'hevy', _HEVY_COLS + rows).get_json()['imported'] == 3


def test_a_duration_of_thousands_of_digits_is_no_duration():
    assert parse_duration_seconds('9' * 5000 + ':00:00') is None
    assert parse_duration_seconds('9' * 400 + 'h') is None
    assert parse_duration_seconds('1e308') is None
    assert parse_duration_seconds('1h 5m') == 3900


def test_a_workout_dated_before_the_apps_existed_is_skipped(app, client, auth_token):
    """Year 1 overflowed the streak maths and broke the user's achievements page."""
    text = _HEVY_COLS + (
        'old,0001-01-01 10:00:00,Bench Press (Barbell),100,5\n'
        'real,2024-01-01 10:00:00,Bench Press (Barbell),100,5\n')
    assert _import(client, auth_token, 'hevy', text).get_json()['imported'] == 1
    assert client.get('/api/achievements', headers=hdrs(auth_token)).status_code == 200
    with pytest.raises(ImportFormatError):
        parse('hevy', _HEVY_COLS + 'old,0001-01-01 10:00:00,Bench Press (Barbell),100,5\n')


# ── Found in review of the shipped import ────────────────────

def test_an_imported_duration_counts_as_minutes_toward_hours(app, client, auth_token):
    """Stored as seconds, every imported workout hit the 4-hour timer cap and
    250 of them awarded the 1,000-hour badge."""
    _library(app, *LIBRARY)
    _import(client, auth_token, 'hevy', HEVY)
    tracks = client.get('/api/achievements', headers=hdrs(auth_token)).get_json()['tracks']
    hours = next(t for t in tracks if t['track'] == 'hours')
    # 65 + 60 minutes of lifting and a 30-minute run
    assert hours['value'] == 2.6


def test_non_latin_titles_stay_different_exercises(app, client, auth_token):
    assert key('Жим лёжа') != key('Приседания') and key('Жим лёжа') and key('深蹲')
    assert key('🔥') == '🔥' and key('🔥') != key('💪')
    assert key('Pull-Ups') == key('pull ups') == 'pullup'
    text = _HEVY_COLS + (
        'a,2024-01-01 10:00:00,Жим лёжа,100,5\n'
        'a,2024-01-01 10:00:00,Приседания,140,5\n')
    assert _import(client, auth_token, 'hevy', text).get_json()['exercises_created'] == 2
    # The next export: each title finds its own custom, not the first one made
    later = _HEVY_COLS + (
        'b,2024-01-08 10:00:00,Жим лёжа,105,5\n'
        'b,2024-01-08 10:00:00,Приседания,145,5\n')
    assert _import(client, auth_token, 'hevy', later).get_json()['exercises_created'] == 0
    with app.app_context():
        latest = Workout.query.order_by(Workout.date.desc()).first()
        assert [ex.name for ex in latest.exercises] == ['Жим лёжа', 'Приседания']
        assert len({ex.exercise_template_id for ex in latest.exercises}) == 2


def test_the_pr_count_leaves_out_estimated_1rm(app, client, auth_token):
    _library(app, *LIBRARY)
    body = _import(client, auth_token, 'hevy', HEVY).get_json()
    with app.app_context():
        events = PREvent.query.all()
        shown = [e for e in events if e.pr_type != 'estimated_1rm']
        assert len(shown) < len(events)
        assert body['prs'] == len(shown)


def test_sets_that_do_not_fit_their_exercise_are_counted_out_of_the_preview(app, client, auth_token):
    """A library timed hold logged with reps has nowhere to go. The preview has
    to say so, and not offer a workout made only of such sets as new forever."""
    _library(app, *LIBRARY)
    text = _HEVY_COLS + (
        'only planks,2024-01-01 10:00:00,Plank,,20\n'
        'mixed,2024-01-02 10:00:00,Plank,,20\n'
        'mixed,2024-01-02 10:00:00,Bench Press (Barbell),100,5\n')
    payload = {'source': 'hevy', 'csv': text}
    preview = client.post('/api/import/preview', json=payload, headers=hdrs(auth_token)).get_json()
    assert (preview['workouts'], preview['sets'], preview['skipped_sets']) == (1, 1, 2)
    assert [m['title'] for m in preview['matched_exercises']] == ['Bench Press (Barbell)']
    assert _import(client, auth_token, 'hevy', text).get_json()['imported'] == 1
    with app.app_context():
        assert [ex.name for ex in Workout.query.one().exercises] == ['Bench Press']


def test_rpe_half_steps_round_up():
    assert [to_rpe(v) for v in ('6.5', '7.5', '8.5', '9.5', '8.4', '10.5', '0.4')] == [7, 8, 9, 10, 8, None, None]


def test_absurd_numbers_are_dropped_not_stored(client, auth_token):
    assert to_reps('99999999999') is None and to_reps('1e15') is None
    assert to_float('1e300') is None and to_float('225.5') == 225.5
    text = _HEVY_COLS + 'w,2024-01-01 10:00:00,Bench Press (Barbell),100,99999999999\n'
    res = _import(client, auth_token, 'hevy', text)
    assert res.status_code == 201, res.get_json()


def test_a_nul_byte_is_a_400(client, auth_token):
    text = _HEVY_COLS + 'w\x00,2024-01-01 10:00:00,Bench Press (Barbell),100,5\n'
    for path in ('/api/import/preview', '/api/import'):
        res = client.post(path, json={'source': 'hevy', 'csv': text}, headers=hdrs(auth_token))
        assert res.status_code == 400, path
