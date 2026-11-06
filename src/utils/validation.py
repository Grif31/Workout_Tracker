from functools import wraps
from flask import request, jsonify, g
from marshmallow import ValidationError


def _first_error(errs):
    """A field's first message. A nested list's errors are a dict keyed by the
    bad item's index (often not 0) and a nested schema's by field name."""
    while isinstance(errs, dict):
        errs = next(iter(errs.values()))
    return errs[0] if isinstance(errs, list) and errs else errs


def validate_body(schema):
    """Validates request JSON against a marshmallow schema before the route runs.
    On failure returns 400 with {'message': '<field>: <error>'}.
    On success, stores result in flask.g.validated for the route to access.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            body = request.get_json(silent=True) or {}
            try:
                g.validated = schema.load(body)
            except ValidationError as e:
                msgs = '; '.join(
                    f"{field}: {_first_error(errs)}"
                    for field, errs in e.messages.items()
                )
                return jsonify({'message': msgs}), 400
            return fn(*args, **kwargs)
        return wrapper
    return decorator
