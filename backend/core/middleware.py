"""JWT validation middleware for protected `/api/*` routes."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from core.security import try_decode_token


# Paths that do not require a Bearer JWT (under /api).
_API_AUTH_FREE: frozenset[str] = frozenset(
    {
        "/api/auth/register",
        "/api/auth/login",
    }
)


def _is_exempt(path: str) -> bool:
    if path in ("/", "/openapi.json", "/favicon.ico"):
        return True
    if path.startswith("/docs") or path.startswith("/redoc"):
        return True
    if not path.startswith("/api"):
        return True
    # Публичные эндпоинты (приём заявок с сайта и т.п.) — без JWT.
    if path.startswith("/api/public/"):
        return True
    return path in _API_AUTH_FREE


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """Require valid JWT for all `/api/*` except register/login; OPTIONS passes through."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if _is_exempt(path):
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={
                    "code": "NOT_AUTHENTICATED",
                    "message": "Missing or invalid Authorization header",
                },
            )

        token = auth_header.removeprefix("Bearer ").strip()
        payload = try_decode_token(token)
        if payload is None:
            return JSONResponse(
                status_code=401,
                content={
                    "code": "INVALID_TOKEN",
                    "message": "Could not validate credentials",
                },
            )

        request.state.jwt_payload = payload
        return await call_next(request)
