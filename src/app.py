import logging
import os
from datetime import timedelta, datetime
from dotenv import load_dotenv
import click
from flask import Flask, jsonify
from flask_migrate import Migrate
from models import db
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from werkzeug.exceptions import HTTPException
from apscheduler.schedulers.background import BackgroundScheduler
from routes.auth_routes import auth_bp
from routes.user_routes import user_bp
from routes.workout_routes import workout_bp
from routes.exercise_routes import exercise_bp
from routes.workout_template_routes import workout_template_bp
from routes.routine_routes import routine_bp
from routes.stats_routes import stats_bp
from routes.strength_score_routes import strength_score_bp
from routes.weekly_summary_routes import weekly_summary_bp
from routes.bodyweight_routes import bodyweight_bp
from routes.personal_record_routes import pr_bp
from routes.ai_routes import ai_bp
from routes.measurement_routes import measurement_bp
from routes.legal_routes import legal_bp
from routes.admin_routes import admin_bp
from routes.health_routes import health_bp
from limiter import limiter
from mail_ext import mail

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)-8s %(name)s  %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)

def create_app(test_config=None):
    app = Flask(__name__)

    _jwt_secret = os.environ.get('JWT_SECRET_KEY', 'dev-secret-key')
    if not (test_config or {}).get('TESTING') and _jwt_secret == 'dev-secret-key':
        import sys
        print('FATAL: JWT_SECRET_KEY env var is missing or not set. '
              'Set it in Railway Variables and redeploy.', file=sys.stderr, flush=True)
        raise RuntimeError('JWT_SECRET_KEY env var must be set in production')
    app.config['JWT_SECRET_KEY'] = _jwt_secret

    if not (test_config or {}).get('TESTING') and not os.environ.get('APPLE_BUNDLE_ID'):
        logging.getLogger(__name__).warning(
            'APPLE_BUNDLE_ID env var is not set — Apple Sign-In will reject all '
            'logins until it is configured (expected: com.aretefitness.app)'
        )
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(minutes=15)
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=30)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///workout_tracker.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_TOKEN_LOCATION'] = ['headers']

    if test_config:
        app.config.update(test_config)

    # Disable rate limiting during tests so fixtures don't hit limits
    app.config.setdefault('RATELIMIT_ENABLED', not app.config.get('TESTING', False))

    _raw_origins = os.environ.get('CORS_ORIGINS', '*')
    _origins = [o.strip() for o in _raw_origins.split(',')] if _raw_origins != '*' else '*'
    CORS(app, origins=_origins)

    app.config['MAIL_SERVER']         = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
    app.config['MAIL_PORT']           = int(os.environ.get('MAIL_PORT', 587))
    app.config['MAIL_USE_TLS']        = os.environ.get('MAIL_USE_TLS', 'true').lower() == 'true'
    app.config['MAIL_USERNAME']       = os.environ.get('MAIL_USERNAME', '')
    app.config['MAIL_PASSWORD']       = os.environ.get('MAIL_PASSWORD', '')
    app.config['MAIL_DEFAULT_SENDER'] = os.environ.get(
        'MAIL_DEFAULT_SENDER', 'Arete Fitness <support@aretefitnessapp.com>'
    )

    jwt = JWTManager(app)
    db.init_app(app)
    Migrate(app, db)
    limiter.init_app(app)
    mail.init_app(app)

    # ── JWT error callbacks — ensure consistent { "message": "..." } shape ──
    @jwt.unauthorized_loader
    def missing_token(_reason):
        return jsonify({'message': 'Authorization required'}), 401

    @jwt.invalid_token_loader
    def invalid_token(_reason):
        return jsonify({'message': 'Invalid token'}), 401

    @jwt.expired_token_loader
    def expired_token(_header, _payload):
        return jsonify({'message': 'Token has expired'}), 401

    # ── Centralised HTTP + unhandled-exception handler ─────────────────────
    @app.errorhandler(Exception)
    def handle_exception(exc):
        if isinstance(exc, HTTPException):
            return jsonify({'message': exc.description}), exc.code
        app.logger.exception('Unhandled exception')
        return jsonify({'message': 'Internal server error'}), 500

    app.register_blueprint(user_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(workout_bp)
    app.register_blueprint(exercise_bp)
    app.register_blueprint(workout_template_bp)
    app.register_blueprint(routine_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(strength_score_bp)
    app.register_blueprint(weekly_summary_bp)
    app.register_blueprint(bodyweight_bp)
    app.register_blueprint(pr_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(measurement_bp)
    app.register_blueprint(legal_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(health_bp)

    if not app.config.get('TESTING'):
        scheduler = BackgroundScheduler()
        scheduler.add_job(_send_reengagement_pushes, 'cron', hour=9, minute=0, args=[app])
        scheduler.start()

    @app.cli.command('claim-custom-exercises')
    @click.option('--user-id', required=True, type=int, help='User ID to assign exercises to')
    @click.option('--from-user-id', default=None, type=int, help='Reassign from this user ID instead of searching NULL')
    @click.option('--apply', 'do_apply', is_flag=True, default=False, help='Write changes to DB (omit for dry run)')
    def claim_custom_exercises(user_id, from_user_id, do_apply):
        """Reassign custom exercises to a user (from NULL orphans or from another user ID)."""
        from seed import EXERCISES, CARDIO_EXERCISES
        from models import ExerciseTemplate

        if from_user_id is not None:
            to_claim = ExerciseTemplate.query.filter_by(user_id=from_user_id).all()
        else:
            seeded = {
                (name.lower().strip(), (equip or '').lower().strip())
                for name, _muscle, equip in EXERCISES
            } | {
                (name.lower().strip(), (equip or '').lower().strip())
                for name, equip in CARDIO_EXERCISES
            }
            orphans = ExerciseTemplate.query.filter(ExerciseTemplate.user_id.is_(None)).all()
            to_claim = [
                ex for ex in orphans
                if (ex.name.lower().strip(), (ex.equipment or '').lower().strip()) not in seeded
            ]

        if not to_claim:
            click.echo('No custom exercises found.')
            return

        click.echo(f'{"[DRY RUN] " if not do_apply else ""}Found {len(to_claim)} custom exercise(s) to assign to user {user_id}:')
        for ex in to_claim:
            click.echo(f'  • {ex.name} ({ex.equipment or "no equipment"})  [id={ex.id}]')

        if do_apply:
            for ex in to_claim:
                ex.user_id = user_id
            db.session.commit()
            click.echo(f'Done. {len(to_claim)} exercise(s) assigned to user {user_id}.')
        else:
            click.echo('\nRe-run with --apply to write these changes.')

    @app.cli.command('backfill-descriptions')
    @click.option('--apply', 'do_apply', is_flag=True, default=False, help='Write changes to DB (omit for dry run)')
    def backfill_descriptions(do_apply):
        """One-time backfill of ExerciseTemplate.description for already-seeded
        library exercises (added after those rows already existed in prod)."""
        from models import ExerciseTemplate
        from utils.exercise_descriptions import EXERCISE_DESCRIPTIONS

        rows = ExerciseTemplate.query.filter(
            ExerciseTemplate.name.in_(EXERCISE_DESCRIPTIONS.keys()),
            ExerciseTemplate.description.is_(None),
        ).all()

        if not rows:
            click.echo('Nothing to backfill — no matching rows with a null description.')
            return

        click.echo(f'{"[DRY RUN] " if not do_apply else ""}Found {len(rows)} row(s) to backfill:')
        for ex in rows:
            click.echo(f'  • {ex.name} ({ex.equipment or "no equipment"})  [id={ex.id}]')

        if do_apply:
            for ex in rows:
                ex.description = EXERCISE_DESCRIPTIONS[ex.name]
            db.session.commit()
            click.echo(f'Done. {len(rows)} row(s) updated.')
        else:
            click.echo('\nRe-run with --apply to write these changes.')

    @app.cli.command('backfill-workout-volume')
    @click.option('--apply', 'do_apply', is_flag=True, default=False, help='Write changes to DB (omit for dry run)')
    @click.option('--user-id', default=None, type=int, help='Limit to one user (omit for all users)')
    def backfill_workout_volume(do_apply, user_id):
        """Recompute Workout.volume. Bodyweight/Weighted equipment sets add the
        user's bodyweight-at-the-time, scaled by the exercise's
        bodyweight_load_factor (push-up ~0.6, sit-up ~0.35, pull-up ~1.0 — see
        utils/volume.py). Re-run this after adding the factor column or
        retuning any factor. Workouts with no Bodyweight/Weighted sets are
        unaffected — compute_effective_weight() is a no-op for every other
        equipment type."""
        from models import Workout, User
        from utils.volume import get_bodyweight_at

        query = Workout.query
        if user_id is not None:
            query = query.filter_by(user_id=user_id)
        workouts = query.order_by(Workout.id).all()
        users_by_id = {u.id: u for u in User.query.all()}

        changed = []
        no_bodyweight_ever = 0
        for w in workouts:
            user = users_by_id.get(w.user_id)
            if not user:
                continue
            old_volume = w.volume
            bw = get_bodyweight_at(w.user_id, w.date)
            if bw is None:
                no_bodyweight_ever += 1
            new_volume = round(w.calculate_volume(weight_unit=user.weight_unit or 'lbs', bodyweight=bw), 1)
            if old_volume is None or abs(new_volume - old_volume) >= 0.1:
                changed.append((w, old_volume, new_volume))

        click.echo(f'{"[DRY RUN] " if not do_apply else ""}Scanned {len(workouts)} workout(s); '
                   f'{len(changed)} would change.')
        click.echo(f'  {no_bodyweight_ever} workout(s) belong to users who never logged a '
                   f'bodyweight — their Bodyweight/Weighted sets are left as stored-weight-only.')
        if changed:
            total_delta = sum(new - (old or 0.0) for _, old, new in changed)
            click.echo(f'  Total volume delta: +{round(total_delta):,} lbs across changed workouts.')
            for w, old, new in changed[:20]:
                click.echo(f'  workout {w.id} (user {w.user_id}, {w.date.date()}): {old} -> {new}')
            if len(changed) > 20:
                click.echo(f'  ... and {len(changed) - 20} more')

        if do_apply:
            db.session.commit()
            click.echo(f'Done. {len(changed)} workout(s) updated.')
        else:
            db.session.rollback()  # calculate_volume() above mutated w.volume in memory -- discard it
            click.echo('Re-run with --apply to write these changes.')

    @app.cli.command('backfill-pr-events')
    @click.option('--apply', 'do_apply', is_flag=True, default=False, help='Write changes to DB (omit for dry run)')
    @click.option('--user-id', default=None, type=int, help='Limit to one user (omit for all users)')
    @click.option('--force', is_flag=True, default=False, help='Rebuild even for users who already have PR events')
    def backfill_pr_events(do_apply, user_id, force):
        """Populate the pr_events history table for existing users by replaying
        every workout chronologically. Also rebuilds PersonalRecord rows via the
        same replay, so both stay consistent. Users who already have events are
        skipped unless --force."""
        from models import User, Exercise, Workout, PREvent
        from routes.workout_routes import _recompute_prs_for_templates

        user_query = User.query.order_by(User.id)
        if user_id is not None:
            user_query = user_query.filter_by(id=user_id)
        users = user_query.all()

        processed = skipped = total_events = 0
        for user in users:
            if not force and db.session.query(PREvent.id).filter_by(user_id=user.id).first():
                skipped += 1
                continue
            template_ids = [
                t for (t,) in (
                    db.session.query(Exercise.exercise_template_id)
                    .join(Workout, Exercise.workout_id == Workout.id)
                    .filter(Workout.user_id == user.id, Exercise.exercise_template_id.isnot(None))
                    .distinct()
                    .all()
                )
            ]
            if not template_ids:
                continue
            _recompute_prs_for_templates(user.id, template_ids)
            db.session.flush()
            count = db.session.query(db.func.count(PREvent.id)).filter_by(user_id=user.id).scalar()
            total_events += count
            processed += 1
            click.echo(f'  user {user.id} ({user.username}): {count} event(s) across {len(template_ids)} exercise(s)')

        click.echo(f'{"[DRY RUN] " if not do_apply else ""}{processed} user(s) processed, '
                   f'{skipped} skipped (already have events), {total_events} event(s) generated.')
        if do_apply:
            db.session.commit()
            click.echo('Done.')
        else:
            db.session.rollback()
            click.echo('Re-run with --apply to write these changes.')

    @app.cli.command('backfill-strength-score-snapshots')
    @click.option('--apply', 'do_apply', is_flag=True, default=False, help='Write changes to DB (omit for dry run)')
    @click.option('--user-id', default=None, type=int, help='Limit to one user (omit for all users)')
    def backfill_strength_score_snapshots(do_apply, user_id):
        """Reconstruct historical StrengthScoreSnapshot rows from PREvent
        history, so the Score Over Time chart isn't empty/sparse for a user
        who logged PRs long before ever opening the Strength Score screen —
        snapshots are otherwise only written reactively (once per 24h, only
        when the live endpoint is called).

        Replays each user's estimated_1rm PREvent rows chronologically —
        Epley of a true single equals the weight itself, so this history
        already captures true 1RMs too, not just multi-rep estimates. At
        most one snapshot per calendar day; dates that already have a
        (real, reactive) snapshot are never touched or duplicated."""
        from models import User, ExerciseTemplate, PREvent, BodyweightLog, StrengthScoreSnapshot
        from utils.strength_standards import STANDARDS, compute_percentile, compute_overall_score, age_scaling_factor

        kg_to_lbs = 2.20462

        user_query = User.query.order_by(User.id)
        if user_id is not None:
            user_query = user_query.filter_by(id=user_id)
        users = user_query.all()

        processed = skipped = total_snapshots = 0
        for user in users:
            if not user.gender or not user.bodyweight:
                skipped += 1
                continue

            unit_to_lbs = kg_to_lbs if (user.weight_unit or 'lbs') == 'kg' else 1.0
            valid_keys = set(STANDARDS.get(user.gender, {}).keys())

            template_to_key = {
                tid: sk for tid, sk in
                db.session.query(ExerciseTemplate.id, ExerciseTemplate.standards_key)
                .filter(ExerciseTemplate.standards_key.in_(valid_keys))
                .all()
            }
            if not template_to_key:
                continue

            events = (
                PREvent.query
                .filter(
                    PREvent.user_id == user.id,
                    PREvent.pr_type == 'estimated_1rm',
                    PREvent.exercise_template_id.in_(template_to_key.keys()),
                )
                .order_by(PREvent.achieved_at.asc())
                .all()
            )
            if not events:
                continue

            bw_logs = (
                BodyweightLog.query
                .filter_by(user_id=user.id)
                .order_by(BodyweightLog.date.asc())
                .all()
            )
            existing_dates = {
                s.created_at.date() for s in
                StrengthScoreSnapshot.query.filter_by(user_id=user.id).all()
            }

            def _bw_lbs_at(dt):
                # Closest bodyweight log at/before dt; else the earliest log
                # ever known; else the user's current bodyweight (best
                # available guess for a date before any log existed).
                candidate = None
                for log in bw_logs:
                    if log.date <= dt:
                        candidate = log
                    else:
                        break
                bw = (candidate or (bw_logs[0] if bw_logs else None))
                return (bw.weight if bw else user.bodyweight) * unit_to_lbs

            def _age_factor_at(dt):
                if not user.birth_date:
                    return 1.0
                age = dt.year - user.birth_date.year - (
                    (dt.month, dt.day) < (user.birth_date.month, user.birth_date.day)
                )
                return age_scaling_factor(age)

            # standards_key -> best 1RM (lbs) known as of the event being
            # processed. PREvent.value is per-exercise-template monotonically
            # increasing (rows only exist when a value beats that template's
            # own prior best), but several templates can share one
            # standards_key (e.g. barbell vs. smith-machine bench) — a later
            # event from a *different* template sharing the key isn't
            # guaranteed to exceed another template's already-tracked best,
            # so this only advances the key's value, mirroring the live
            # endpoint's max() across all templates for a key.
            best_1rm_lbs: dict[str, float] = {}
            by_day: dict = {}
            for ev in events:
                key = template_to_key.get(ev.exercise_template_id)
                if not key:
                    continue
                new_val = ev.value * unit_to_lbs
                if new_val <= best_1rm_lbs.get(key, 0.0):
                    continue
                best_1rm_lbs[key] = new_val

                bw_lbs = _bw_lbs_at(ev.achieved_at)
                if bw_lbs <= 0:
                    continue
                age_factor = _age_factor_at(ev.achieved_at)

                exercise_percentiles = {}
                for k, best in best_1rm_lbs.items():
                    pct = compute_percentile(k, user.gender, (best / bw_lbs) * age_factor)
                    if pct is not None:
                        exercise_percentiles[k] = pct

                score = compute_overall_score(exercise_percentiles)
                if score is None:
                    continue
                by_day[ev.achieved_at.date()] = score

            new_count = 0
            for day, score in sorted(by_day.items()):
                if day in existing_dates:
                    continue
                db.session.add(StrengthScoreSnapshot(
                    user_id=user.id,
                    score=round(score, 1),
                    created_at=datetime.combine(day, datetime.min.time()),
                ))
                new_count += 1

            if new_count:
                click.echo(f'  user {user.id} ({user.username}): {new_count} snapshot(s) from {len(events)} PR event(s)')
            total_snapshots += new_count
            processed += 1

        click.echo(f'{"[DRY RUN] " if not do_apply else ""}{processed} user(s) processed, '
                   f'{skipped} skipped (missing gender/bodyweight), {total_snapshots} snapshot(s) generated.')
        if do_apply:
            db.session.commit()
            click.echo('Done.')
        else:
            db.session.rollback()
            click.echo('Re-run with --apply to write these changes.')

    return app


def _send_reengagement_pushes(app):
    with app.app_context():
        from models import DeviceToken, Workout
        from utils.push_service import send_push
        now = datetime.now()
        inactive_cutoff = now - timedelta(days=10)
        throttle_cutoff = now - timedelta(days=7)

        # Lapsed = has logged at least one workout, but none in the last 10 days.
        # Users who never logged a workout are excluded — nagging someone the
        # morning after they sign up is how you earn 1-star reviews.
        last_workout = (
            db.session.query(
                Workout.user_id.label('user_id'),
                db.func.max(Workout.date).label('last_date'),
            )
            .group_by(Workout.user_id)
            .subquery()
        )
        devices = (
            db.session.query(DeviceToken)
            .join(last_workout, last_workout.c.user_id == DeviceToken.user_id)
            .filter(
                last_workout.c.last_date < inactive_cutoff,
                db.or_(
                    DeviceToken.last_reengagement_at.is_(None),
                    DeviceToken.last_reengagement_at < throttle_cutoff,
                ),
            )
            .all()
        )
        if not devices:
            return
        send_push(
            [d.token for d in devices],
            title="Miss your gains? 💪",
            body="You haven't logged a workout in a while. Jump back in!",
        )
        for d in devices:
            d.last_reengagement_at = now
        db.session.commit()


app = create_app()

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=False, host='0.0.0.0')
