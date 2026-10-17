"""
Tests for /admin/* — HTTP Basic Auth (ADMIN_PASSWORD) protected exercise
image review tools. Had zero coverage before this file: the auth guard
itself, the RapidAPI/ExerciseDB integration, and the file-write path in
apply-suggestion were all previously unverified.
"""
import base64

import pytest
from unittest.mock import patch, MagicMock

from models import db, AdminAuditLog, ExerciseTemplate


def _basic_auth(password):
    token = base64.b64encode(f'anyuser:{password}'.encode()).decode()
    return {'Authorization': f'Basic {token}'}


def _write_auth(password):
    # Writes also need our own Origin (the test client's host is localhost)
    return {**_basic_auth(password), 'Origin': 'http://localhost'}


ADMIN_ROUTES = [
    ('get', '/admin/'),
    ('get', '/admin/audit'),
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
                           headers=_write_auth('pw'))
        assert res.status_code == 404

    def test_sets_image_url(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app)

        res = client.post(f'/admin/exercises/{ex_id}/image', json={'image_url': 'http://x/y.gif'},
                           headers=_write_auth('pw'))
        assert res.status_code == 200
        with app.app_context():
            ex = db.session.get(ExerciseTemplate, ex_id)
            assert ex.image_url == 'http://x/y.gif'

    def test_empty_url_clears_the_image(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app, image_url='http://old/img.gif')

        res = client.post(f'/admin/exercises/{ex_id}/image', json={'image_url': ''},
                           headers=_write_auth('pw'))
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

    def test_slash_in_query_cannot_walk_the_upstream_path(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        ex_id = _make_exercise(app)

        fake_response = MagicMock()
        fake_response.raise_for_status = MagicMock()
        fake_response.json.return_value = []
        with patch('routes.admin_routes.http_requests.get', return_value=fake_response) as mock_get:
            client.get(f'/admin/exercises/{ex_id}/suggest?q=../../status', headers=_basic_auth('pw'))

        called_url = mock_get.call_args[0][0]
        assert called_url.startswith('https://exercisedb.p.rapidapi.com/exercises/name/')
        assert '/../' not in called_url and '..%2F..%2Fstatus' in called_url

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
                           headers=_write_auth('pw'))
        assert res.status_code == 404

    def test_requires_exercisedb_id(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app)
        res = client.post(f'/admin/exercises/{ex_id}/apply-suggestion', json={}, headers=_write_auth('pw'))
        assert res.status_code == 400

    def test_returns_503_when_rapidapi_key_not_configured(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.delenv('RAPIDAPI_KEY', raising=False)
        ex_id = _make_exercise(app)
        res = client.post(f'/admin/exercises/{ex_id}/apply-suggestion', json={'exercisedb_id': '0025'},
                           headers=_write_auth('pw'))
        assert res.status_code == 503

    def test_returns_502_when_the_download_fails(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        ex_id = _make_exercise(app)
        with patch('routes.admin_routes.http_requests.get', side_effect=Exception('timeout')):
            res = client.post(f'/admin/exercises/{ex_id}/apply-suggestion', json={'exercisedb_id': '0025'},
                               headers=_write_auth('pw'))
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
                               headers=_write_auth('pw'))

        assert res.status_code == 200
        expected_url = f'/static/exercise_images/{ex_id}.gif'
        assert res.get_json()['image_url'] == expected_url

        saved_path = tmp_path / 'exercise_images' / f'{ex_id}.gif'
        assert saved_path.read_bytes() == b'gif-bytes'

        with app.app_context():
            ex = db.session.get(ExerciseTemplate, ex_id)
            assert ex.image_url == expected_url


class TestAdminHome:

    def test_redirects_to_the_exercises_page(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        res = client.get('/admin/', headers=_basic_auth('pw'))
        assert res.status_code == 302
        assert res.headers['Location'].endswith('/admin/exercises')

    def test_pages_share_the_nav(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        for path in ('/admin/exercises', '/admin/audit'):
            html = client.get(path, headers=_basic_auth('pw')).get_data(as_text=True)
            assert 'href="/admin/exercises"' in html and 'href="/admin/audit"' in html, path


class TestAdminWriteGuard:

    WRITES = ['/admin/exercises/{id}/image', '/admin/exercises/{id}/apply-suggestion']

    def test_rejects_a_foreign_origin(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app, image_url='http://old/img.gif')
        for path in self.WRITES:
            res = client.post(path.format(id=ex_id), json={'image_url': 'http://evil/x.gif', 'exercisedb_id': '1'},
                              headers={**_basic_auth('pw'), 'Origin': 'https://evil.example'})
            assert res.status_code == 403, path
        with app.app_context():
            assert db.session.get(ExerciseTemplate, ex_id).image_url == 'http://old/img.gif'

    def test_rejects_a_missing_origin(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app)
        res = client.post(f'/admin/exercises/{ex_id}/image', json={'image_url': 'http://x/y.gif'},
                          headers=_basic_auth('pw'))
        assert res.status_code == 403

    def test_rejects_a_form_body_from_our_own_origin(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app, image_url='http://old/img.gif')
        res = client.post(f'/admin/exercises/{ex_id}/image', data={'image_url': 'http://x/y.gif'},
                          headers=_write_auth('pw'))
        assert res.status_code == 403
        with app.app_context():
            assert db.session.get(ExerciseTemplate, ex_id).image_url == 'http://old/img.gif'

    def test_an_https_origin_matches_behind_the_proxy(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app)
        res = client.post(f'/admin/exercises/{ex_id}/image', json={'image_url': 'http://x/y.gif'},
                          headers={**_basic_auth('pw'), 'Origin': 'https://localhost'})
        assert res.status_code == 200

    def test_auth_is_checked_before_the_origin(self, app, client):
        ex_id = _make_exercise(app)
        res = client.post(f'/admin/exercises/{ex_id}/image', data='x')
        assert res.status_code == 401


class TestAdminAuditLog:

    def test_image_save_writes_before_and_after(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app, image_url='http://old/img.gif')
        client.post(f'/admin/exercises/{ex_id}/image', json={'image_url': 'http://new/img.gif'},
                    headers=_write_auth('pw'))
        with app.app_context():
            row = AdminAuditLog.query.one()
            assert (row.action, row.target_type, row.target_id) == ('exercise.image.set', 'exercise', ex_id)
            assert row.before == {'image_url': 'http://old/img.gif'}
            assert row.after == {'image_url': 'http://new/img.gif'}

    def test_applied_suggestion_records_the_exercisedb_id(self, app, client, monkeypatch, tmp_path):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        monkeypatch.setattr(app, 'static_folder', str(tmp_path))
        ex_id = _make_exercise(app)
        fake_response = MagicMock()
        fake_response.raise_for_status = MagicMock()
        fake_response.content = b'gif-bytes'
        with patch('routes.admin_routes.http_requests.get', return_value=fake_response):
            client.post(f'/admin/exercises/{ex_id}/apply-suggestion', json={'exercisedb_id': '0025'},
                        headers=_write_auth('pw'))
        with app.app_context():
            row = AdminAuditLog.query.one()
            assert row.action == 'exercise.image.apply_suggestion'
            assert row.before == {'image_url': None}
            assert row.after == {'image_url': f'/static/exercise_images/{ex_id}.gif', 'exercisedb_id': '0025'}

    def test_refused_and_failed_writes_leave_no_row(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        monkeypatch.setenv('RAPIDAPI_KEY', 'rk')
        ex_id = _make_exercise(app)
        client.post(f'/admin/exercises/{ex_id}/image', json={'image_url': 'x'}, headers=_basic_auth('pw'))
        client.post('/admin/exercises/99999/image', json={'image_url': 'x'}, headers=_write_auth('pw'))
        with patch('routes.admin_routes.http_requests.get', side_effect=Exception('timeout')):
            client.post(f'/admin/exercises/{ex_id}/apply-suggestion', json={'exercisedb_id': '1'},
                        headers=_write_auth('pw'))
        with app.app_context():
            assert AdminAuditLog.query.count() == 0

    def test_audit_page_lists_rows_newest_first(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        # Two exercises, so neither row's "before" holds the other's URL
        for name, url in (('First', 'http://first/a.gif'), ('Second', 'http://second/b.gif')):
            ex_id = _make_exercise(app, name=name)
            client.post(f'/admin/exercises/{ex_id}/image', json={'image_url': url}, headers=_write_auth('pw'))
        html = client.get('/admin/audit', headers=_basic_auth('pw')).get_data(as_text=True)
        assert 'exercise.image.set' in html
        assert html.index('second/b.gif') < html.index('first/a.gif')

    def test_audit_page_escapes_stored_values(self, app, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        ex_id = _make_exercise(app)
        client.post(f'/admin/exercises/{ex_id}/image', json={'image_url': '<script>alert(1)</script>'},
                    headers=_write_auth('pw'))
        html = client.get('/admin/audit', headers=_basic_auth('pw')).get_data(as_text=True)
        assert '<script>alert(1)</script>' not in html

    def test_empty_audit_page(self, client, monkeypatch):
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        res = client.get('/admin/audit', headers=_basic_auth('pw'))
        assert res.status_code == 200
        assert 'No admin writes yet' in res.get_data(as_text=True)


class TestAdminLoginRateLimit:
    """The shared suite app starts with limiting off, and Flask-Limiter only
    installs its request hooks (which blueprint limits run in) when it starts
    on. So these build their own app with limiting on."""

    @pytest.fixture
    def limited_client(self, monkeypatch):
        from app import create_app
        from limiter import limiter
        monkeypatch.setenv('ADMIN_PASSWORD', 'pw')
        limited_app = create_app(test_config={
            'TESTING': True,
            'RATELIMIT_ENABLED': True,
            'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
            'JWT_SECRET_KEY': 'test-secret-key',
        })
        limiter.reset()
        with limited_app.app_context():
            db.create_all()
            yield limited_app.test_client()
            db.session.remove()
            db.drop_all()
        limiter.enabled = False
        limiter.reset()

    def test_twenty_failed_logins_lock_the_admin(self, limited_client):
        codes = [limited_client.get('/admin/exercises', headers=_basic_auth('wrong')).status_code for _ in range(21)]
        assert codes[:20] == [401] * 20
        assert codes[20] == 429
        # The right password is locked out too until the window passes
        assert limited_client.get('/admin/exercises', headers=_basic_auth('pw')).status_code == 429

    def test_successful_requests_are_not_counted(self, limited_client):
        for _ in range(25):
            assert limited_client.get('/admin/exercises/data', headers=_basic_auth('pw')).status_code == 200
        assert limited_client.get('/admin/exercises', headers=_basic_auth('wrong')).status_code == 401

    def test_failures_on_different_admin_routes_share_one_counter(self, limited_client):
        for i in range(20):
            path = '/admin/exercises' if i % 2 else '/admin/audit'
            assert limited_client.get(path, headers=_basic_auth('wrong')).status_code == 401
        assert limited_client.get('/admin/exercises/data', headers=_basic_auth('wrong')).status_code == 429
