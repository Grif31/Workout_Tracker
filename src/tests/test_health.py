def test_health_returns_ok(client):
    res = client.get('/health')
    assert res.status_code == 200
    data = res.get_json()
    assert data['status'] == 'ok'
    assert data['db'] == 'ok'


def test_health_requires_no_auth(client):
    # No Authorization header — must still succeed (uptime monitors have no JWT)
    res = client.get('/health', headers={})
    assert res.status_code == 200
