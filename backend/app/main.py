"""CertiFix AI - FastAPI application entrypoint."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import models  # noqa: F401  (registers tables)
from app.config import get_settings
from app.database.session import SessionLocal
from app.routes import (admin, auth, categories, certificates, contact, corrections, documents, notifications,
                        organizations, templates, verify)
from app.security.rate_limit import RateLimitMiddleware
from app.services.bootstrap import seed_default_categories
from app.services.storage import storage_root

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("certifix")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.validate_for_runtime()
    storage_root()
    try:
        with SessionLocal() as db:
            seed_default_categories(db)
    except Exception:  # database may not be migrated yet
        logger.warning("Could not seed default categories. Did you run 'alembic upgrade head'?")
    yield


app = FastAPI(
    title="CertiFix AI API",
    version="1.0.0",
    description="AI-powered certificate management, correction and verification platform.",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(RateLimitMiddleware, general_per_minute=settings.RATE_LIMIT_PER_MINUTE,
                   strict_per_minute=settings.AUTH_RATE_LIMIT_PER_MINUTE)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                   allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response


# ---------- Safe error handling ----------
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail},
                        headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(p) for p in e["loc"][1:]) or e["loc"][0],
               "message": e["msg"].removeprefix("Value error, ")} for e in exc.errors()]
    first = errors[0]["message"] if errors else "Invalid request"
    return JSONResponse(status_code=422, content={"detail": first, "errors": errors})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred. Please try again."})


# ---------- Routes ----------
for r in (auth, organizations, categories, templates, certificates, documents, corrections, verify,
          notifications, admin, contact):
    app.include_router(r.router, prefix=settings.API_PREFIX)


@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "ok", "app": settings.APP_NAME}


# ---------- Optional: serve the built SPA (single-container deployment) ----------
if settings.FRONTEND_DIST and Path(settings.FRONTEND_DIST).is_dir():
    dist = Path(settings.FRONTEND_DIST).resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        candidate = (dist / full_path).resolve()
        if full_path and dist in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")
