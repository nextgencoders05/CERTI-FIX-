"""Simple in-memory sliding-window rate limiter middleware.

Per-process only. For multi-instance deployments put a shared limiter (e.g. Redis or the
reverse proxy) in front of the API; this middleware remains a safe last line of defence.
"""
import threading
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

STRICT_PATH_PREFIXES = (
    "/api/auth/login",
    "/api/auth/register",
    "/api/contact",
    "/api/verify",
)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, general_per_minute: int, strict_per_minute: int):
        super().__init__(app)
        self.general = general_per_minute
        self.strict = strict_per_minute
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _allow(self, key: str, limit: int) -> tuple[bool, int]:
        now = time.monotonic()
        window_start = now - 60
        with self._lock:
            q = self._hits[key]
            while q and q[0] < window_start:
                q.popleft()
            if len(q) >= limit:
                retry_after = int(60 - (now - q[0])) + 1
                return False, retry_after
            q.append(now)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or not request.url.path.startswith("/api"):
            return await call_next(request)
        ip = client_ip(request)
        path = request.url.path
        is_strict = path.startswith(STRICT_PATH_PREFIXES) and request.method in ("POST", "GET")
        limit, bucket = (self.strict, "strict") if is_strict else (self.general, "general")
        allowed, retry_after = self._allow(f"{bucket}:{ip}", limit)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down and try again shortly."},
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)
