# Inventory & Warehouse System

Flask + PostgreSQL + plain HTML/CSS/JS.

## Setup
```bash
python -m venv venv
venv\Scripts\activate          # Windows   (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt

copy .env.example .env         # Mac/Linux: cp .env.example .env  -> then edit values

createdb -U postgres inventory_db
psql -U postgres -d inventory_db -f schema.sql
psql -U postgres -d inventory_db -f seed.sql

python app.py
```
Open http://localhost:5000/health  ->  `{"database":"connected","status":"ok"}`

## Demo logins (password for all: `Pass@123`)
| Role | Email |
|---|---|
| Admin | admin@inv.com |
| Manager (Coimbatore) | ravi@inv.com |
| Staff (Coimbatore) | priya@inv.com |
| Manager (Chennai) | karthik@inv.com |
| Supplier (ABC Traders) | supplier@abc.com |

## Structure
```
app.py        Flask entry point        db.py        DB connection + transaction helper
config.py     env settings             schema.sql   tables + constraints
auth/         login, JWT, decorators   seed.sql     demo data
routes/       API endpoints            services/    business rules (stock logic)
static/ templates/   frontend
```

## Git workflow
- `main` = always working code
- one branch per module: `feature/auth`, `feature/stock`, ...
- `git pull` before you start, small commits, merge via pull request
