from flask import Flask, render_template, request, send_file, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename
from datetime import datetime, date
from stylize import stylize_image
import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
load_dotenv()

# App setup
app = Flask(__name__)
app.secret_key = os.getenv("app.secret_key")

# Flask config
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Init DB
db = SQLAlchemy(app)

# File paths
UPLOAD_FOLDER = "static/uploads"
OUTPUT_FOLDER = "static/outputs"
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
    "geometry": "Geotest1",
    "alexpix": "Pix2025",
    "deepdish": "1pizza",
    "vicentaadmin": "welcome1",
    "vicentauser1": "vicenta1",
    "vicentauser2": "vicenta2",
    "vicentauser3": "vicenta3",
    "vicentauser4": "vicenta4",
    "vicentauser5": "vicenta5",
}

# User tracking model
class UserTracking(db.Model):
    __tablename__ = "user_tracking"
    username = db.Column(db.String(50), primary_key=True)
    uploads = db.Column(db.Integer, default=0)
    downloads = db.Column(db.Integer, default=0)
    stylizations = db.Column(db.Integer, default=0)
    credits = db.Column(db.Integer, default=20)
    last_credit_refresh = db.Column(db.Date)
    last_login = db.Column(db.DateTime)

# Create tables
@app.before_request
def ensure_tables_exist():
    if not hasattr(app, 'tables_created'):
        db.create_all()
        app.tables_created = True

# Helper: track user actions
def track_event(username, event_type, count=1):
    stats = db.session.get(UserTracking, username)
    if not stats:
        stats = UserTracking(username=username)
        db.session.add(stats)

    # 🔁 Daily credit refresh
    today = date.today()
    if stats.last_credit_refresh != today:
        stats.credits = 20  # default daily credit refresh
        stats.last_credit_refresh = today

    if event_type == "login":
        stats.last_login = datetime.utcnow()
    elif hasattr(stats, event_type):
        current = getattr(stats, event_type) or 0
        setattr(stats, event_type, current + count)

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

    user = session["user"]
    stats = db.session.get(UserTracking, user)


    # Daily reset logic
    if stats and (not stats.last_credit_refresh or stats.last_credit_refresh < date.today()):
        stats.credits = 20
        stats.last_credit_refresh = date.today()
        db.session.commit()

    return render_template("index.html", username=user, credits=stats.credits if stats else 0)

@app.route("/upload", methods=["POST"])
def upload():
    if "user" not in session:
        return {"error": "Unauthorized"}, 401

    files = request.files.getlist("image")
    if not files or files == [None]:
        files = list(request.files.values())  # Fallback in case getlist doesn't work

    if not files:
        return {"error": "No files uploaded"}, 400

    uploaded_urls = []
    upload_count = 0
    
    for file in files:
        if file.filename == "":
            continue

        filename = secure_filename(file.filename)
        upload_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(upload_path)
        upload_count += 1
        # Optional for debugging
        print(f"Saved file: {upload_path}")

        track_event(session["user"], "uploads")

        host = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "localhost:5000")
        image_url = f"https://{host}/static/uploads/{filename}"
        uploaded_urls.append(image_url)

    return jsonify({"image_urls": uploaded_urls})

@app.route("/stylize", methods=["POST"])
def stylize():
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    username = session["user"]
    data = request.get_json()
    image_urls = data.get("image_urls")
    style = data.get("style")

    if not image_urls or not style:
        return jsonify({"error": "Missing image URLs or style"}), 400

    user_stats = db.session.get(UserTracking, username)
    if not user_stats:
        return jsonify({"error": "User tracking not found"}), 500

    # ✅ Reset credits once a day
    if not user_stats.last_credit_refresh or user_stats.last_credit_refresh < date.today():
        user_stats.credits = 20
        user_stats.last_credit_refresh = date.today()
        db.session.commit()

    results = []
    count = 0

    for url in image_urls:
        try:
            output_path = stylize_image(url, style)
            if output_path:
                results.append({"input": url, "output_path": output_path})
                count += 1
        except Exception as e:
            print(f"Stylization error for {url}: {e}")

    if count > 0:
        track_event(username, "stylizations", count=count)
        user_stats.credits -= count  # 🔻 Allow negative credits
        db.session.commit()

    return jsonify({"stylized": results, "remaining_credits": user_stats.credits})

    
@app.route("/track-download")
def track_download():
    if "user" not in session:
        return "Unauthorized", 403

    path = request.args.get("path")
    if not path or not path.startswith("static/outputs/"):
        return "Invalid path", 400

    if not os.path.exists(path):
        return "File not found", 404

    track_event(session["user"], "downloads")
    return send_file(path, as_attachment=True)
    
@app.route("/admin/stats")
def view_stats():
    if session.get("user") != "admin":
        return "Unauthorized", 403

    stats = UserTracking.query.order_by(UserTracking.username).all()
    return render_template("stats.html", stats=stats)    

@app.route("/send-report", methods=["POST"])
def send_report():
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    message_body = data.get("message")
    topic = data.get("topic", "Support")
    user = session["user"]

    if not message_body:
        return jsonify({"error": "Empty message"}), 400

    email_user = os.environ.get("EMAIL_USER")
    email_pass = os.environ.get("EMAIL_PASS")
    email_to = os.environ.get("EMAIL_RECEIVER")

    # Basic env validation
    if not email_user or not email_pass or not email_to:
        return jsonify({"error": "Email configuration missing"}), 500

    msg = MIMEMultipart()
    msg["From"] = email_user
    msg["To"] = email_to
    msg["Subject"] = f"📣 {topic} — New Stylizer message from {user}"

    body = f"User: {user}\nTopic: {topic}\n\nMessage:\n{message_body}"
    msg.attach(MIMEText(body, "plain"))

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(email_user, email_pass)
        server.sendmail(email_user, email_to, msg.as_string())
        server.quit()
        return jsonify({"success": True})
    except Exception as e:
        print(f"Email send error: {e}")
        return jsonify({"error": "Failed to send email"}), 500



if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
