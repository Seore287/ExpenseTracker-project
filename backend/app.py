from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import date

app = Flask(__name__)
CORS(app)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://expenses.db'
app.config['SQLALCHEMY_TRACK_MODIFICATION'] = False

db = SQLAlchemy(app)

class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(100))
    date = db.Column(db.String(10), default=lambda: date.today().isoformat())
    user_id = db.Column(db.String(64))

    def to_dict(self):
        return dict(id=self.id, title=self.title, amount=self.amount, category=self.category, date=self.date, user_id=self.user_id)
    
@app.before_request
def init_db():
    db.create_all()

@app.get('/api/expenses')
def list_expenses():
    q = Expense.query
    user_id = request.args.get(user_id)
    if user_id:
        q = q.filter_by(user_id=user_id)
    items = [e.to_dict() for e in q.order_by(Expense.date.desc(), Expense.id.desc()).all()]
    return jsonify(items)

@app.post('/api/expenses')
def create_expenses():
    data = request.json or {}
    e = Expense(title=data.get('title','').strip(), amount=float(data.get('amount',0)), category=data.get('category'), date=data.get('date'), user_id=data.get('user_id'))
    if not e.title or e.amount <= 0:
        return jsonify({'error':'Invalid title or amount'}), 400
    db.session.add(e); db.session.commit()
    return jsonify(e.to_dict()), 201

@app.put('/api/expenses/<int:expense_id>')
@app.patch('/api/expenses/<int:expense_id>')
def update_expense(expense_id):
    e = Expense.query.get_or_404(expense_id)
    data = request.json or {}
    if 'title' in data: e.title = data['title']
    if 'amount' in data: e.amount = float(data['amount'])
    if 'category' in data: e.category = data['category']
    if 'date' in data: e.date = data['date']
    if 'user_id' in data: e.user_id = data['user_id']
    db.session.commit()
    return jsonify(e.to_dict())

@app.delete('/api/expenses/<int:expense_id>')
def delete_expense(expense_id):
    e = Expense.query.get_or_404(expense_id)
    db.session.delete(e); db.session.commit()
    return ('',204)

if __name__ == '__main__':
    app.run(debug=True)
