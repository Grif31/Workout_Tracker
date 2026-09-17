from datetime import date, datetime, timedelta, timezone

from flask import has_request_context, request

LOCAL_DATE_HEADER = 'X-Local-Date'


def user_today() -> date:
    """The requesting user's calendar date.

    The server runs on UTC, so date.today() rolls every "this week" over to
    Monday on Sunday afternoon/evening in the Americas. The app sends its local
    date in X-Local-Date (older builds may pass ?local_date=). It is only
    trusted within a day of UTC, which covers every real timezone, so a client
    can't send an old date to revive a lapsed streak.
    """
    if has_request_context():
        raw = request.headers.get(LOCAL_DATE_HEADER) or request.args.get('local_date')
        if raw:
            try:
                claimed = date.fromisoformat(raw)
            except ValueError:
                claimed = None
            utc_today = datetime.now(timezone.utc).date()
            if claimed and abs((claimed - utc_today).days) <= 1:
                return claimed
    return date.today()
