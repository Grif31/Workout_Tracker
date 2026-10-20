"""Every Anthropic call goes through create_message, which logs it to
ai_call_log for the admin's AI usage page."""
import os
import time
from datetime import datetime

from flask import current_app, jsonify
from sqlalchemy import func

from models import db, AiCallLog

# Dollars per million tokens: (input, output). Matched by prefix, so a dated
# id like claude-haiku-4-5-20251001 finds its family. The page labels cost
# an estimate: these are list prices, and a model missing here costs nothing.
PRICES = {
    'claude-haiku-4-5': (1.00, 5.00),
}
# Cache reads bill at a tenth of input, cache writes (5-minute) at 1.25x
CACHE_READ_MULTIPLIER = 0.1
CACHE_WRITE_MULTIPLIER = 1.25


def price_for(model):
    for prefix, price in PRICES.items():
        if model and model.startswith(prefix):
            return price
    return None


def estimate_cost(model, input_tokens, output_tokens, cache_read_tokens=0, cache_write_tokens=0):
    price = price_for(model)
    if not price:
        return 0.0
    per_in, per_out = price
    return ((input_tokens or 0) * per_in
            + (cache_read_tokens or 0) * per_in * CACHE_READ_MULTIPLIER
            + (cache_write_tokens or 0) * per_in * CACHE_WRITE_MULTIPLIER
            + (output_tokens or 0) * per_out) / 1_000_000


# A ceiling on what all users together can spend in a day. Free accounts
# still reach the model (the weekly review's free part, the onboarding
# program), so without one the bill grows with every account someone creates.
DEFAULT_DAILY_BUDGET_USD = 20.0


def daily_budget_usd():
    try:
        return float(os.environ.get('AI_DAILY_BUDGET_USD', DEFAULT_DAILY_BUDGET_USD))
    except ValueError:
        return DEFAULT_DAILY_BUDGET_USD


def spent_today(now=None):
    """Estimated dollars spent since midnight (server time, as ai_call_log is written)."""
    now = now or datetime.now()
    since = now.replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (
        db.session.query(
            AiCallLog.model,
            func.sum(AiCallLog.input_tokens), func.sum(AiCallLog.output_tokens),
            func.sum(AiCallLog.cache_read_tokens), func.sum(AiCallLog.cache_write_tokens),
        )
        .filter(AiCallLog.created_at >= since)
        .group_by(AiCallLog.model)
        .all()
    )
    return sum(estimate_cost(*row) for row in rows)


def daily_budget_spent(now=None):
    return spent_today(now) >= daily_budget_usd()


def budget_spent_response():
    return jsonify({'message': "The Coach has reached today's limit. Try again tomorrow.", 'budget_spent': True}), 503


def _count(usage, field):
    value = getattr(usage, field, None)
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def create_message(endpoint, user_id, api_key, **kwargs):
    """client.messages.create(**kwargs), logged. Raises whatever the call
    raises; the log row is written either way. Commits the session, which is
    safe at the call sites: none has unsaved writes when it calls the model."""
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    start = time.monotonic()
    msg, error = None, None
    try:
        msg = client.messages.create(**kwargs)
        return msg
    except Exception as exc:
        error = f'{type(exc).__name__}: {exc}'[:200]
        raise
    finally:
        _log(endpoint, user_id, kwargs.get('model', ''), msg, error, start)


def _log(endpoint, user_id, model, msg, error, start):
    # A failed log write must never cost the user their insight
    try:
        usage = getattr(msg, 'usage', None)
        db.session.add(AiCallLog(
            endpoint=endpoint,
            user_id=user_id,
            model=model,
            input_tokens=_count(usage, 'input_tokens'),
            output_tokens=_count(usage, 'output_tokens'),
            cache_read_tokens=_count(usage, 'cache_read_input_tokens'),
            cache_write_tokens=_count(usage, 'cache_creation_input_tokens'),
            latency_ms=int((time.monotonic() - start) * 1000),
            ok=error is None,
            error=error,
        ))
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception('Could not log AI call')
