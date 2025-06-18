from flask import Flask, render_template, request, send_file, redirect, url_for, session
import os
from stylize import stylize_image
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = "super_secret_key_change_this"

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "outputs"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# 🔐 Hardcoded users (up to 10)
USERS = {
    "admin": "pass123",
    "user1": "photo1",
    "user2": "photo2",
    "user3": "photo3",
    "user4": "photo4",
    "user5": "photo5",
    "user6": "photo6",
    "user7": "photo7",
    "user8": "photo8",
    "user9": "photo9",
    "user10": "photo10"
}

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        if username in USERS and USERS[username] == password:
            session["user"] = username
            return redirect(url_for("index"))
        else:
            return render_template("login.html", error="Invalid username or password.")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))


@app.route("/", methods=["GET", "POST"])
def index():
    if "user" not in session:
        return redirect(url_for("login"))

    if request.method == "POST":
        if "image" not in request.files:
            return "No image uploaded", 400
        file = request.files["image"]
        if file.filename == "":
            return "No selected file", 400

        filename = secure_filename(file.filename)
        input_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(input_path)

        output_path = stylize_image(input_path)
        return send_file(output_path, mimetype="image/jpeg")

    return render_template("index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)

