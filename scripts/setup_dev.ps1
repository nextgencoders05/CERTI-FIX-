# One-time local development setup for Windows PowerShell.
# Uses SQLite by default; edit backend\.env to use PostgreSQL.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

Write-Host '==> Backend'
Set-Location "$Root\backend"
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) {
    $secret = & .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
    (Get-Content env.example) `
        -replace '^DATABASE_URL=.*', 'DATABASE_URL=sqlite:///./dev.db' `
        -replace '^JWT_SECRET_KEY=.*', "JWT_SECRET_KEY=$secret" | Set-Content -Encoding utf8 .env
    Write-Host 'Created backend\.env (SQLite).'
}
& .\.venv\Scripts\alembic.exe upgrade head

Write-Host '==> Frontend'
Set-Location "$Root\frontend"
npm install
if (-not (Test-Path .env)) { Copy-Item env.example .env }

Write-Host ''
Write-Host 'Setup complete.'
Write-Host '  Create an admin:    cd backend; .\.venv\Scripts\python -m scripts.create_admin --email you@example.com'
Write-Host '  Optional demo data: cd backend; .\.venv\Scripts\python -m scripts.seed_demo'
Write-Host '  Run API:            cd backend; .\.venv\Scripts\uvicorn app.main:app --reload'
Write-Host '  Run web app:        cd frontend; npm run dev   (http://localhost:5173)'
