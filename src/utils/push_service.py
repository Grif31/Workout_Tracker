import requests

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

# Expo rejects requests with more than 100 messages
MAX_MESSAGES_PER_REQUEST = 100


def send_push(tokens: list, title: str, body: str, data: dict = None):
    if not tokens:
        return
    messages = [
        {'to': t, 'title': title, 'body': body, 'data': data or {}, 'sound': 'default'}
        for t in tokens
    ]
    for i in range(0, len(messages), MAX_MESSAGES_PER_REQUEST):
        try:
            requests.post(EXPO_PUSH_URL, json=messages[i:i + MAX_MESSAGES_PER_REQUEST], timeout=10)
        except Exception:
            pass
