from flask import Flask
from models import db
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from routes.auth_routes import auth_bp
from routes.user_routes import user_bp
from routes.workout_routes import workout_bp
from routes.exercise_routes import exercise_bp

def create_app():
    app = Flask(__name__)

    app.config['JWT_SECRET_KEY'] = 'super-secret-key'
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///workout_tracker.db"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config['JWT_TOKEN_LOCATION'] = ['headers']

    CORS(app)
    JWTManager(app)
    db.init_app(app)
    
    app.register_blueprint(user_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(workout_bp)
    app.register_blueprint(exercise_bp)
    
    print("Registered routes:")
    for rule in app.url_map.iter_rules():
        print(rule, rule.methods)
    return app

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(debug=False, host="0.0.0.0")
