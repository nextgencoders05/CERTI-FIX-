#!/usr/bin/env bash
# One-time local development setup (macOS / Linux / Git Bash).
# Uses SQLite by default so you can start without PostgreSQL; edit backend/.env to use PostgreSQL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Backend"
cd "$ROOT/backend"
python3 -m venv .venv 2>/dev/null || python -m venv .venv
if [ -f .venv/bin/activate ]; then source .venv/bin/activate; else source .venv/Scripts/activate; fi
pip install -r requirements.txt
if [ ! -f .env ]; then
  SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
  cp env.example .env
  sed -i.bak "s#^DATABASE_URL=.*#DATABASE_URL=sqlite:///./dev.db#; s#^JWT_SECRET_KEY=.*#JWT_SECRET_KEY=${SECRET}#" .env && rm -f .env.bak
  echo "Created backend/.env (SQLite)."
fi
alembic upgrade head

echo "==> Frontend"
cd "$ROOT/frontend"
npm install
[ -f .env ] || cp env.example .env

cat <<'EOF'

Setup complete.
  Create an admin:     cd backend && python -m scripts.create_admin --email you@example.com
  Optional demo data:  cd backend && python -m scripts.seed_demo
  Run API:             cd backend && uvicorn app.main:app --reload
  Run web app:         cd frontend && npm run dev   (http://localhost:5173)
EOF
