from flask import Flask, render_template, request, send_file, redirect, url_for, session, jsonify, make_response
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
from zoneinfo import ZoneInfo  # stdlib in Python 3.9+
import shutil
from urllib.parse import urlparse
from pathlib import Path

DEBUG_FAKE_STYLIZE = os.getenv("DEBUG_FAKE_STYLIZE", "false").lower() in {"1","true","yes"}
USE_DEBUG_FAKE = False
CHICAGO_TZ = ZoneInfo("America/Chicago")

# def _to_bool(v):
#     if isinstance(v, bool):
#         return v
#     if v is None:
#         return False
#     return str(v).strip().lower() in {"1","true","yes","on"}

# debug_request = _to_bool((data.get("debug")))
# use_mock = bool(DEBUG_FAKE_STYLIZE or USE_DEBUG_FAKE or debug_request)


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())

def ensure_daily_and_weekly(stats):
    # Now in Chicago time
    now_chicago = datetime.now(CHICAGO_TZ)
    today_chicago = now_chicago.date()

    # Daily reset
    if stats.last_credit_refresh != today_chicago:
        stats.credits = 0
        stats.last_credit_refresh = today_chicago

    # Weekly reset
    last_week_mark = monday_of(stats.last_week_refresh or date.min)
    this_week_mark = monday_of(today_chicago)
    if last_week_mark < this_week_mark:
        stats.week_credits = 0
        stats.last_week_refresh = today_chicago

load_dotenv()

# App setup
app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-only-change-me")

# Flask config
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Business config: turn CSV env var into a set
ADMIN_VISIBLE_USERS = {
    "admin": "__ALL__", # super admin sees everyone
    "alekseiadmin": {"aleksei", "maria", "amrita", "alekseiadmin","olesya"},
}
ALEKSEI_USERS = ["aleksei", "maria", "amrita", "alekseiadmin","olesya"]
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
    "dave": "photoDB",  
    "geometry": "Geotest1",
    "alexpix": "Pix2025",
    "vicentaadmin": "welcome1",
    "alekseiadmin": "alekseiadminalekseiadmin!",
    "maria": "maria1",
    "amrita": "amrita1",
    "aleksei": "aleksei1",
    "olesya": "olesya1",
    "bekzat": "yasmin",
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
     # NEW (for weekly Monday reset)
    week_credits = db.Column(db.Integer, default=0)          # optional: track weekly usage
    last_week_refresh = db.Column(db.Date)                   # the date we last refreshed the “week”

# Billing ledger: immutable records of billable overage units
class BillingLedger(db.Model):
    __tablename__ = "billing_ledger"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(50), db.ForeignKey("user_tracking.username"), index=True, nullable=False)
    event = db.Column(db.String(32), nullable=False)          # e.g., 'stylize_overage'
    units = db.Column(db.Integer, nullable=False, default=0)  # how many overage stylizations
    at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

# Create tables
with app.app_context():
    db.create_all()

# Helper: track user actions
def track_event(username, event_type, count=1):
    stats = db.session.get(UserTracking, username)
    if not stats:
        stats = UserTracking(username=username)
        db.session.add(stats)

    # Single source of truth for resets
    ensure_daily_and_weekly(stats)

    if event_type == "login":
        stats.last_login = datetime.now(CHICAGO_TZ)
    elif hasattr(stats, event_type):
        current = getattr(stats, event_type) or 0
        setattr(stats, event_type, current + count)

    db.session.commit()

def _mock_stylize_file(input_url: str, style: str) -> str:
    """
    Copy uploaded image to outputs with a style suffix.
    Returns relative output path like 'static/outputs/filename_style.jpg'
    """
    # input_url is like https://host/static/uploads/foo.jpg
    parsed = urlparse(input_url)
    # local path for the upload:
    # assume URL path starts with /static/uploads/...
    upath = parsed.path.lstrip("/")  # 'static/uploads/foo.jpg'
    src = Path(upath)
    if not src.exists():
        raise FileNotFoundError(f"Missing: {src}")
    # build output name
    stem = src.stem
    ext = src.suffix or ".jpg"
    out = Path(OUTPUT_FOLDER) / f"{stem}_{style}{ext}"
    shutil.copyfile(src, out)
    return str(out).replace("\\", "/")    


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


    # Daily reset logic (Chicago time)
    if stats:
        today_ct = datetime.now(CHICAGO_TZ).date()
    if not stats.last_credit_refresh or stats.last_credit_refresh < today_ct:
        stats.credits = 0
        stats.last_credit_refresh = today_ct
        db.session.commit()


    return render_template("index.html", 
                           username=user, 
                           credits=stats.credits if stats else 0,
                           debug_enabled=DEBUG_FAKE_STYLIZE or USE_DEBUG_FAKE)

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
    data = request.get_json(silent=True) or {}
    # print(f"[stylize] use_mock={use_mock} (env={DEBUG_FAKE_STYLIZE}, toggle={USE_DEBUG_FAKE}, req={debug_request})")
    image_urls = data.get("image_urls")
    style = data.get("style")
    debug_request = bool(data.get("debug"))  # <-- define this FIRST 

    if not image_urls or not style:
        return jsonify({"error": "Missing image URLs or style"}), 400

    user_stats = db.session.get(UserTracking, username)
    if not user_stats:
        return jsonify({"error": "User tracking not found"}), 500

    # (If you keep daily reset for now)
    today_ct = datetime.now(CHICAGO_TZ).date()
    if not user_stats.last_credit_refresh or user_stats.last_credit_refresh < today_ct:
        user_stats.credits = 0
        user_stats.last_credit_refresh = today_ct
        db.session.commit()

    # ✅ One place to decide mock vs real. Include BOTH flags + per-request.
    use_mock = bool(DEBUG_FAKE_STYLIZE or USE_DEBUG_FAKE or debug_request)

    results = []
    count = 0
    for url in image_urls:
        try:
            output_path = _mock_stylize_file(url, style) if use_mock else stylize_image(url, style)
            if output_path:
                results.append({"input": url, "output_path": output_path})
                count += 1
        except Exception as e:
            print(f"Stylization error for {url}: {e}")

    if count == 0:
        return jsonify({
            "stylized": [],
            "credits_used": 0,
            "free_credits_used": 0,
            "paid_units": 0,
            "credits_before": user_stats.credits,
            "credits_after": user_stats.credits,
            "charge": {"unit_price_cents": 10, "total_cents": 0},
            "debug": use_mock,  # <-- reflect actual mode
        })

    # -- unified billing/credits for BOTH debug and real --
    UNIT_PRICE_CENTS = 10

    # lifetime stat
    track_event(username, "stylizations", count=count)

    # your current model = count-down credits (daily reset in your code)
    credits_before = int(user_stats.credits or 0)
    free_credits_used = max(0, min(credits_before, count))
    paid_units = max(0, count - free_credits_used)
    credits_after = credits_before - count

    user_stats.credits = credits_after

    # write ledger only if the¸˛re’s an overage to bill (same as before)
    if paid_units > 0:
        db.session.add(BillingLedger(
        username=username,
        event="stylize_overage",
        units=paid_units,
        at=datetime.utcnow(),
    ))

    db.session.commit()

    total_cents = paid_units * UNIT_PRICE_CENTS


    return jsonify({
        "stylized": results,
        "credits_used": count if not use_mock else 0,
        "free_credits_used": 0 if use_mock else free_credits_used,
        "paid_units": 0 if use_mock else paid_units,
        "credits_after": (user_stats.credits or 0) if use_mock else credits_after,
        "charge": {"unit_price_cents": 10, "total_cents": total_cents},
        "debug": use_mock,  # <-- important
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

    visible_users = ALEKSEI_USERS if admin == "alekseiadmin" else ALEKSEI_USERS

    # Determine biweekly window starting Monday *in Chicago time*
    start_param = request.args.get("start")  # YYYY-MM-DD (any date inside the desired window)
    if start_param:
        d_ct = datetime.strptime(start_param, "%Y-%m-%d").date()
    else:
        d_ct = datetime.now(CHICAGO_TZ).date()

    start_monday_ct = d_ct - timedelta(days=d_ct.weekday())
    end_ct_date = start_monday_ct + timedelta(days=14)  # exclusive

    # Build timezone-aware datetimes in CT, then convert to UTC for DB filter
    start_ct_dt = datetime.combine(start_monday_ct, datetime.min.time(), tzinfo=CHICAGO_TZ)
    end_ct_dt   = datetime.combine(end_ct_date,   datetime.min.time(), tzinfo=CHICAGO_TZ)

    start_utc = start_ct_dt.astimezone(ZoneInfo("UTC"))
    end_utc   = end_ct_dt.astimezone(ZoneInfo("UTC"))

    # Fetch ledger entries for the window & users (timestamps stored as UTC)
    q = (BillingLedger.query
         .filter(BillingLedger.event == "stylize_overage",
                 BillingLedger.at >= start_utc,
                 BillingLedger.at <  end_utc,
                 BillingLedger.username.in_(visible_users)))
    entries = q.all()

    # Days (14 columns) as Chicago dates for display
    days = [start_monday_ct + timedelta(days=i) for i in range(14)]
    per_user = {u: [0]*14 for u in visible_users}

    for e in entries:
        # Convert each UTC timestamp to CT date to bucket correctly
        e_ct_date = e.at.replace(tzinfo=ZoneInfo("UTC")).astimezone(CHICAGO_TZ).date()
        idx = (e_ct_date - start_monday_ct).days
        if 0 <= idx < 14:
            per_user[e.username][idx] += int(e.units or 0)

    col_totals = [sum(per_user[u][i] for u in visible_users) for i in range(14)]
    grand_total_units = sum(col_totals)

    unit_price = Decimal("0.10")
    amount = unit_price * grand_total_units

    html = render_template(
        "biweekly.html",
        users=visible_users,
        days=days,
        per_user=per_user,
        col_totals=col_totals,
        grand_total_units=grand_total_units,
        unit_price=unit_price,
        amount=amount,
        start=start_monday_ct,
        end=(end_ct_date - timedelta(days=1)),  # inclusive end date (CT)
        admin=admin
    )
    resp = make_response(html)
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


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

@app.route("/admin/debug-toggle")
def toggle_debug():
    if session.get("user") not in ADMINS:
        return "Unauthorized", 403
    global USE_DEBUG_FAKE
    USE_DEBUG_FAKE = not USE_DEBUG_FAKE
    return f"DEBUG_FAKE_STYLIZE now {USE_DEBUG_FAKE}"

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
