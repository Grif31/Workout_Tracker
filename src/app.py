import os
from dotenv import load_dotenv
from flask import Flask
from flask_migrate import Migrate
from models import db
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from routes.auth_routes import auth_bp
from routes.user_routes import user_bp
from routes.workout_routes import workout_bp
from routes.exercise_routes import exercise_bp
from routes.workout_template_routes import workout_template_bp
from routes.routine_routes import routine_bp
from routes.stats_routes import stats_bp
from routes.bodyweight_routes import bodyweight_bp
from routes.personal_record_routes import pr_bp

load_dotenv()

def create_app(test_config=None):
    app = Flask(__name__)

    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'dev-secret-key')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///workout_tracker.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_TOKEN_LOCATION'] = ['headers']

    if test_config:
        app.config.update(test_config)

    CORS(app)
    JWTManager(app)
    db.init_app(app)
    Migrate(app, db)

    app.register_blueprint(user_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(workout_bp)
    app.register_blueprint(exercise_bp)
    app.register_blueprint(workout_template_bp)
    app.register_blueprint(routine_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(bodyweight_bp)
    app.register_blueprint(pr_bp)

    return app


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(debug=False, host='0.0.0.0')
