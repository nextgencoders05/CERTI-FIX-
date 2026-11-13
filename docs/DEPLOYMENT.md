# Deployment

## Option 1 — GitHub Pages (Direct Static / Hybrid Deployment)

CertiFix AI includes a GitHub Pages workflow template at `github-workflows/deploy-pages.yml`. After browser-uploading the project, create `.github/workflows/deploy-pages.yml` through GitHub's **Add file → Create new file** and paste that template, SPA deep-link routing (`frontend/public/404.html` and `frontend/index.html`), dynamic `<BrowserRouter>` subpath resolution (`frontend/src/main.jsx`), and a dual-mode API client (`frontend/src/services/api.js` + `frontend/src/services/localBackend.js`).

### Steps to Deploy on GitHub Pages

1. Upload or push the repository contents to a GitHub repository on the `main` (or `master`) branch.
2. In your GitHub repository, navigate to **Settings → Pages**.
3. Under **Build and deployment → Source**, select either:
   - **GitHub Actions** *(recommended)*, **or**
   - **Deploy from a branch** → choose the **`gh-pages`** branch and **`/ (root)`** folder, then click **Save**.
4. Once the **Deploy to GitHub Pages** workflow finishes in the **Actions** tab, your live website will be available at:
   `https://<your-username>.github.io/<repository-name>/`

### Connecting an External FastAPI Backend (Optional)

By default on GitHub Pages, the app runs using its built-in browser backend & OCR/PDF engine (`localBackend.js`) pre-seeded with demo accounts (`student@example.com`, `registrar@example.com`, `admin@example.com`) and demo certificate `CFX-2026-DEMO0001`.

If you also deploy the `backend/` FastAPI server (e.g. on Render, Railway, Fly.io, or a VM), set `CORS_ORIGINS=https://<your-username>.github.io` on the backend and add a repository variable in GitHub (**Settings → Secrets and variables → Actions → Variables**):
- `VITE_API_URL`: `https://your-backend-domain.example.com/api`

---

## Option 2 — Docker Compose (Single Host)

```bash
cp env.example .env          # set POSTGRES_PASSWORD, JWT_SECRET_KEY, PUBLIC_URL
docker compose up -d --build
docker compose exec backend python -m scripts.create_admin --email admin@yourdomain.com
```

- App: `http://<host>:8080` (change with `HTTP_PORT`). API docs: `/api/docs`.
- Services: `db` (PostgreSQL 16, volume `pgdata`), `backend` (FastAPI + Tesseract, volume `storage`, not published), `frontend` (nginx serving the SPA and proxying `/api`).
- Migrations run automatically when the backend container starts (`alembic upgrade head`).
- Put a TLS-terminating reverse proxy (Caddy, Traefik, nginx, a cloud load balancer) in front and set `PUBLIC_URL=https://your-domain` so QR codes and CORS use HTTPS.

## Option 3 — Single Container (PaaS)

The root `Dockerfile` builds the React app and serves it from FastAPI (`FRONTEND_DIST`).

```bash
docker build -t certifix-ai .
docker run -p 8000:8000 \
  -e DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@HOST:5432/certifix \
  -e JWT_SECRET_KEY=... -e PUBLIC_VERIFY_BASE_URL=https://your-domain/verify \
  -e CORS_ORIGINS=https://your-domain \
  -v certifix-storage:/data/storage certifix-ai
```

Use a managed PostgreSQL and a **persistent volume** for `/data/storage` (uploaded documents and issued PDFs live there).

## Option 4 — Manual (VM)

1. Install Python 3.11+, Node 20+, PostgreSQL 14+, and Tesseract (`apt install tesseract-ocr`).
2. Backend: `pip install -r requirements.txt`, configure `backend/.env`, `alembic upgrade head`, run `uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2 --proxy-headers` under systemd.
3. Frontend: `npm ci && npm run build`, serve `frontend/dist` with nginx using `frontend/nginx.conf` (change `proxy_pass` to `http://127.0.0.1:8000`).

## Production checklist

- [ ] `ENVIRONMENT=production` and a random `JWT_SECRET_KEY` ≥ 32 chars (startup fails otherwise).
- [ ] Strong database password; database not exposed publicly.
- [ ] HTTPS everywhere; `PUBLIC_URL` / `PUBLIC_VERIFY_BASE_URL` / `CORS_ORIGINS` use the real domain.
- [ ] Persistent, backed-up volume for `STORAGE_DIR`; regular PostgreSQL backups.
- [ ] Schedule retention daily: `python -m scripts.purge_uploads` (or `POST /api/admin/retention/run`).
- [ ] Create the first admin with `scripts.create_admin`; do **not** run `scripts.seed_demo`.
- [ ] Rate limiting is per process; with several workers/instances add a shared limiter at the proxy (nginx `limit_req`, Cloudflare, etc.).
- [ ] The API trusts `X-Forwarded-For` (`--forwarded-allow-ips='*'`) because it is only reachable through the proxy. Keep the backend port private.
- [ ] Review and adapt the Privacy Policy and Terms pages for your legal entity.
