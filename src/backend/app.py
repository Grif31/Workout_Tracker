from flask import Flask, redirect, render_template, url_for, request, jsonify
from models import db

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///workout_tracker.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
#create database
with app.app_context():
    db.create_all()
    
@app.route("/")
def home():
    return render_template("home.html")