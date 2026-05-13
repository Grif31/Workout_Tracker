import requests

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'


def send_push(tokens: list, title: str, body: str, data: dict = None):
    if not tokens:
        return
    messages = [
        {'to': t, 'title': title, 'body': body, 'data': data or {}, 'sound': 'default'}
        for t in tokens
    ]
    try:
        requests.post(EXPO_PUSH_URL, json=messages, timeout=10)
    except Exception:
        pass
