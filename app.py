from flask import Flask, render_template, request, send_file, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename
from stylize import stylize_image
from datetime import datetime
import os

# App setup
app = Flask(__name__)
app.secret_key = "b89e5c6df135af7794a22eb1e084cd6a2b50d2a9db33e07b78d1975a3fc9a639"

# Flask config
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Init DB
db = SQLAlchemy(app)

# File paths
UPLOAD_FOLDER = "static/uploads"
OUTPUT_FOLDER = "outputs"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Hardcoded users
USERS = {
    "admin": "PhotoM1n",
    "hardrock": "photoHR",
    "lulus": "photoLU",
    "kuhio": "photoKU",
    "luckystrike": "photoLS",
    "dave": "photoDB",
    "dksteak": "photoDK",
    "user7": "photo7",
    "user8": "photo8",
    "user9": "photo9",
    "user10": "photo10"
}

# User tracking model
class UserTracking(db.Model):
    __tablename__ = "user_tracking"
    username = db.Column(db.String(50), primary_key=True)
    uploads = db.Column(db.Integer, default=0)
    downloads = db.Column(db.Integer, default=0)
    stylizations = db.Column(db.Integer, default=0)
    last_login = db.Column(db.DateTime)

# Create tables
@app.before_request
def ensure_tables_exist():
    if not hasattr(app, 'tables_created'):
        db.create_all()
        app.tables_created = True

# Helper: track user actions
def track_event(username, event_type):
    stats = UserTracking.query.get(username)
    if not stats:
        stats = UserTracking(username=username)
        db.session.add(stats)

    if event_type == "login":
        stats.last_login = datetime.utcnow()
    elif hasattr(stats, event_type):
        setattr(stats, event_type, getattr(stats, event_type) + 1)

    db.session.commit()

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        if username in USERS and USERS[username] == password:
            session["user"] = username
            track_event(username, "login")
            return redirect(url_for("index"))
        else:
            return render_template("login.html", error="Invalid username or password.")
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))

@app.route("/", methods=["GET"])
def index():
    if "user" not in session:
        return redirect(url_for("login"))
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload():
    if "user" not in session:
        return {"error": "Unauthorized"}, 401

    if "images" not in request.files:
        return {"error": "No images uploaded"}, 400

    files = request.files.getlist("images")
    uploaded_urls = []

    for file in files:
        if file and file.filename != "":
            filename = secure_filename(file.filename)
            upload_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(upload_path)

            # Count each file as one upload
            track_event(session["user"], "uploads")

            host = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "localhost:5000")
            image_url = f"https://{host}/static/uploads/{filename}"
            uploaded_urls.append(image_url)

    return jsonify({"image_urls": uploaded_urls})
@app.route("/stylize", methods=["POST"])
def stylize():
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    image_url = data.get("image_url")
    if not image_url:
        return jsonify({"error": "No image URL provided"}), 400

    try:
        output_path = stylize_image(image_url)
        track_event(session["user"], "stylizations")
        return send_file(output_path, mimetype="image/jpeg")
    except Exception as e:
        print("Error in stylize():", e)
        return jsonify({"error": "Stylization failed"}), 500
    
@app.route("/admin/stats")
def view_stats():
    if session.get("user") != "admin":
        return "Unauthorized", 403

    stats = UserTracking.query.order_by(UserTracking.username).all()
    return render_template("stats.html", stats=stats)    

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
