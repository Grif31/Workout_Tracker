"""
Tests for measurement + progress-photo routes:
  GET    /api/measurements
  POST   /api/measurements
  DELETE /api/measurements/<id>
  GET    /api/progress-photos
  POST   /api/progress-photos
  DELETE /api/progress-photos/<id>
"""
import io
import os
import pytest


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


@pytest.fixture
def tmp_static(app, tmp_path, monkeypatch):
    """Point the app's static folder at a throwaway dir so photo uploads
    don't write into the real src/static tree."""
    monkeypatch.setattr(app, 'static_folder', str(tmp_path), raising=False)
    return tmp_path


def _png_bytes(size=64):
    return io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'0' * size)


# ---------------------------------------------------------------------------
# GET /api/measurements
# ---------------------------------------------------------------------------

class TestGetMeasurements:

    def test_requires_auth(self, client):
        assert client.get('/api/measurements').status_code == 401

    def test_empty_by_default(self, client, auth_token):
        res = client.get('/api/measurements', headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json() == []

    def test_returns_entries_newest_first(self, client, auth_token):
        h = auth_headers(auth_token)
        client.post('/api/measurements', json={'waist': 32, 'date': '2024-01-01'}, headers=h)
        client.post('/api/measurements', json={'waist': 31, 'date': '2024-03-01'}, headers=h)
        rows = client.get('/api/measurements', headers=h).get_json()
        assert [r['waist'] for r in rows] == [31, 32]

    def test_scoped_to_current_user(self, client, auth_token, auth_token2):
        client.post('/api/measurements', json={'waist': 32}, headers=auth_headers(auth_token))
        rows = client.get('/api/measurements', headers=auth_headers(auth_token2)).get_json()
        assert rows == []


# ---------------------------------------------------------------------------
# POST /api/measurements
# ---------------------------------------------------------------------------

class TestCreateMeasurement:

    def test_requires_auth(self, client):
        assert client.post('/api/measurements', json={'waist': 32}).status_code == 401

    def test_creates_and_returns_entry(self, client, auth_token):
        res = client.post('/api/measurements', json={
            'waist': 32.5, 'chest': 40, 'right_arm': 15, 'left_arm': 15,
            'right_leg': 24, 'left_leg': 24,
        }, headers=auth_headers(auth_token))
        assert res.status_code == 201
        data = res.get_json()
        assert isinstance(data['id'], int)
        assert data['waist'] == 32.5
        assert data['chest'] == 40

    def test_partial_fields_null_the_rest(self, client, auth_token):
        res = client.post('/api/measurements', json={'chest': 41},
                          headers=auth_headers(auth_token))
        data = res.get_json()
        assert data['chest'] == 41
        assert data['waist'] is None
        assert data['left_leg'] is None

    def test_rejects_empty_body(self, client, auth_token):
        res = client.post('/api/measurements', json={}, headers=auth_headers(auth_token))
        assert res.status_code == 400
        assert 'message' in res.get_json()

    def test_rejects_date_only_no_measurements(self, client, auth_token):
        res = client.post('/api/measurements', json={'date': '2024-01-01'},
                          headers=auth_headers(auth_token))
        assert res.status_code == 400

    def test_explicit_date_is_stored(self, client, auth_token):
        res = client.post('/api/measurements', json={'waist': 30, 'date': '2023-06-15'},
                          headers=auth_headers(auth_token))
        assert res.get_json()['date'].startswith('2023-06-15')

    def test_entry_appears_in_list(self, client, auth_token):
        h = auth_headers(auth_token)
        client.post('/api/measurements', json={'waist': 33}, headers=h)
        rows = client.get('/api/measurements', headers=h).get_json()
        assert len(rows) == 1 and rows[0]['waist'] == 33


# ---------------------------------------------------------------------------
# DELETE /api/measurements/<id>
# ---------------------------------------------------------------------------

class TestDeleteMeasurement:

    def _create(self, client, token, **fields):
        return client.post('/api/measurements', json=fields or {'waist': 32},
                           headers=auth_headers(token)).get_json()['id']

    def test_requires_auth(self, client):
        assert client.delete('/api/measurements/1').status_code == 401

    def test_deletes_own_entry(self, client, auth_token):
        h = auth_headers(auth_token)
        entry_id = self._create(client, auth_token)
        res = client.delete(f'/api/measurements/{entry_id}', headers=h)
        assert res.status_code == 200
        assert client.get('/api/measurements', headers=h).get_json() == []

    def test_missing_entry_returns_404(self, client, auth_token):
        res = client.delete('/api/measurements/99999', headers=auth_headers(auth_token))
        assert res.status_code == 404

    def test_cannot_delete_another_users_entry(self, client, auth_token, auth_token2):
        entry_id = self._create(client, auth_token)
        res = client.delete(f'/api/measurements/{entry_id}', headers=auth_headers(auth_token2))
        assert res.status_code == 404
        # still there for the owner
        rows = client.get('/api/measurements', headers=auth_headers(auth_token)).get_json()
        assert len(rows) == 1


# ---------------------------------------------------------------------------
# GET /api/progress-photos
# ---------------------------------------------------------------------------

class TestGetProgressPhotos:

    def test_requires_auth(self, client):
        assert client.get('/api/progress-photos').status_code == 401

    def test_empty_by_default(self, client, auth_token):
        res = client.get('/api/progress-photos', headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json() == []


# ---------------------------------------------------------------------------
# POST /api/progress-photos
# ---------------------------------------------------------------------------

class TestUploadProgressPhoto:

    def _upload(self, client, token, tmp_static, filename='progress.png', data=None, **form):
        payload = {'photo': (data or _png_bytes(), filename)}
        payload.update(form)
        return client.post(
            '/api/progress-photos', data=payload,
            content_type='multipart/form-data', headers=auth_headers(token),
        )

    def test_requires_auth(self, client, tmp_static):
        res = client.post('/api/progress-photos', data={'photo': (_png_bytes(), 'p.png')},
                          content_type='multipart/form-data')
        assert res.status_code == 401

    def test_upload_success_writes_row_and_file(self, client, auth_token, tmp_static):
        res = self._upload(client, auth_token, tmp_static)
        assert res.status_code == 201
        data = res.get_json()
        assert data['photo_url'].endswith('.png')
        assert '/static/progress_photos/' in data['photo_url']
        files = os.listdir(tmp_static / 'progress_photos')
        assert len(files) == 1

    def test_upload_appears_in_list(self, client, auth_token, tmp_static):
        self._upload(client, auth_token, tmp_static)
        rows = client.get('/api/progress-photos', headers=auth_headers(auth_token)).get_json()
        assert len(rows) == 1

    def test_notes_are_stored(self, client, auth_token, tmp_static):
        res = self._upload(client, auth_token, tmp_static, notes='  week 1  ')
        assert res.get_json()['notes'] == 'week 1'

    def test_missing_file_returns_400(self, client, auth_token, tmp_static):
        res = client.post('/api/progress-photos', data={'notes': 'x'},
                          content_type='multipart/form-data',
                          headers=auth_headers(auth_token))
        assert res.status_code == 400

    def test_disallowed_extension_returns_400(self, client, auth_token, tmp_static):
        res = self._upload(client, auth_token, tmp_static, filename='notes.pdf')
        assert res.status_code == 400
        assert 'not allowed' in res.get_json()['message'].lower()

    def test_oversized_file_returns_400(self, client, auth_token, tmp_static):
        big = io.BytesIO(b'0' * (5 * 1024 * 1024 + 1))
        res = self._upload(client, auth_token, tmp_static, data=big)
        assert res.status_code == 400
        assert 'large' in res.get_json()['message'].lower()


# ---------------------------------------------------------------------------
# DELETE /api/progress-photos/<id>
# ---------------------------------------------------------------------------

class TestDeleteProgressPhoto:

    def _upload(self, client, token, tmp_static):
        res = client.post(
            '/api/progress-photos',
            data={'photo': (_png_bytes(), 'p.png')},
            content_type='multipart/form-data', headers=auth_headers(token),
        )
        return res.get_json()['id']

    def test_requires_auth(self, client):
        assert client.delete('/api/progress-photos/1').status_code == 401

    def test_deletes_own_photo_and_file(self, client, auth_token, tmp_static):
        h = auth_headers(auth_token)
        photo_id = self._upload(client, auth_token, tmp_static)
        assert os.listdir(tmp_static / 'progress_photos')  # file exists
        res = client.delete(f'/api/progress-photos/{photo_id}', headers=h)
        assert res.status_code == 200
        assert client.get('/api/progress-photos', headers=h).get_json() == []
        assert os.listdir(tmp_static / 'progress_photos') == []

    def test_missing_photo_returns_404(self, client, auth_token, tmp_static):
        res = client.delete('/api/progress-photos/99999', headers=auth_headers(auth_token))
        assert res.status_code == 404

    def test_cannot_delete_another_users_photo(self, client, auth_token, auth_token2, tmp_static):
        photo_id = self._upload(client, auth_token, tmp_static)
        res = client.delete(f'/api/progress-photos/{photo_id}', headers=auth_headers(auth_token2))
        assert res.status_code == 404
        rows = client.get('/api/progress-photos', headers=auth_headers(auth_token)).get_json()
        assert len(rows) == 1
