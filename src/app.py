from flask import Flask, redirect, render_template, url_for, request, jsonify
from models import db, User, Workout, Exercise
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///workout_tracker.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
#create database
with app.app_context():
    db.create_all()
    
@app.route("/")
def home():
    return render_template("home.html")

@app.route('/users')
def get_users():
    users = User.query.all()
    return jsonify([{'id': user.id, 'username': user.username} for user in users])

if __name__ == '__main__':
    app.run(debug=False)
