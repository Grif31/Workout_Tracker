from models import db, ExerciseTemplate


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
