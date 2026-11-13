# All-in-one image: builds the React app and serves it from the FastAPI process.
# Useful for single-container platforms (Render, Railway, Fly.io, Cloud Run).
# Requires DATABASE_URL (PostgreSQL) and JWT_SECRET_KEY at runtime.
#   docker build -t certifix-ai .
#   docker run -p 8000:8000 -e DATABASE_URL=... -e JWT_SECRET_KEY=... -v certifix-storage:/data/storage certifix-ai

FROM node:20-alpine AS frontend
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ .
ENV VITE_API_URL=/api
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ .
COPY --from=frontend /web/dist /app/frontend_dist
RUN useradd --create-home --uid 1000 certifix && mkdir -p /data/storage && chown -R certifix:certifix /app /data
USER certifix
ENV STORAGE_DIR=/data/storage FRONTEND_DIST=/app/frontend_dist ENVIRONMENT=production
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
