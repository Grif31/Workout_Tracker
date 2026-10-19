"""Editing the global exercise library from the admin.

The admin is the source of truth for the fields it edits (owner, 2026-10-17):
seed.py's update flags skip an exercise field that has an admin edit in the
audit log, unless run with --force-admin-edits. So every edit here is
audit-logged under the action FIELD_ACTIONS names, and admin_edited_fields
reads them back.
"""
import re
from collections import defaultdict

from models import db, AdminAuditLog, ExerciseMuscleMapping, ExerciseTemplate
from routes.ai_routes import MUSCLE_MRV
from utils.admin_audit import audit
from utils.exercisedb import normalize

# The muscles the app's volume chart and the AI coach know (MUSCLE_MRV,
# mirrored in constants/volumeLandmarks.ts), plus Cardio for cardio entries.
# Anything else would be a muscle no chart can place.
MUSCLES = list(MUSCLE_MRV) + ['Cardio']

FIELD_ACTIONS = {
    'muscles': ('exercise.muscles.set',),
    'description': ('exercise.description.set',),
    'load_factor': ('exercise.load_factor.set',),
    'image': ('exercise.image.set', 'exercise.image.apply_suggestion'),
}
_ACTION_FIELD = {a: f for f, actions in FIELD_ACTIONS.items() for a in actions}

BODYWEIGHT_EQUIPMENT = {'Bodyweight', 'Weighted'}
LOAD_FACTOR_MAX = 1.5
DESCRIPTION_MAX = 4000


def admin_edited_fields(exercise_ids=None):
    """{exercise_id: {field, ...}} for every library field edited in the admin."""
    q = AdminAuditLog.query.filter(AdminAuditLog.target_type == 'exercise',
                                   AdminAuditLog.action.in_(list(_ACTION_FIELD)))
    if exercise_ids is not None:
        q = q.filter(AdminAuditLog.target_id.in_(list(exercise_ids)))
    out = defaultdict(set)
    for row in q.with_entities(AdminAuditLog.target_id, AdminAuditLog.action):
        out[row.target_id].add(_ACTION_FIELD[row.action])
    return dict(out)


def muscles_of(ex):
    return {'primary': [m.muscle_group for m in ex.muscle_mappings if m.is_primary],
            'secondary': [m.muscle_group for m in ex.muscle_mappings if not m.is_primary]}


class EditError(ValueError):
    pass


def _clean_muscles(value, name):
    if not isinstance(value, list) or not all(isinstance(m, str) for m in value):
        raise EditError(f'{name} must be a list of muscle names')
    cleaned = []
    for m in value:
        m = m.strip()
        if m not in MUSCLES:
            raise EditError(f'Unknown muscle: {m!r}')
        if m not in cleaned:
            cleaned.append(m)
    return cleaned


def apply_edit(ex, data):
    """Applies the fields present in `data` to a library exercise and audits
    each one that changed. Returns the changed field names. Raises EditError
    on anything invalid, before changing anything."""
    if ex.user_id is not None:
        raise EditError("Users' custom exercises can't be edited here")
    plan = []

    if 'primary' in data or 'secondary' in data:
        current = muscles_of(ex)
        primary = _clean_muscles(data.get('primary', current['primary']), 'primary')
        secondary = _clean_muscles(data.get('secondary', current['secondary']), 'secondary')
        if not primary:
            raise EditError('An exercise needs at least one primary muscle')
        if set(primary) & set(secondary):
            raise EditError('A muscle can be primary or secondary, not both')
        new = {'primary': primary, 'secondary': secondary}
        if new != current:
            plan.append(('muscles', current, new))

    if 'description' in data:
        desc = data['description']
        if desc is not None and not isinstance(desc, str):
            raise EditError('description must be text')
        desc = (desc or '').strip() or None
        if desc and len(desc) > DESCRIPTION_MAX:
            raise EditError(f'description is longer than {DESCRIPTION_MAX} characters')
        if desc != ex.description:
            plan.append(('description', ex.description, desc))

    if 'bodyweight_load_factor' in data:
        factor = data['bodyweight_load_factor']
        if ex.equipment not in BODYWEIGHT_EQUIPMENT:
            raise EditError('A load factor only applies to Bodyweight and Weighted exercises')
        if factor is not None:
            if isinstance(factor, bool) or not isinstance(factor, (int, float)) or not 0 < factor <= LOAD_FACTOR_MAX:
                raise EditError(f'bodyweight_load_factor must be above 0 and at most {LOAD_FACTOR_MAX}')
            factor = round(float(factor), 3)
        if factor != ex.bodyweight_load_factor:
            plan.append(('load_factor', ex.bodyweight_load_factor, factor))

    for field, before, after in plan:
        if field == 'muscles':
            ExerciseMuscleMapping.query.filter_by(exercise_template_id=ex.id).delete()
            for m in after['primary']:
                db.session.add(ExerciseMuscleMapping(exercise_template_id=ex.id, muscle_group=m, is_primary=True))
            for m in after['secondary']:
                db.session.add(ExerciseMuscleMapping(exercise_template_id=ex.id, muscle_group=m, is_primary=False))
            db.session.expire(ex, ['muscle_mappings'])
        elif field == 'description':
            ex.description = after
        else:
            ex.bodyweight_load_factor = after
        audit(FIELD_ACTIONS[field][0], 'exercise', ex.id, {field: before}, {field: after})
    return [field for field, _, _ in plan]


def _tokens(name):
    return set(normalize(name))


def custom_candidates(limit=100):
    """Users' custom exercises grouped by trimmed lowercase name and
    equipment, most users first, each with the closest library exercise by
    shared words, so a near-duplicate of the library is obvious."""
    library = ExerciseTemplate.query.filter(ExerciseTemplate.user_id.is_(None)).all()
    lib_tokens = [(ex, _tokens(ex.name)) for ex in library]
    groups = {}
    for ex in ExerciseTemplate.query.filter(ExerciseTemplate.user_id.isnot(None)).all():
        key = (re.sub(r'\s+', ' ', ex.name.strip().lower()), ex.equipment or '')
        g = groups.setdefault(key, {'name': ex.name.strip(), 'equipment': ex.equipment or '',
                                    'users': set(), 'exercises': 0})
        g['users'].add(ex.user_id)
        g['exercises'] += 1
    out = []
    for g in groups.values():
        toks = _tokens(g['name'])
        best, best_score = None, 0.0
        for ex, lt in lib_tokens:
            if not toks or not lt:
                continue
            score = len(toks & lt) / len(toks | lt)
            if ex.equipment == g['equipment'] and g['equipment']:
                score += 0.05
            if score > best_score:
                best, best_score = ex, score
        out.append({'name': g['name'], 'equipment': g['equipment'], 'users': len(g['users']),
                    'exercises': g['exercises'],
                    'closest': best if best_score >= 0.5 else None,
                    'same': bool(best and best_score >= 1.0)})
    out.sort(key=lambda c: (-c['users'], c['name'].lower()))
    return out[:limit]
