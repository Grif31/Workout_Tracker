"""PATCH /api/me: an empty height saves, and oversized fields get a 400, not a 500."""


def _h(token):
    return {'Authorization': f'Bearer {token}'}


def test_empty_height_clears_it_instead_of_blocking_the_save(client, auth_token):
    h = _h(auth_token)
    assert client.patch('/api/me', json={'height': 70}, headers=h).get_json()['height'] == 70
    res = client.patch('/api/me', json={'name': 'Griffin', 'height': None}, headers=h)
    assert res.status_code == 200
    assert res.get_json()['height'] is None
    assert res.get_json()['name'] == 'Griffin'


def test_name_longer_than_the_column_is_a_400(client, auth_token):
    res = client.patch('/api/me', json={'name': 'x' * 101}, headers=_h(auth_token))
    assert res.status_code == 400
    assert 'name' in res.get_json()['message']


def test_impossible_height_is_rejected(client, auth_token):
    assert client.patch('/api/me', json={'height': 900}, headers=_h(auth_token)).status_code == 400


def test_profile_says_whether_the_account_has_a_password(client, auth_token):
    assert client.get('/api/me', headers=_h(auth_token)).get_json()['is_social_only'] is False
