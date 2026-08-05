"""
Tests for /admin/* — HTTP Basic Auth (ADMIN_PASSWORD) protected exercise
image review tools. Had zero coverage before this file: the auth guard
itself, the RapidAPI/ExerciseDB integration, and the file-write path in
apply-suggestion were all previously unverified.
"""
import base64
from unittest.mock import patch, MagicMock

from models import db, ExerciseTemplate


def _basic_auth(password):
    token = base64.b64encode(f'anyuser:{password}'.encode()).decode()
    return {'Authorization': f'Basic {token}'}


ADMIN_ROUTES = [
    ('get', '/admin/exercises'),
    ('get', '/admin/exercises/data'),
    ('post', '/admin/exercises/1/image'),
    ('get', '/admin/exercises/1/suggest'),
    ('get', '/admin/exercises/image-proxy/0025'),
    ('post', '/admin/exercises/1/apply-suggestion'),
]


def _make_exercise(app, **overrides):
    with app.app_context():
        ex = ExerciseTemplate(
            name=overrides.get('name', 'Bench Press'),
            equipment=overrides.get('equipment', 'Barbell'),
            image_url=overrides.get('image_url'),
            user_id=overrides.get('user_id'),
        )
        db.session.add(ex)
        db.session.commit()
        return ex.id


class TestAdminAuthGuard:

    def test_every_admin_route_rejects_no_credentials(self, client):
        for method, path in ADMIN_ROUTES:
            res = getattr(client, method)(path)
            assert res.status_code == 401, f'{method.upper()} {path} did not require auth'
            assert 'WWW-Authenticate' in res.headers

    def test_every_admin_route_rejects_wrong_password(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'correct-horse')
        for method, path in ADMIN_ROUTES:
            res = getattr(client, method)(path, headers=_basic_auth('wrong-password'))
            assert res.status_code == 401, f'{method.upper()} {path} accepted a wrong password'

    def test_rejects_any_password_when_admin_password_env_unset(self, client, monkeypatch):
        monkeypatch.delenv('ADMIN_PASSWORD', raising=False)
        res = client.get('/admin/exercises', headers=_basic_auth('anything'))
        assert res.status_code == 401

    def test_correct_password_is_accepted(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'correct-horse')
        res = client.get('/admin/exercises', headers=_basic_auth('correct-horse'))
        assert res.status_code == 200


class TestAdminExercisesPage:

    def test_returns_html(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        res = client.get('/admin/exercises', headers=_basic_auth('pw'))
        assert res.status_code == 200
        assert res.content_type.startswith('text/html')


class TestAdminExercisesData:

    def test_returns_all_exercises_with_expected_fields(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        _make_exercise(app, name='Squat', equipment='Barbell')

        res = client.get('/admin/exercises/data', headers=_basic_auth('pw'))
        assert res.status_code == 200
        data = res.get_json()
        assert len(data) == 1
        ex = data[0]
        for field in ('id', 'name', 'equipment', 'muscle_group', 'exercise_type', 'image_url', 'is_custom'):
            assert field in ex

    def test_distinguishes_custom_from_global_exercises(self, app, client, registered_user, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        _make_exercise(app, name='Global Lift')
        _make_exercise(app, name='My Custom Lift', user_id=registered_user['user']['id'])

        res = client.get('/admin/exercises/data', headers=_basic_auth('pw'))
        by_name = {e['name']: e for e in res.get_json()}
        assert by_name['Global Lift']['is_custom'] is False
        assert by_name['My Custom Lift']['is_custom'] is True


class TestUpdateExerciseImage:

    def test_returns_404_for_missing_exercise(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        res = client.post('/admin/exercises/99999/image', json={'image_url': 'http://x/y.gif'},
                           headers=_basic_auth('pw'))
        assert res.status_code == 404

    def test_sets_image_url(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app)

        res = client.post(f'/admin/exercises/{ex_id}/image', json={'image_url': 'http://x/y.gif'},
                           headers=_basic_auth('pw'))
        assert res.status_code == 200
        with app.app_context():
            ex = db.session.get(ExerciseTemplate, ex_id)
            assert ex.image_url == 'http://x/y.gif'

    def test_empty_url_clears_the_image(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app, image_url='http://old/img.gif')

        res = client.post(f'/admin/exercises/{ex_id}/image', json={'image_url': ''},
                           headers=_basic_auth('pw'))
        assert res.status_code == 200
        with app.app_context():
            ex = db.session.get(ExerciseTemplate, ex_id)
            assert ex.image_url is None


class TestSuggestExerciseImage:

    def test_returns_404_for_missing_exercise(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        res = client.get('/admin/exercises/99999/suggest', headers=_basic_auth('pw'))
        assert res.status_code == 404

    def test_returns_503_when_rapidapi_key_not_configured(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.delenv('RAPIDAPI_KEY', raising=False)
        ex_id = _make_exercise(app)

        res = client.get(f'/admin/exercises/{ex_id}/suggest', headers=_basic_auth('pw'))
        assert res.status_code == 503

    def test_sorts_equipment_matches_first_and_proxies_thumbnails(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        ex_id = _make_exercise(app, name='Bench Press', equipment='Barbell')

        fake_response = MagicMock()
        fake_response.raise_for_status = MagicMock()
        fake_response.json.return_value = [
            {'id': '0001', 'name': 'bench press', 'equipment': 'dumbbell'},
            {'id': '0002', 'name': 'bench press', 'equipment': 'barbell'},
        ]
        with patch('routes.admin_routes.http_requests.get', return_value=fake_response) as mock_get:
            res = client.get(f'/admin/exercises/{ex_id}/suggest', headers=_basic_auth('pw'))

        assert res.status_code == 200
        data = res.get_json()
        assert len(data) == 2
        # Barbell (matching this exercise's equipment) sorts first
        assert data[0]['equipment'] == 'barbell'
        assert data[0]['exercisedbId'] == '0002'
        assert data[0]['gifUrl'] == '/admin/exercises/image-proxy/0002'
        # Query defaults to the exercise's own name, lowercased
        called_url = mock_get.call_args[0][0]
        assert 'bench%20press' in called_url or 'bench+press' in called_url

    def test_q_param_overrides_the_default_query(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        ex_id = _make_exercise(app, name='Bench Press', equipment='Barbell')

        fake_response = MagicMock()
        fake_response.raise_for_status = MagicMock()
        fake_response.json.return_value = []
        with patch('routes.admin_routes.http_requests.get', return_value=fake_response) as mock_get:
            client.get(f'/admin/exercises/{ex_id}/suggest?q=incline+press', headers=_basic_auth('pw'))

        called_url = mock_get.call_args[0][0]
        assert 'incline' in called_url

    def test_limits_results_to_20(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        ex_id = _make_exercise(app)

        fake_response = MagicMock()
        fake_response.raise_for_status = MagicMock()
        fake_response.json.return_value = [
            {'id': str(i), 'name': 'x', 'equipment': 'barbell'} for i in range(30)
        ]
        with patch('routes.admin_routes.http_requests.get', return_value=fake_response):
            res = client.get(f'/admin/exercises/{ex_id}/suggest', headers=_basic_auth('pw'))

        assert len(res.get_json()) == 20

    def test_surfaces_rapidapi_error_message_on_failure(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        ex_id = _make_exercise(app)

        error_response = MagicMock()
        error_response.json.return_value = {'message': 'monthly quota exceeded'}
        exc = Exception('429 Client Error')
        exc.response = error_response
        with patch('routes.admin_routes.http_requests.get', side_effect=exc):
            res = client.get(f'/admin/exercises/{ex_id}/suggest', headers=_basic_auth('pw'))

        assert res.status_code == 502
        assert res.get_json()['message'] == 'monthly quota exceeded'


class TestExerciseImageProxy:

    def test_returns_503_when_rapidapi_key_not_configured(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.delenv('RAPIDAPI_KEY', raising=False)
        res = client.get('/admin/exercises/image-proxy/0025', headers=_basic_auth('pw'))
        assert res.status_code == 503

    def test_streams_the_image_content_and_mimetype(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')

        fake_response = MagicMock()
        fake_response.raise_for_status = MagicMock()
        fake_response.content = b'gif-bytes'
        fake_response.headers = {'Content-Type': 'image/gif'}
        with patch('routes.admin_routes.http_requests.get', return_value=fake_response):
            res = client.get('/admin/exercises/image-proxy/0025', headers=_basic_auth('pw'))

        assert res.status_code == 200
        assert res.data == b'gif-bytes'
        assert res.content_type == 'image/gif'

    def test_returns_502_when_the_upstream_request_fails(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        with patch('routes.admin_routes.http_requests.get', side_effect=Exception('timeout')):
            res = client.get('/admin/exercises/image-proxy/0025', headers=_basic_auth('pw'))
        assert res.status_code == 502


class TestApplyExerciseSuggestion:

    def test_returns_404_for_missing_exercise(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        res = client.post('/admin/exercises/99999/apply-suggestion', json={'exercisedb_id': '0025'},
                           headers=_basic_auth('pw'))
        assert res.status_code == 404

    def test_requires_exercisedb_id(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app)
        res = client.post(f'/admin/exercises/{ex_id}/apply-suggestion', json={}, headers=_basic_auth('pw'))
        assert res.status_code == 400

    def test_returns_503_when_rapidapi_key_not_configured(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.delenv('RAPIDAPI_KEY', raising=False)
        ex_id = _make_exercise(app)
        res = client.post(f'/admin/exercises/{ex_id}/apply-suggestion', json={'exercisedb_id': '0025'},
                           headers=_basic_auth('pw'))
        assert res.status_code == 503

    def test_returns_502_when_the_download_fails(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        ex_id = _make_exercise(app)
        with patch('routes.admin_routes.http_requests.get', side_effect=Exception('timeout')):
            res = client.post(f'/admin/exercises/{ex_id}/apply-suggestion', json={'exercisedb_id': '0025'},
                               headers=_basic_auth('pw'))
        assert res.status_code == 502

    def test_downloads_and_saves_the_image_and_updates_the_exercise(self, app, client, monkeypatch, tmp_path):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        ex_id = _make_exercise(app)
        monkeypatch.setattr(app, 'static_folder', str(tmp_path))

        fake_response = MagicMock()
        fake_response.raise_for_status = MagicMock()
        fake_response.content = b'gif-bytes'
        with patch('routes.admin_routes.http_requests.get', return_value=fake_response):
            res = client.post(f'/admin/exercises/{ex_id}/apply-suggestion', json={'exercisedb_id': '0025'},
                               headers=_basic_auth('pw'))

        assert res.status_code == 200
        expected_url = f'/static/exercise_images/{ex_id}.gif'
        assert res.get_json()['image_url'] == expected_url

        saved_path = tmp_path / 'exercise_images' / f'{ex_id}.gif'
        assert saved_path.read_bytes() == b'gif-bytes'

        with app.app_context():
            ex = db.session.get(ExerciseTemplate, ex_id)
            assert ex.image_url == expected_url
