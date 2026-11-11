"""Import workout history from Hevy and Strong CSV exports. Free for everyone:
it's how someone switching apps brings their history along.

The phone sends the file as text. /preview parses it and reports what an
import would do, writing nothing; POST /api/import parses it again (never
trusting the preview) and writes every workout in one transaction.
"""
import hashlib
import re

from flask import Blueprint, current_app, g, jsonify
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from limiter import limiter
from models import db, BodyweightLog, Exercise, ExerciseTemplate, PREvent, Set, User, UserAchievement, Workout
from routes.user_routes import convert_weight_value
from routes.workout_routes import _recompute_prs_for_templates
from schemas import IMPORT_SOURCES, ImportSchema
from utils.achievements import _COUNTED_PR_TYPES_EXCLUDE, distance_unit_for, evaluate_achievements
from utils.importers import ImportFormatError, parse
from utils.importers.matching import ExerciseMatcher
from utils.validation import validate_body
from utils.volume import bodyweight_lookup, derive_bodyweight_load_factor

import_bp = Blueprint('import_bp', __name__)
_import_schema = ImportSchema()

_MAX_DURATION_SECONDS = 24 * 3600


def _cardio_minutes(s):
    return round(s.seconds / 60, 2) if s.seconds else None


def _fits(s, exercise_type):
    """Whether a parsed set can be stored under an exercise of this type: a
    plank matched to the library's timed hold but logged with reps has nowhere to go."""
    if exercise_type == 'cardio':
        return bool(_cardio_minutes(s) or s.distance)
    if exercise_type == 'duration':
        return bool(s.seconds)
    return bool(s.reps or s.weight)


def _client_id(source, workout):
    """Stable per workout, so the unique (user_id, client_id) constraint turns a
    second import of the same file into a no-op and undo finds an app's
    imports by prefix. The app's own client ids are UUIDs: no ':' to collide."""
    digest = hashlib.sha1(f'{workout.start.isoformat()}|{workout.title}'.encode()).hexdigest()
    return f'{source}:{digest}'


def _existing_client_ids(user_id, ids):
    ids, found = list(ids), set()
    for i in range(0, len(ids), 500):
        found.update(cid for (cid,) in db.session.query(Workout.client_id).filter(
            Workout.user_id == user_id, Workout.client_id.in_(ids[i:i + 500])))
    return found


# Time-only sets are a hold (plank, wall sit) unless the title or the length
# says cardio: nobody holds a plank for 10 minutes a set
_CARDIO_TITLE = re.compile(
    r'\b(run|jog|walk|row|bik|cycl|spin|swim|elliptical|stair|step|jump rope|skip|hik|'
    r'treadmill|ski|erg|sprint|cardio|cross trainer|assault|air bike)', re.I)
_LONGEST_HOLD_SECONDS = 600


def _infer_type(title, sets):
    if any(s.distance for s in sets):
        return 'cardio'
    if any(s.seconds for s in sets) and not any(s.reps or s.weight for s in sets):
        if _CARDIO_TITLE.search(title) or any(s.seconds and s.seconds >= _LONGEST_HOLD_SECONDS for s in sets):
            return 'cardio'
        return 'duration'
    return 'strength'


class _Plan:
    """Everything an import would write, resolved without writing."""

    def __init__(self, user, data):
        self.source = data['source']
        parsed = parse(self.source, data['csv'])
        self.unit_in_file = parsed.weight_unit is not None
        self.from_unit = parsed.weight_unit or data.get('weight_unit') or user.weight_unit or 'lbs'
        self.to_unit = user.weight_unit or 'lbs'
        self.distance_unit = distance_unit_for(user)

        ids = [_client_id(self.source, w) for w in parsed.workouts]
        existing = _existing_client_ids(user.id, ids)
        seen = set()
        self.workouts = []
        for cid, w in zip(ids, parsed.workouts):
            if cid in existing or cid in seen:
                continue
            seen.add(cid)
            self.workouts.append((cid, w))
        self.already_imported = len(existing)
        self.first_date = parsed.workouts[0].start
        self.last_date = parsed.workouts[-1].start

        matcher = ExerciseMatcher(user.id)
        self.matcher = matcher
        sets_by_title: dict[str, list] = {}
        for _, w in self.workouts:
            for ex in w.exercises:
                sets_by_title.setdefault(ex.title, []).extend(ex.sets)
        self.matches: dict[str, ExerciseTemplate | None] = {
            title: matcher.match(title, weighted=any(s.weight and s.weight > 0 for s in sets))
            for title, sets in sets_by_title.items()
        }
        self.new_types = {t: _infer_type(t, sets_by_title[t]) for t, m in self.matches.items() if m is None}

        # Drop what can't be stored here, not in _write: the preview then
        # counts what the import will really add, and says what it leaves out
        kept, self.skipped_sets = [], 0
        for cid, w in self.workouts:
            for ex in w.exercises:
                fits = [s for s in ex.sets if _fits(s, self.exercise_type(ex.title))]
                self.skipped_sets += len(ex.sets) - len(fits)
                ex.sets = fits
            w.exercises = [ex for ex in w.exercises if ex.sets]
            if w.exercises:
                kept.append((cid, w))
        self.workouts = kept
        used = {ex.title for _, w in kept for ex in w.exercises}
        self.matches = {t: m for t, m in self.matches.items() if t in used}
        self.new_types = {t: e for t, e in self.new_types.items() if t in used}
        self.set_count = sum(len(ex.sets) for _, w in self.workouts for ex in w.exercises)

    def exercise_type(self, title):
        match = self.matches[title]
        return ((match.exercise_type if match else self.new_types[title]) or 'strength').lower()

    def weight(self, value):
        if value is None or self.from_unit == self.to_unit:
            return value
        return convert_weight_value(value, self.to_unit)

    def preview(self):
        matched = sorted(
            ({'title': t, 'name': m.name, 'equipment': m.equipment} for t, m in self.matches.items() if m),
            key=lambda r: r['title'].lower())
        return {
            'message': 'ok',
            'source': self.source,
            'workouts': len(self.workouts),
            'sets': self.set_count,
            'skipped_sets': self.skipped_sets,
            'already_imported': self.already_imported,
            'first_date': self.first_date.strftime('%Y-%m-%d'),
            'last_date': self.last_date.strftime('%Y-%m-%d'),
            'matched_exercises': matched,
            'new_exercises': sorted(self.new_types, key=str.lower),
            'weight_unit': self.from_unit,
            'unit_in_file': self.unit_in_file,
        }


def _build_sets(plan, parsed_sets, exercise_type):
    sets = []
    for s in parsed_sets:
        if not _fits(s, exercise_type):
            continue
        if exercise_type == 'cardio':
            sets.append(Set(
                set_type='N', cardio_duration=_cardio_minutes(s), distance=s.distance,
                distance_unit=(s.distance_unit or plan.distance_unit) if s.distance else None, rpe=s.rpe,
            ))
        elif exercise_type == 'duration':
            sets.append(Set(set_type=s.set_type, cardio_duration=round(s.seconds / 60, 2), rpe=s.rpe))
        else:
            sets.append(Set(set_type=s.set_type, reps=s.reps, weight=plan.weight(s.weight), rpe=s.rpe))
    for i, s in enumerate(sets):
        s.order = i
    return sets


def _write(user, plan):
    """Add the plan's workouts to the session and return them. The caller commits."""
    templates = dict(plan.matches)
    customs = {}
    for title, etype in plan.new_types.items():
        name, equipment = plan.matcher.custom_identity(title)
        identity = (name.lower(), (equipment or '').lower())
        if identity not in customs:
            customs[identity] = ExerciseTemplate(
                name=name, equipment=equipment, exercise_type=etype, user_id=user.id,
                bodyweight_load_factor=derive_bodyweight_load_factor(name, equipment),
            )
            db.session.add(customs[identity])
        templates[title] = customs[identity]
    db.session.flush()

    # get_bodyweight_at's answer for each date, from one read: a query per
    # workout would also flush every workout added so far
    logs = (db.session.query(BodyweightLog.date, BodyweightLog.weight)
            .filter(BodyweightLog.user_id == user.id).order_by(BodyweightLog.date).all())
    bodyweight_at = bodyweight_lookup(logs)

    workouts = []
    for client_id, w in plan.workouts:
        workout = Workout(
            user_id=user.id, client_id=client_id, name=w.title[:250], notes=w.notes, date=w.start,
            # Workout.duration is minutes, floored as the logging screen's timer is
            duration=(w.duration_seconds // 60 or None) if w.duration_seconds and w.duration_seconds < _MAX_DURATION_SECONDS else None,
            local_start_hour=w.start.hour if w.has_time else None,
        )
        for order, ex in enumerate(w.exercises):
            tmpl = templates[ex.title]
            etype = (tmpl.exercise_type or 'strength').lower()
            sets = _build_sets(plan, ex.sets, etype)
            if sets:
                workout.exercises.append(Exercise(
                    name=tmpl.name, exercise_template_id=tmpl.id, order=order,
                    exercise_type=etype, notes=ex.notes, sets=sets,
                ))
        if not workout.exercises:
            continue
        workout.calculate_volume(weight_unit=plan.to_unit, bodyweight=bodyweight_at(w.start))
        db.session.add(workout)
        workouts.append(workout)
    db.session.flush()
    return workouts, len(customs)


@import_bp.post('/api/import/preview')
@jwt_required()
@limiter.limit('30 per hour', key_func=lambda: f"import_preview:{get_jwt_identity()}")
@validate_body(_import_schema)
def preview_import():
    user = db.session.get(User, int(get_jwt_identity()))
    try:
        plan = _Plan(user, g.validated)
    except ImportFormatError as e:
        return jsonify({'message': str(e)}), 400
    return jsonify(plan.preview()), 200


@import_bp.post('/api/import')
@jwt_required()
@limiter.limit('10 per hour', key_func=lambda: f"import:{get_jwt_identity()}")
@validate_body(_import_schema)
def run_import():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    try:
        plan = _Plan(user, g.validated)
    except ImportFormatError as e:
        return jsonify({'message': str(e)}), 400
    try:
        workouts, exercises_created = _write(user, plan)
        workout_ids = [w.id for w in workouts]
        template_ids = list({ex.exercise_template_id for w in workouts for ex in w.exercises})
        # One chronological replay, not the live save path per workout: the
        # history may sit before workouts already logged here, and the replay
        # links every PREvent's previous_value in date order either way
        _recompute_prs_for_templates(user_id, template_ids)
        pr_count = (PREvent.query.filter(PREvent.user_id == user_id, PREvent.workout_id.in_(workout_ids),
                                         PREvent.pr_type.notin_(_COUNTED_PR_TYPES_EXCLUDE)).count()
                    if workout_ids else 0)
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        if 'client_id' in str(e.orig):
            # The same file sent twice at once: the first import holds the client ids
            return jsonify({'message': 'This file is already being imported.'}), 409
        current_app.logger.exception('POST /api/import failed')
        return jsonify({'message': 'Internal server error'}), 500
    except Exception:
        db.session.rollback()
        current_app.logger.exception('POST /api/import failed')
        return jsonify({'message': 'Internal server error'}), 500

    # Badges the history earned arrive already seen: the app shows one count,
    # not an unlock sheet for each
    try:
        badges = len(evaluate_achievements(user, seen=True))
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception('evaluate_achievements failed after import for user %s', user_id)
        badges = 0

    return jsonify({
        'message': 'ok',
        'imported': len(workouts),
        'already_imported': plan.already_imported,
        'prs': pr_count,
        'badges': badges,
        'exercises_created': exercises_created,
    }), 201


@import_bp.get('/api/import')
@jwt_required()
def import_status():
    """How many workouts each app's import brought in, for the undo rows."""
    user_id = int(get_jwt_identity())
    counts = {
        source: Workout.query.filter(Workout.user_id == user_id, Workout.client_id.like(f'{source}:%')).count()
        for source in IMPORT_SOURCES
    }
    return jsonify({'message': 'ok', 'imported': counts}), 200


@import_bp.delete('/api/import/<source>')
@jwt_required()
@limiter.limit('10 per hour', key_func=lambda: f"import_undo:{get_jwt_identity()}")
def undo_import(source):
    """Remove every workout an app's import brought in. Custom exercises it made
    stay: templates and routines may use them by now."""
    if source not in IMPORT_SOURCES:
        return jsonify({'message': 'Unknown import source'}), 404
    user_id = int(get_jwt_identity())
    ids = [wid for (wid,) in db.session.query(Workout.id).filter(
        Workout.user_id == user_id, Workout.client_id.like(f'{source}:%'))]
    if not ids:
        return jsonify({'message': 'ok', 'removed': 0}), 200
    try:
        template_ids = [tid for (tid,) in db.session.query(Exercise.exercise_template_id).filter(
            Exercise.workout_id.in_(ids)).distinct()]
        # Badges stay; only the link to the workout goes (as delete_workout does)
        UserAchievement.query.filter(UserAchievement.user_id == user_id, UserAchievement.workout_id.in_(ids)).update(
            {'workout_id': None}, synchronize_session=False)
        # Loaded with their exercises and sets in a few queries, so the ORM
        # cascade (sets, best efforts, PR rows pointing at them) doesn't
        # lazy-load per workout
        for i in range(0, len(ids), 500):
            batch = (Workout.query.filter(Workout.id.in_(ids[i:i + 500]))
                     .options(selectinload(Workout.exercises).selectinload(Exercise.sets),
                              selectinload(Workout.exercises).selectinload(Exercise.best_efforts))
                     .all())
            for w in batch:
                db.session.delete(w)
        db.session.flush()
        # One transaction with the delete: a failed replay must not leave the
        # workouts gone and the PRs still counting them
        _recompute_prs_for_templates(user_id, template_ids)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception('DELETE /api/import/%s failed', source)
        return jsonify({'message': 'Internal server error'}), 500
    return jsonify({'message': 'ok', 'removed': len(ids)}), 200
