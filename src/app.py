from flask import Flask
from models import db
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from routes.auth_routes import auth_bp
from routes.user_routes import user_bp
from routes.workout_routes import workout_bp
from routes.exercise_routes import exercise_bp
from routes.workout_template_routes import workout_template_bp
from routes.routine_routes import routine_bp

def create_app(test_config=None):
    app = Flask(__name__)

    app.config['JWT_SECRET_KEY'] = 'super-secret-key'
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///workout_tracker.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config['JWT_TOKEN_LOCATION'] = ['headers']

    if test_config:
        app.config.update(test_config)

    CORS(app)
    JWTManager(app)
    db.init_app(app)

    app.register_blueprint(user_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(workout_bp)
    app.register_blueprint(exercise_bp)
    app.register_blueprint(workout_template_bp)
    app.register_blueprint(routine_bp)

    print("Registered routes:")
    for rule in app.url_map.iter_rules():
        print(rule, rule.methods)
    return app

def clear_all_data():
    meta = db.metadata
    for table in reversed(meta.sorted_tables):
        db.session.execute(table.delete())
    db.session.commit()


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        # Migrate: rename old routines/routine_ex tables to workout_templates/workout_template_exercises
        try:
            db.session.execute(db.text("ALTER TABLE routines RENAME TO workout_templates"))
            db.session.commit()
        except Exception:
            db.session.rollback()
        try:
            db.session.execute(db.text("ALTER TABLE routine_ex RENAME TO workout_template_exercises"))
            db.session.commit()
        except Exception:
            db.session.rollback()
        try:
            db.session.execute(db.text(
                "ALTER TABLE workout_template_exercises RENAME COLUMN routine_id TO workout_template_id"
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()

        # Create any new tables (routines, routine_days, etc.)
        db.create_all()

        # Add weight_unit column to existing databases
        try:
            db.session.execute(db.text("ALTER TABLE user ADD COLUMN weight_unit VARCHAR(3) DEFAULT 'lbs'"))
            db.session.commit()
        except Exception:
            db.session.rollback()

    app.run(debug=False, host="0.0.0.0")
