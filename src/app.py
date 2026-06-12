import logging
import os
from datetime import timedelta, datetime
from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory
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
from routes.bodyweight_routes import bodyweight_bp
from routes.personal_record_routes import pr_bp
from routes.ai_routes import ai_bp
from routes.measurement_routes import measurement_bp
from routes.legal_routes import legal_bp
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

    @app.route('/privacy')
    def privacy_policy():
        return send_from_directory('static', 'privacy.html')

    @app.route('/terms')
    def terms_of_service():
        return send_from_directory('static', 'terms.html')

    app.register_blueprint(user_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(workout_bp)
    app.register_blueprint(exercise_bp)
    app.register_blueprint(workout_template_bp)
    app.register_blueprint(routine_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(bodyweight_bp)
    app.register_blueprint(pr_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(measurement_bp)
    app.register_blueprint(legal_bp)

    if not app.config.get('TESTING'):
        scheduler = BackgroundScheduler()
        scheduler.add_job(_send_reengagement_pushes, 'cron', hour=9, minute=0, args=[app])
        scheduler.start()

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
