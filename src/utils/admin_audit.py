from flask import request

from models import db, AdminAuditLog


def audit(action, target_type, target_id, before, after):
    """Adds the audit row to the session, so it commits (or rolls back) with
    the write it records."""
    db.session.add(AdminAuditLog(
        action=action,
        target_type=target_type,
        target_id=target_id,
        before=before,
        after=after,
        ip=request.remote_addr,
    ))
