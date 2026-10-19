"""Editing the exercise library from the admin (utils/library_edits.py, the
/admin/exercises/<id> page), the custom-exercise candidates list, and
seed.py / backfill-descriptions leaving admin edits alone."""
import base64
from unittest.mock import patch

import pytest

import seed
from models import db, AdminAuditLog, ExerciseMuscleMapping, ExerciseTemplate, User
from utils import library_edits
from utils.library_edits import EditError, admin_edited_fields, apply_edit


def _auth():
    return {'Authorization': 'Basic ' + base64.b64encode(b'admin:pw').decode()}


def _write():
    return {**_auth(), 'Origin': 'http://localhost'}


@pytest.fixture
def admin_pw(monkeypatch):
    monkeypatch.setenv('ADMIN_PASSWORD', 'pw')


def _exercise(name='Bench Press', equipment='Barbell', primary=('Chest',), secondary=('Triceps',),
              user_id=None, **kw):
    ex = ExerciseTemplate(name=name, equipment=equipment, user_id=user_id, **kw)
    db.session.add(ex)
    db.session.flush()
    for m in primary:
        db.session.add(ExerciseMuscleMapping(exercise_template_id=ex.id, muscle_group=m, is_primary=True))
    for m in secondary:
        db.session.add(ExerciseMuscleMapping(exercise_template_id=ex.id, muscle_group=m, is_primary=False))
    db.session.commit()
    return ex


class TestApplyEdit:

    def test_muscles_are_replaced_and_audited(self, app):
        ex = _exercise()
        changed = apply_edit(ex, {'primary': ['Chest', 'Shoulders'], 'secondary': ['Triceps']})
        db.session.commit()
        assert changed == ['muscles']
        db.session.refresh(ex)
        assert ex.muscle_group == 'Chest, Shoulders, Triceps'
        row = AdminAuditLog.query.one()
        assert row.action == 'exercise.muscles.set'
        assert row.before == {'muscles': {'primary': ['Chest'], 'secondary': ['Triceps']}}

    def test_an_unchanged_field_is_not_audited(self, app):
        ex = _exercise(description='Press it.')
        assert apply_edit(ex, {'primary': ['Chest'], 'secondary': ['Triceps'], 'description': ' Press it. '}) == []
        assert AdminAuditLog.query.count() == 0

    @pytest.mark.parametrize('data, message', [
        ({'primary': ['Pecs']}, 'Unknown muscle'),
        ({'primary': []}, 'at least one primary'),
        ({'primary': ['Chest'], 'secondary': ['Chest']}, 'not both'),
        ({'primary': 'Chest'}, 'must be a list'),
        ({'description': 5}, 'must be text'),
        ({'description': 'x' * 4001}, 'longer than'),
        ({'bodyweight_load_factor': 0.5}, 'only applies'),
    ])
    def test_rejects_bad_input(self, app, data, message):
        ex = _exercise()
        with pytest.raises(EditError, match=message):
            apply_edit(ex, data)

    @pytest.mark.parametrize('factor', [0, -0.5, 1.6, True, '0.5'])
    def test_load_factor_range(self, app, factor):
        ex = _exercise(name='Push Up', equipment='Bodyweight')
        with pytest.raises(EditError):
            apply_edit(ex, {'bodyweight_load_factor': factor})

    def test_load_factor_on_a_bodyweight_exercise(self, app):
        ex = _exercise(name='Push Up', equipment='Bodyweight', bodyweight_load_factor=0.6)
        assert apply_edit(ex, {'bodyweight_load_factor': 0.65}) == ['load_factor']
        assert ex.bodyweight_load_factor == 0.65
        assert apply_edit(ex, {'bodyweight_load_factor': None}) == ['load_factor']
        assert ex.bodyweight_load_factor is None

    def test_an_invalid_field_changes_nothing_else(self, app):
        ex = _exercise(description='Old.')
        with pytest.raises(EditError):
            apply_edit(ex, {'description': 'New.', 'primary': ['Nope']})
        assert ex.description == 'Old.'
        assert AdminAuditLog.query.count() == 0

    def test_a_custom_exercise_cannot_be_edited(self, app, registered_user):
        ex = _exercise(name='My Lift', user_id=registered_user['user']['id'])
        with pytest.raises(EditError, match='custom'):
            apply_edit(ex, {'description': 'x'})

    def test_cardio_is_an_allowed_muscle(self, app):
        ex = _exercise(name='Rower', equipment='Machine', primary=('Cardio',), secondary=())
        assert apply_edit(ex, {'primary': ['Cardio'], 'secondary': ['Back']}) == ['muscles']


class TestAdminEditedFields:

    def test_maps_actions_to_fields(self, app):
        ex = _exercise()
        apply_edit(ex, {'description': 'x'})
        db.session.add(AdminAuditLog(action='exercise.image.apply_suggestion', target_type='exercise', target_id=ex.id))
        db.session.add(AdminAuditLog(action='premium.revenuecat_sync', target_type='users', target_id=None))
        db.session.commit()
        assert admin_edited_fields() == {ex.id: {'description', 'image'}}
        assert admin_edited_fields([ex.id + 1]) == {}


class TestEditRoutes:

    def test_detail_page_renders(self, client, admin_pw):
        ex = _exercise(name='Push Up', equipment='Bodyweight')
        html = client.get(f'/admin/exercises/{ex.id}', headers=_auth()).get_data(as_text=True)
        assert 'Bodyweight load factor' in html and 'data-muscle="Hamstrings"' in html

    def test_load_factor_only_shows_where_it_applies(self, client, admin_pw):
        ex = _exercise()
        html = client.get(f'/admin/exercises/{ex.id}', headers=_auth()).get_data(as_text=True)
        assert 'Bodyweight load factor' not in html

    def test_custom_exercise_is_read_only(self, client, admin_pw, registered_user):
        ex = _exercise(name='Mine', user_id=registered_user['user']['id'])
        html = client.get(f'/admin/exercises/{ex.id}', headers=_auth()).get_data(as_text=True)
        assert 'Read only' in html and 'testuser' in html
        res = client.post(f'/admin/exercises/{ex.id}/library', json={'description': 'x'}, headers=_write())
        assert res.status_code == 400

    def test_missing_exercise(self, client, admin_pw):
        assert client.get('/admin/exercises/99999', headers=_auth()).status_code == 404
        assert client.post('/admin/exercises/99999/library', json={}, headers=_write()).status_code == 404

    def test_save_and_backfill_flag(self, client, admin_pw):
        ex = _exercise(name='Push Up', equipment='Bodyweight', primary=('Chest',), secondary=())
        res = client.post(f'/admin/exercises/{ex.id}/library',
                          json={'primary': ['Chest'], 'secondary': ['Triceps'], 'bodyweight_load_factor': 0.7},
                          headers=_write())
        data = res.get_json()
        assert res.status_code == 200
        assert sorted(data['changed']) == ['load_factor', 'muscles'] and data['backfill_needed'] is True
        assert AdminAuditLog.query.count() == 2
        html = client.get(f'/admin/exercises/{ex.id}', headers=_auth()).get_data(as_text=True)
        assert html.count('Edited in admin') == 2

    def test_bad_body(self, client, admin_pw):
        ex = _exercise()
        assert client.post(f'/admin/exercises/{ex.id}/library', json=[1], headers=_write()).status_code == 400

    def test_needs_the_write_guard(self, client, admin_pw):
        ex = _exercise()
        res = client.post(f'/admin/exercises/{ex.id}/library', json={'description': 'x'}, headers=_auth())
        assert res.status_code == 403
        assert ex.description is None


class TestCandidates:

    def test_groups_custom_exercises_and_finds_the_closest_library_one(self, client, admin_pw):
        users = []
        for i in range(3):
            u = User(email=f'c{i}@x.com', username=f'c{i}', password='x')
            db.session.add(u)
            db.session.flush()
            users.append(u.id)
        lib = _exercise(name='Bulgarian Split Squat', equipment='Dumbbell')
        _exercise(name='Bulgarian split squat ', equipment='Dumbbell', user_id=users[0])
        _exercise(name='bulgarian Split Squat', equipment='Dumbbell', user_id=users[1])
        _exercise(name='Zercher Carry', equipment='Barbell', user_id=users[2])
        cands = library_edits.custom_candidates()
        assert [(c['name'], c['users']) for c in cands] == [('Bulgarian split squat', 2), ('Zercher Carry', 1)]
        assert cands[0]['closest'].id == lib.id and cands[0]['same'] is True
        assert cands[1]['closest'] is None
        html = client.get('/admin/exercises/candidates', headers=_auth()).get_data(as_text=True)
        assert 'Already in the library' in html and 'Nothing close' in html

    def test_empty(self, client, admin_pw):
        html = client.get('/admin/exercises/candidates', headers=_auth()).get_data(as_text=True)
        assert 'No custom exercises yet' in html


class TestSeedLeavesAdminEditsAlone:

    def _library_bench(self):
        # Seed's list says Bench Press (Barbell) is 'Chest, Triceps, Shoulders'; start it elsewhere
        return _exercise(name='Bench Press', equipment='Barbell', primary=('Back',), secondary=())

    def test_update_muscles_skips_an_admin_edit(self, app):
        ex = self._library_bench()
        apply_edit(ex, {'primary': ['Chest'], 'secondary': []})
        db.session.commit()
        seed.update_muscles()
        db.session.refresh(ex)
        assert ex.muscle_group == 'Chest'

    def test_force_overwrites_it(self, app, capsys):
        ex = self._library_bench()
        apply_edit(ex, {'primary': ['Chest'], 'secondary': []})
        db.session.commit()
        seed.update_muscles(force=True)
        db.session.expire_all()
        assert db.session.get(ExerciseTemplate, ex.id).muscle_group == 'Chest, Triceps, Shoulders'
        assert f'#{ex.id} Bench Press' in capsys.readouterr().out

    def test_an_unedited_exercise_still_updates(self, app):
        ex = self._library_bench()
        seed.update_muscles()
        db.session.expire_all()
        assert db.session.get(ExerciseTemplate, ex.id).muscle_group == 'Chest, Triceps, Shoulders'

    def test_a_custom_exercise_with_a_library_name_is_never_touched(self, app, registered_user):
        mine = _exercise(name='Bench Press', equipment='Barbell', primary=('Back',), secondary=(),
                         user_id=registered_user['user']['id'])
        seed.update_muscles()
        db.session.expire_all()
        assert db.session.get(ExerciseTemplate, mine.id).muscle_group == 'Back'

    def test_refetch_images_keeps_an_admin_pick(self, app):
        picked = _exercise(name='Bench Press', image_url='/static/exercise_images/1.gif')
        other = _exercise(name='Squat', equipment='Barbell', image_url='old.gif')
        db.session.add(AdminAuditLog(action='exercise.image.apply_suggestion', target_type='exercise',
                                     target_id=picked.id))
        db.session.commit()
        with patch.object(seed, '_load_exercisedb'), patch.object(seed, 'fetch_image_url', return_value='new.gif'):
            seed.refetch_images()
        db.session.expire_all()
        assert db.session.get(ExerciseTemplate, picked.id).image_url == '/static/exercise_images/1.gif'
        assert db.session.get(ExerciseTemplate, other.id).image_url == 'new.gif'


class TestBackfillDescriptions:

    def test_skips_a_description_cleared_in_the_admin_and_custom_exercises(self, app, registered_user):
        from utils.exercise_descriptions import EXERCISE_DESCRIPTIONS
        name = next(iter(EXERCISE_DESCRIPTIONS))
        cleared = _exercise(name=name, equipment='Barbell', description='Was here.')
        apply_edit(cleared, {'description': ''})
        fresh = _exercise(name=name, equipment='Dumbbell')
        mine = _exercise(name=name, equipment='Cable', user_id=registered_user['user']['id'])
        db.session.commit()
        result = app.test_cli_runner().invoke(args=['backfill-descriptions', '--apply'])
        assert result.exit_code == 0, result.output
        db.session.expire_all()
        assert db.session.get(ExerciseTemplate, cleared.id).description is None
        assert db.session.get(ExerciseTemplate, fresh.id).description == EXERCISE_DESCRIPTIONS[name]
        assert db.session.get(ExerciseTemplate, mine.id).description is None
