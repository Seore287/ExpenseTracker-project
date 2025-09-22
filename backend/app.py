# app.py — serve static site + Expenses API on 127.0.0.1:5500 (no CORS needed)
from flask import Flask, request, jsonify, send_from_directory, abort
from flask_sqlalchemy import SQLAlchemy
from datetime import date
from pathlib import Path
import os

# --- paths ---
BASE_DIR = Path(__file__).resolve().parent

# Serve the project root as static (index.html + assets/)
app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")

# --- Config ---
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///expenses.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

# --- Model ---
class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(100))
    date = db.Column(db.String(10), default=lambda: date.today().isoformat())
    user_id = db.Column(db.String(64))

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "amount": self.amount,
            "category": self.category,
            "date": self.date,
            "user_id": self.user_id,
        }

# Create tables once when the server first receives traffic
@app.before_first_request
def init_db():
    db.create_all()

# --- Static routes ---
@app.route("/")
def index():
    # adjust if your index.html lives elsewhere
    return send_from_directory(BASE_DIR, "index.html")

@app.route("/<path:path>")
def static_files(path: str):
    file_path = BASE_DIR / path
    if file_path.is_file():
        # serve any asset like assets/app.js, assets/style.css, images, etc.
        return send_from_directory(BASE_DIR, path)
    # let /api/* fall through to API routes; otherwise 404
    if not path.startswith("api/"):
        abort(404)
    abort(404)

# --- API ---
@app.get("/api/expenses")
def list_expenses():
    q = Expense.query
    user_id = request.args.get("user_id")  # fixed
    if user_id:
        q = q.filter_by(user_id=user_id)
    items = [e.to_dict() for e in q.order_by(Expense.date.desc(), Expense.id.desc()).all()]
    return jsonify(items)

@app.post("/api/expenses")
def create_expense():
    data = request.get_json(force=True) or {}
    e = Expense(
        title=(data.get("title") or "").strip(),
        amount=float(data.get("amount") or 0),
        category=data.get("category"),
        date=data.get("date") or date.today().isoformat(),
        user_id=data.get("user_id"),
    )
    if not e.title or e.amount <= 0:
        return jsonify({"error": "Invalid title or amount"}), 400
    db.session.add(e)
    db.session.commit()
    return jsonify(e.to_dict()), 201

@app.put("/api/expenses/<int:expense_id>")
@app.patch("/api/expenses/<int:expense_id>")
def update_expense(expense_id: int):
    e = Expense.query.get_or_404(expense_id)
    data = request.get_json(force=True) or {}
    if "title" in data: e.title = (data["title"] or "").strip()
    if "amount" in data: e.amount = float(data["amount"] or 0)
    if "category" in data: e.category = data["category"]
    if "date" in data: e.date = data["date"]
    if "user_id" in data: e.user_id = data["user_id"]
    db.session.commit()
    return jsonify(e.to_dict())

@app.delete("/api/expenses/<int:expense_id>")
def delete_expense(expense_id: int):
    e = Expense.query.get_or_404(expense_id)
    db.session.delete(e)
    db.session.commit()
    return ("", 204)

# --- Entrypoint ---
if __name__ == "__main__":
    # Stop any other server (e.g., Live Server) on 5500 first!
    app.run(host="127.0.0.1", port=5500, debug=True)
