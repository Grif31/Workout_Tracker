"""
Tests for bodyweight routes:
  GET    /api/bodyweight
  POST   /api/bodyweight
  DELETE /api/bodyweight/<entry_id>
"""


def auth_headers(token):
    return {'Authorization': f'Bearer {token}'}


def log_weight(client, token, weight=185.0, date=None):
    payload = {'weight': weight}
    if date:
        payload['date'] = date
    return client.post('/api/bodyweight', json=payload, headers=auth_headers(token))


# ---------------------------------------------------------------------------
# GET /api/bodyweight
# ---------------------------------------------------------------------------

class TestGetBodyweightLogs:

    def test_returns_empty_list_with_no_entries(self, client, auth_token):
        res = client.get('/api/bodyweight', headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert res.get_json() == []

    def test_returns_logged_entries(self, client, auth_token):
        log_weight(client, auth_token, 185.0)
        res = client.get('/api/bodyweight', headers=auth_headers(auth_token))
        assert res.status_code == 200
        data = res.get_json()
        assert len(data) == 1
        assert data[0]['weight'] == 185.0

    def test_returns_entries_newest_first(self, client, auth_token):
        log_weight(client, auth_token, 180.0, date='2026-01-01T08:00:00')
        log_weight(client, auth_token, 185.0, date='2026-02-01T08:00:00')
        res = client.get('/api/bodyweight', headers=auth_headers(auth_token))
        data = res.get_json()
        assert data[0]['weight'] == 185.0
        assert data[1]['weight'] == 180.0

    def test_only_returns_own_entries(self, client, auth_token, auth_token2):
        log_weight(client, auth_token, 190.0)
        res = client.get('/api/bodyweight', headers=auth_headers(auth_token2))
        assert res.get_json() == []

    def test_requires_auth(self, client):
        res = client.get('/api/bodyweight')
        assert res.status_code == 401

    def test_entry_contains_expected_fields(self, client, auth_token):
        log_weight(client, auth_token, 175.0)
        entry = client.get('/api/bodyweight', headers=auth_headers(auth_token)).get_json()[0]
        assert 'id' in entry
        assert 'weight' in entry
        assert 'date' in entry
        assert 'user_id' in entry


# ---------------------------------------------------------------------------
# POST /api/bodyweight
# ---------------------------------------------------------------------------

class TestLogBodyweight:

    def test_log_weight_success(self, client, auth_token):
        res = log_weight(client, auth_token, 185.0)
        assert res.status_code == 201
        assert res.get_json()['weight'] == 185.0

    def test_log_weight_with_explicit_date(self, client, auth_token):
        res = log_weight(client, auth_token, 180.0, date='2026-03-15T10:00:00')
        assert res.status_code == 201
        assert '2026-03-15' in res.get_json()['date']

    def test_missing_weight_returns_400(self, client, auth_token):
        res = client.post('/api/bodyweight', json={}, headers=auth_headers(auth_token))
        assert res.status_code == 400

    def test_zero_weight_returns_400(self, client, auth_token):
        res = client.post('/api/bodyweight', json={'weight': 0}, headers=auth_headers(auth_token))
        assert res.status_code == 400

    def test_negative_weight_returns_400(self, client, auth_token):
        res = client.post('/api/bodyweight', json={'weight': -10}, headers=auth_headers(auth_token))
        assert res.status_code == 400

    def test_syncs_user_bodyweight_snapshot(self, client, auth_token):
        log_weight(client, auth_token, 195.0)
        me = client.get('/api/me', headers=auth_headers(auth_token)).get_json()
        assert me['bodyweight'] == 195.0

    def test_requires_auth(self, client):
        res = client.post('/api/bodyweight', json={'weight': 180.0})
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/bodyweight/<entry_id>
# ---------------------------------------------------------------------------

class TestDeleteBodyweight:

    def test_delete_own_entry(self, client, auth_token):
        entry_id = log_weight(client, auth_token, 185.0).get_json()['id']
        res = client.delete(f'/api/bodyweight/{entry_id}', headers=auth_headers(auth_token))
        assert res.status_code == 200
        assert client.get('/api/bodyweight', headers=auth_headers(auth_token)).get_json() == []

    def test_delete_returns_404_for_missing_entry(self, client, auth_token):
        res = client.delete('/api/bodyweight/9999', headers=auth_headers(auth_token))
        assert res.status_code == 404

    def test_cannot_delete_other_users_entry(self, client, auth_token, auth_token2):
        entry_id = log_weight(client, auth_token, 185.0).get_json()['id']
        res = client.delete(f'/api/bodyweight/{entry_id}', headers=auth_headers(auth_token2))
        assert res.status_code == 404

    def test_syncs_user_bodyweight_after_deletion(self, client, auth_token):
        log_weight(client, auth_token, 180.0, date='2026-01-01T08:00:00')
        latest_id = log_weight(client, auth_token, 190.0, date='2026-02-01T08:00:00').get_json()['id']
        client.delete(f'/api/bodyweight/{latest_id}', headers=auth_headers(auth_token))
        me = client.get('/api/me', headers=auth_headers(auth_token)).get_json()
        assert me['bodyweight'] == 180.0

    def test_bodyweight_clears_to_none_when_last_entry_deleted(self, client, auth_token):
        entry_id = log_weight(client, auth_token, 185.0).get_json()['id']
        client.delete(f'/api/bodyweight/{entry_id}', headers=auth_headers(auth_token))
        me = client.get('/api/me', headers=auth_headers(auth_token)).get_json()
        assert me['bodyweight'] is None

    def test_requires_auth(self, client):
        res = client.delete('/api/bodyweight/1')
        assert res.status_code == 401
