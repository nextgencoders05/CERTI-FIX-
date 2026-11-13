# CertiFix AI

**Certificate management, correction and verification, with OCR built in.**

CertiFix AI lets authorized organizations design templates and issue verifiable certificates. Recipients upload a certificate and OCR reads it. They then request a correction, and only the **issuing organization** can approve it and issue a new, officially corrected certificate. Anyone can verify a certificate by its ID, QR code or PDF.

> Uploaded documents are never edited. A correction always produces a **new** certificate with a new ID, and the original is marked *superseded*. OCR output is treated as a suggestion, never as proof of authenticity.

---

## Deploying Directly to GitHub Pages

The React frontend can deploy to **GitHub Pages** without an external server. GitHub Pages uses browser-local demo mode, not the production backend:

1. **Create a GitHub Repository** and upload or push the contents of this project to the `main` branch.
2. Open your repository on GitHub and go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose either:
   - **GitHub Actions** (recommended — `github-workflows/deploy-pages.yml` (copy it into `.github/workflows/deploy-pages.yml` using GitHub's **Add file → Create new file**) builds and deploys automatically), **or**
   - **Deploy from a branch** → select branch **`gh-pages`** and folder **`/ (root)`**, then click **Save** (the workflow automatically publishes the built site to `gh-pages` on every push).
4. Wait ~1 minute for the **Deploy to GitHub Pages** workflow in the **Actions** tab to finish, then open your live site at `https://<your-username>.github.io/<repository-name>/`.

### How Backend & AI/OCR Work on GitHub Pages (Dual-Mode Architecture)

Because GitHub Pages hosts static files only and cannot run a Python/PostgreSQL server directly:
- **Standalone GitHub Pages Mode (Automatic Default):** When hosted on `*.github.io` without an external `VITE_API_URL`, `frontend/src/services/api.js` automatically routes API requests to the built-in browser engine (`frontend/src/services/localBackend.js`). This runs the complete authentication/RBAC system, PDF text-layer & heuristic OCR field extraction, live PDF certificate & QR code generation, SHA-256 tamper verification, correction workflows, and persistent `localStorage` database directly in the browser.
- **Full-Stack Remote Backend Mode (Optional):** To connect the GitHub Pages frontend to a live FastAPI + PostgreSQL + Tesseract backend (deployed on Render, Railway, Fly.io, Cloud Run, or a VM), add a repository variable `VITE_API_URL` in **Settings → Secrets and variables → Actions → Variables** pointing to your backend API (e.g. `https://your-api.example.com/api`).

### Pre-Seeded Demo Accounts (GitHub Pages Standalone Mode)

| Role | Email | Password | Pre-loaded Data |
|---|---|---|---|
| **User (Recipient)** | `student@example.com` | `Demo1234!` *(or any password)* | Issued certificate `CFX-2026-DEMO0001` (with intentional typo `"Sam Studnet"`) & uploaded OCR document |
| **Organization (Issuer)** | `registrar@example.com` | `Demo1234!` *(or any password)* | Verified organization *Demo Institute of Technology* & *Internship 2026* template |
| **Super Admin** | `admin@example.com` | `Demo1234!` *(or any password)* | Full platform overview, organization verification, users, categories & audit logs |

Public verification can also be tested immediately at `/verify` using Certificate ID **`CFX-2026-DEMO0001`**.

---

## Features

| Area | What's included |
|---|---|
| **Roles** | Public user, organization (needs admin verification), super admin |
| **OCR** | PDF text layer (PyMuPDF / browser stream parser), or OpenCV preprocessing + Tesseract for scans and photos; heuristic field extraction with confidence scores |
| **Corrections** | Upload → review the OCR fields → request → issuer review (under review / approve / reject) → corrected re-issue. Full history, original document kept |
| **Certificates** | Template designer (colors, border, font, orientation, logo, signatory, `{placeholders}`), unique IDs, QR verification, PDF generation, revocation |
| **Verification** | Public lookup by ID / QR, plus upload-a-PDF tamper check (SHA-256) |
| **Admin** | Platform stats, organization verification, user management, categories (8 built-in + custom), all requests and certificates, audit logs, contact inbox, retention runs |
| **Security** | bcrypt, JWT, role-based access, private storage, file validation, size limits, rate limiting, audit logging, safe errors, retention policy |
| **UI** | Responsive React + Tailwind SaaS design: sidebar dashboards, stat cards, searchable/filterable tables, notifications, loading/error/empty states, confirmation dialogs |

## Tech stack

- **Frontend:** React 18, Vite 5, Tailwind CSS 3, React Router 6, Axios, lucide-react icons
- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2, Pydantic 2, Alembic
- **Database:** PostgreSQL (SQLite works for local development and tests; browser `localStorage` engine on GitHub Pages)
- **Documents & AI:** Tesseract OCR (pytesseract), OpenCV, Pillow, PyMuPDF, ReportLab, qrcode (plus in-browser PDF/QR & heuristic OCR engine for static hosting)
- **Ops:** Docker, docker compose, nginx, GitHub Actions CI & GitHub Pages CD

## Project structure

```
certifix-ai/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, middleware, error handling
│   │   ├── config.py          # settings from environment
│   │   ├── database/          # engine, session, Base
│   │   ├── models/            # SQLAlchemy models (12 tables)
│   │   ├── schemas/           # Pydantic schemas & validation
│   │   ├── routes/            # auth, organizations, categories, templates, certificates,
│   │   │                      # documents, corrections, verify, notifications, admin, contact
│   │   ├── services/          # storage, file validation, PDF/QR, issuing, audit, retention…
│   │   ├── ocr/               # text extraction + field extraction
│   │   └── security/          # passwords, JWT, RBAC dependencies, rate limiter
│   ├── alembic/               # migrations (0001 initial schema + default categories)
│   ├── scripts/               # create_admin, seed_demo, purge_uploads
│   ├── tests/                 # pytest suite
│   ├── Dockerfile
│   ├── requirements.txt
│   └── env.example
├── frontend/
│   ├── public/                # favicon.svg, 404.html (SPA fallback), .nojekyll
│   ├── src/
│   │   ├── components/        # UI kit, DataTable, Modal, NotificationBell, viewers
│   │   ├── layouts/           # public + dashboard layouts
│   │   ├── pages/             # landing, auth, verify, privacy, terms, contact
│   │   ├── dashboard/         # user/, org/, admin/, shared/
│   │   ├── hooks/             # useAuth, useToast, useApi
│   │   ├── services/          # API client + GitHub Pages serverless backend engine
│   │   └── utils/
│   ├── Dockerfile, nginx.conf
│   ├── package.json
│   └── env.example
├── docs/                      # API.md, ARCHITECTURE.md, DEPLOYMENT.md, SECURITY.md, openapi.json
├── scripts/                   # setup_dev.sh / setup_dev.ps1
├── github-workflows/          # visible workflow templates for GitHub Chrome upload
├── docker-compose.yml
├── Dockerfile                 # all-in-one image
├── env.example
└── README.md
```

## Quick start with Docker

```bash
cp env.example .env    # set POSTGRES_PASSWORD and JWT_SECRET_KEY
docker compose up -d --build
docker compose exec backend python -m scripts.create_admin --email admin@yourdomain.com
```
Open http://localhost:8080. API docs are at http://localhost:8080/api/docs.

## Local development

**Prerequisites:** Python 3.11+, Node.js 20+, and optionally PostgreSQL 14+ and [Tesseract OCR](https://tesseract-ocr.github.io/tessdoc/Installation.html). Without Tesseract, PDFs that have a text layer still work. Scanned images are reported as "OCR unavailable" so the user can fill in the fields manually.

Automated setup: run `scripts/setup_dev.sh` (macOS/Linux/Git Bash) or `scripts\setup_dev.ps1` (Windows). Or do it by hand:

### 1. Database
PostgreSQL:
```sql
CREATE USER certifix WITH PASSWORD 'choose-a-password';
CREATE DATABASE certifix OWNER certifix;
```
Then set `DATABASE_URL=postgresql+psycopg2://certifix:choose-a-password@localhost:5432/certifix` in `backend/.env`.
For a zero-setup local run, use `DATABASE_URL=sqlite:///./dev.db` instead.

### 2. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp env.example .env               # edit DATABASE_URL and JWT_SECRET_KEY
alembic upgrade head               # creates tables + default categories
python -m scripts.create_admin --email admin@example.com
python -m scripts.seed_demo        # optional demo org/user/certificate
uvicorn app.main:app --reload      # http://localhost:8000/api/docs
```
On Windows, if Tesseract isn't on `PATH`, set `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe`.

### 3. Frontend
```bash
cd frontend
npm install
cp env.example .env
npm run dev                        # http://localhost:5173 (proxies /api to :8000)
```

### Tests
```bash
cd backend && pytest               # 34 tests: auth, RBAC, uploads/OCR, full correction workflow, PDFs, verification, admin
cd frontend && npm run build       # production build check
```

## Environment variables

Backend (`backend/.env`, see `backend/env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | postgres on localhost | SQLAlchemy URL |
| `JWT_SECRET_KEY` | *(insecure placeholder)* | Must be ≥32 random chars in production |
| `ENVIRONMENT` | `development` | `production` enforces secret strength and blocks the demo seed |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Token lifetime |
| `STORAGE_DIR` | `storage` | Private file storage root |
| `MAX_UPLOAD_MB` / `MAX_PDF_PAGES` | `10` / `10` | Upload limits |
| `UPLOAD_RETENTION_DAYS` | `180` | Retention for uploaded documents |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `PUBLIC_VERIFY_BASE_URL` | `http://localhost:5173/verify` | Base of the QR verification links |
| `TESSERACT_CMD` / `OCR_LANG` | — / `eng` | Tesseract binary path and language |
| `RATE_LIMIT_PER_MINUTE` / `AUTH_RATE_LIMIT_PER_MINUTE` | `300` / `20` | Per-IP limits |
| `FRONTEND_DIST` | — | Serve a built SPA from the API (single-container mode) |

Frontend (`frontend/.env`): `VITE_API_URL` (default `/api`), `VITE_BASE_PATH` (default `./` or `/<repo-name>/` on GitHub Actions).

## Documentation

- [API reference](docs/API.md) (+ [OpenAPI spec](docs/openapi.json), and live docs at `/api/docs`)
- [Architecture & data model](docs/ARCHITECTURE.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Security & privacy design](docs/SECURITY.md)

## Publishing to GitHub

For the browser-only upload steps (including the one-time workflow-file creation), follow [GITHUB_CHROME_UPLOAD_GUIDE.md](GITHUB_CHROME_UPLOAD_GUIDE.md).


```bash
git init
git add .
git commit -m "Initial commit: CertiFix AI"
git branch -M main
git remote add origin https://github.com/<your-username>/certifix-ai.git
git push -u origin main
```
`GITIGNORE_TEMPLATE.txt` contains rules you can optionally create as `.gitignore` in GitHub; it excludes `.env`, virtual environments, `node_modules`, builds, databases and uploaded files. The workflow templates are in `github-workflows/`. **After uploading this ZIP through Chrome, create `.github/workflows/deploy-pages.yml` using GitHub's Add file → Create new file and paste the contents of `github-workflows/deploy-pages.yml`.** Only then will GitHub Actions automatically deploy the site. The optional CI workflow can be added the same way from `github-workflows/ci.yml`.

## Limitations

- Email delivery (verification emails, password reset, email notifications) isn't implemented. Notifications are in-app only.
- OCR field extraction uses heuristics tuned for English certificate wording. Users always review and edit the values.
- The rate limiter is in-memory per process. Add a proxy-level limiter when running several instances.
- The JWT is stored in `localStorage` (see [SECURITY.md](docs/SECURITY.md)).

## License

Add a license of your choice (for example MIT) before publishing.
