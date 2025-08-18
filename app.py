from flask import Flask, render_template, request, send_file, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename
from datetime import datetime, date, timedelta
from stylize import stylize_image
import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from collections import defaultdict
from decimal import Decimal
load_dotenv()

# App setup
app = Flask(__name__)
app.secret_key = os.getenv("app.secret_key")

# Flask config
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Business config: turn CSV env var into a set
ADMIN_VISIBLE_USERS = {
    "admin": "__ALL__", # super admin sees everyone
    "alekseiadmin": {"aleksei", "maria", "amrita", "alekseiadmin"},
}
ALEKSEI_USERS = ["aleksei", "maria", "amrita", "alekseiadmin"]
# Who is allowed to open /admin/stats
ADMINS = set(ADMIN_VISIBLE_USERS.keys())

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
    "vicentaadmin": "welcome1",
    "vicentauser1": "vicenta1",
    "vicentauser2": "vicenta2",
    "vicentauser3": "vicenta3",
    "vicentauser4": "vicenta4",
    "vicentauser5": "vicenta5",

    "alekseiadmin": "alekseiadminalekseiadmin!",
    "maria": "maria1",
    "amrita": "amrita1",
    "aleksei": "aleksei1",
}


# User tracking model
class UserTracking(db.Model):
    __tablename__ = "user_tracking"
    username = db.Column(db.String(50), primary_key=True)
    uploads = db.Column(db.Integer, default=0)
    downloads = db.Column(db.Integer, default=0)
    stylizations = db.Column(db.Integer, default=0)
    credits = db.Column(db.Integer, default=0)
    last_credit_refresh = db.Column(db.Date)
    last_login = db.Column(db.DateTime)

# Billing ledger: immutable records of billable overage units
class BillingLedger(db.Model):
    __tablename__ = "billing_ledger"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(50), db.ForeignKey("user_tracking.username"), index=True, nullable=False)
    event = db.Column(db.String(32), nullable=False)          # e.g., 'stylize_overage'
    units = db.Column(db.Integer, nullable=False, default=0)  # how many overage stylizations
    at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


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
        stats.credits = 0  # default daily credit refresh
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
        stats.credits = 0
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

    # ✅ Daily refresh (keeps your existing behavior)
    if not user_stats.last_credit_refresh or user_stats.last_credit_refresh < date.today():
        user_stats.credits = 0
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

    # Nothing processed — return early
    if count == 0:
        return jsonify({
            "stylized": [],
            "credits_used": 0,
            "free_credits_used": 0,
            "paid_units": 0,
            "credits_before": user_stats.credits,
            "credits_after": user_stats.credits,
            "charge": {"unit_price_cents": 10, "total_cents": 0},
        })

    # ---- NEW: calculate “from now” usage for this request
    credits_before = int(user_stats.credits or 0)
    free_credits_used = max(0, min(credits_before, count))
    paid_units = max(0, count - free_credits_used)
    credits_after = credits_before - count  # may be negative if you allow it

    # Track usage & update credits
    track_event(username, "stylizations", count=count)
    user_stats.credits = credits_after

    # Optional: write a single ledger row for overage
    if paid_units > 0:
        try:
            db.session.add(BillingLedger(
                username=username,
                event="stylize_overage",
                units=paid_units,
                at=datetime.utcnow(),
            ))
        except NameError:
            # BillingLedger not defined — skip silently or log
            pass

    db.session.commit()

    # Pricing math for the response (10 cents per paid unit)
    unit_price_cents = 10
    total_cents = paid_units * unit_price_cents

    return jsonify({
        "stylized": results,
        "credits_used": count,
        "free_credits_used": free_credits_used,
        "paid_units": paid_units,
        "credits_after": credits_after,
        "charge": {
            "unit_price_cents": unit_price_cents,
            "total_cents": total_cents
        }
    })


    
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
def admin_stats():
    user = session.get("user")
    if user not in ADMINS:
        return "Unauthorized", 403

    visibility = ADMIN_VISIBLE_USERS.get(user, set())

    q = UserTracking.query
    if visibility != "__ALL__":
        q = q.filter(UserTracking.username.in_(list(visibility)))

    stats = q.order_by(UserTracking.username).all()
    return render_template("stats.html", stats=stats, admin=user)

@app.route("/admin/biweekly")
def biweekly_billing():
    admin = session.get("user")
    if admin not in {"admin", "alekseiadmin"}:
        return "Unauthorized", 403

    # Allowed usernames for this admin
    visible_users = ALEKSEI_USERS if admin == "alekseiadmin" else ALEKSEI_USERS  # adjust if super-admin later

    # Determine biweekly window starting Monday
    start_param = request.args.get("start")  # optional YYYY-MM-DD (will normalize to Monday)
    today = date.today()
    start_monday = today - timedelta(days=today.weekday())  # Monday this week
    if start_param:
        d = datetime.strptime(start_param, "%Y-%m-%d").date()
        start_monday = d - timedelta(days=d.weekday())       # normalize to Monday

    start_dt = datetime.combine(start_monday, datetime.min.time())
    end_dt = start_dt + timedelta(days=14)

    # Fetch ledger entries for the window & users
    q = (BillingLedger.query
         .filter(BillingLedger.event == "stylize_overage",
                 BillingLedger.at >= start_dt,
                 BillingLedger.at < end_dt,
                 BillingLedger.username.in_(visible_users)))
    entries = q.all()

    # Build a 4x14 table: 3 users + "Total" rows, 14 day columns
    days = [start_monday + timedelta(days=i) for i in range(14)]
    per_user = {u: [0]*14 for u in visible_users}

    for e in entries:
        idx = (e.at.date() - start_monday).days
        if 0 <= idx < 14:
            per_user[e.username][idx] += int(e.units or 0)

    col_totals = [sum(per_user[u][i] for u in visible_users) for i in range(14)]
    grand_total_units = sum(col_totals)

    # price = $0.10 per unit
    unit_price = Decimal("0.10")
    amount = unit_price * grand_total_units

    return render_template(
        "biweekly.html",
        users=visible_users,
        days=days,
        per_user=per_user,
        col_totals=col_totals,
        grand_total_units=grand_total_units,
        unit_price=unit_price,
        amount=amount,
        start=start_monday,
        end=(end_dt.date() - timedelta(days=1)),  # inclusive end date
        admin=admin
    )

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
