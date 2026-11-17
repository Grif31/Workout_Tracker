from models import db, ExerciseTemplate, WorkoutTemplateExercise
from utils.supersets import superset_group_value, normalize_superset_groups


def _visible_to(user_id):
    return db.or_(ExerciseTemplate.user_id.is_(None), ExerciseTemplate.user_id == int(user_id))


def visible_exercises(user_id, ids):
    """Exercises from `ids` that this user may use: the global library plus their own customs.

    Ids arrive from request bodies, and templates echo each exercise's name and
    image back, so an unfiltered lookup would expose other users' private
    custom exercises to anyone who guesses their ids.
    """
    if not ids:
        return []
    return ExerciseTemplate.query.filter(ExerciseTemplate.id.in_(ids), _visible_to(user_id)).all()


def visible_exercise_ids(user_id, ids):
    """`ids` filtered like visible_exercises, keeping the caller's order."""
    allowed = {e.id for e in visible_exercises(user_id, ids)}
    return [i for i in ids if i in allowed]


def add_template_exercises(template_id, user_id, ids, superset_groups=None):
    """Attach the visible exercises from `ids` to a template in the given order.

    Workout templates read their exercises back sorted by
    WorkoutTemplateExercise.order; passing a list to the `exercises`
    relationship leaves that column NULL, so the saved order was arbitrary.

    `superset_groups` runs alongside `ids` (one key or None per id) and is
    paired up before hidden ids are dropped, so a dropped id can't shift the
    groups onto the wrong exercises.
    """
    groups = superset_groups if isinstance(superset_groups, list) else []
    pairs = [(ex_id, superset_group_value(groups[i]) if i < len(groups) else None) for i, ex_id in enumerate(ids)]
    visible = {e.id: e for e in visible_exercises(user_id, ids)}
    rows = []
    for ex_id, group in pairs:
        if ex_id not in visible:
            continue
        row = WorkoutTemplateExercise(
            workout_template_id=template_id,
            exercise_template_id=ex_id,
            order=len(rows),
            superset_group=group,
        )
        row.exercise_type = visible[ex_id].exercise_type
        rows.append(row)
    normalize_superset_groups(rows)
    db.session.add_all(rows)


def current_superset_groups(template_id, ids):
    """Groups for `ids` taken from a template's stored rows, for a save that
    sends exercises without superset_groups (an older app build): each id
    takes the group of its next unused stored row with the same exercise."""
    stored = (WorkoutTemplateExercise.query
              .filter_by(workout_template_id=template_id)
              .order_by(WorkoutTemplateExercise.order, WorkoutTemplateExercise.id)
              .all())
    queues = {}
    for row in stored:
        queues.setdefault(row.exercise_template_id, []).append(row.superset_group)
    return [queues[i].pop(0) if queues.get(i) else None for i in ids]
