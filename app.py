from flask import Flask, render_template, request, send_file, redirect, url_for, session, jsonify
import os
from stylize import stylize_image  # This function must accept an image URL
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = "b89e5c6df135af7794a22eb1e084cd6a2b50d2a9db33e07b78d1975a3fc9a639"

UPLOAD_FOLDER = "static/uploads"
OUTPUT_FOLDER = "outputs"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# 🔐 Hardcoded users (up to 10)
USERS = {
    "admin": "PhotoM1n",
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


@app.route("/", methods=["GET"])
def index():
    if "user" not in session:
        return redirect(url_for("login"))
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    if "user" not in session:
        return {"error": "Unauthorized"}, 401

    if "image" not in request.files:
        return {"error": "No image uploaded"}, 400

    file = request.files["image"]
    if file.filename == "":
        return {"error": "No selected file"}, 400

    filename = secure_filename(file.filename)
    upload_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(upload_path)

    host = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "localhost:5000")
    image_url = f"https://{host}/static/uploads/{filename}"

    return jsonify({"image_url": image_url})


@app.route("/stylize", methods=["POST"])
def stylize():
    if "user" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    image_url = data.get("image_url")
    if not image_url:
        return jsonify({"error": "No image URL provided"}), 400

    try:
        output_path = stylize_image(image_url)  # your function must handle a URL
        return send_file(output_path, mimetype="image/jpeg")
    except Exception as e:
        print("Error in stylize():", e)
        return jsonify({"error": "Stylization failed"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
