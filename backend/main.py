from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
import logging
import os

load_dotenv()


def _maybe_init_sentry() -> None:
    """Sentry включается только при заданном SENTRY_DSN (секрет в .env / Render)."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    raw_traces = os.getenv("SENTRY_TRACES_SAMPLE_RATE", "").strip()
    try:
        traces_sample_rate = float(raw_traces) if raw_traces else 0.0
    except ValueError:
        traces_sample_rate = 0.0

    env = os.getenv("SENTRY_ENVIRONMENT", "").strip()
    if not env:
        debug = os.getenv("DEBUG", "").strip().lower() in ("true", "1", "yes")
        env = "development" if debug else "production"

    sentry_sdk.init(
        dsn=dsn,
        integrations=[FastApiIntegration()],
        traces_sample_rate=max(0.0, min(1.0, traces_sample_rate)),
        environment=env,
        release=os.getenv("SENTRY_RELEASE", "").strip() or None,
        send_default_pii=False,
    )


_maybe_init_sentry()

from api import auth, users, clients, cases, tasks, calendar, documents, finance, leads
from core.logging_setup import setup_logging, get_logger, emit_json_event
from core.middleware import JWTAuthMiddleware
from core.request_logger import RequestLoggingMiddleware
from core.error_responses import (
    http_exception_handler,
    request_validation_exception_handler,
    normalize_http_detail,
)
from storage.database import init_db, migrate_db
from storage.seed import ensure_test_user, seed_db
from core.rate_limit import limiter

_err_log = get_logger("crm.errors")


def _cors_allow_origins() -> list[str]:
    """Origins для CORS с credentials: '*' недопустим (браузер + Starlette)."""
    default = (
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://127.0.0.1:4173,http://localhost:4173,"
        "http://127.0.0.1:8010,http://localhost:8010"
    )
    raw = os.getenv("CORS_ORIGINS", default)
    origins = [o.strip() for o in raw.split(",") if o.strip() and o.strip() != "*"]
    if not origins:
        origins = [o.strip() for o in default.split(",") if o.strip()]
    return origins


setup_logging()

app = FastAPI(
    title=os.getenv("APP_TITLE", "Lawyer CRM API"),
    version=os.getenv("APP_VERSION", "1.0.0"),
    description="CRM-система для адвоката — backend API",
)
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(JWTAuthMiddleware)
# Logging middleware добавляем последним — Starlette применяет middleware в
# порядке LIFO, поэтому добавленный последним становится самым внешним и
# фиксирует финальный статус ответа (включая 401 от JWTAuthMiddleware).
app.add_middleware(RequestLoggingMiddleware)


init_db()
migrate_db()
seed_db()
ensure_test_user()


@app.exception_handler(HTTPException)
async def unified_http_exception_handler(request: Request, exc: HTTPException):
    body = normalize_http_detail(exc.detail)
    msg = (body.get("message") or "").strip()
    if len(msg) > 1200:
        msg = msg[:1200] + "…"
    lvl = logging.ERROR if exc.status_code >= 500 else logging.WARNING
    emit_json_event(
        _err_log,
        lvl,
        event="http_exception",
        path=request.url.path,
        method=request.method,
        status_code=exc.status_code,
        code=body.get("code"),
        message=msg,
    )
    return await http_exception_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errs = exc.errors()
    errs_summary: list[dict[str, str]] = []
    for e in errs[:40]:
        loc = tuple(e.get("loc", ()))
        parts = [str(x) for x in loc if x != "body"]
        field = ".".join(parts) if parts else "body"
        raw_msg = e.get("msg", "")
        sm = str(raw_msg).strip() if raw_msg is not None else ""
        errs_summary.append(
            {
                "field": field,
                "issue_type": str(e.get("type", "")),
                "message": sm[:240],
            }
        )
    emit_json_event(
        _err_log,
        logging.WARNING,
        event="request_validation_failed",
        path=request.url.path,
        method=request.method,
        validation_error_count=len(errs),
        issues=errs_summary,
    )
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, _exc: RateLimitExceeded) -> JSONResponse:
    emit_json_event(
        _err_log,
        logging.WARNING,
        event="rate_limit_exceeded",
        path=request.url.path,
        method=request.method,
    )
    return JSONResponse(
        status_code=429,
        content={
            "code": "RATE_LIMITED",
            "message": "Слишком много запросов с этого адреса. Повторите позже.",
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    try:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    except Exception:
        pass
    _err_log.log(
        logging.ERROR,
        "-",
        extra={
            "crm_payload": {
                "event": "unhandled_exception",
                "path": request.url.path,
                "method": request.method,
                "exception_type": type(exc).__name__,
                "exception_message": str(exc),
            }
        },
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "Internal server error",
        },
    )


app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
# Совместимость со старыми клиентами (путь без префикса /api не требует JWT в middleware).
app.include_router(auth.router, prefix="/auth", tags=["Auth"], include_in_schema=False)
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(clients.router, prefix="/api/clients", tags=["Clients"])
app.include_router(cases.router, prefix="/api/cases", tags=["Cases"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["Tasks"])
app.include_router(calendar.router, prefix="/api/calendar-events", tags=["Calendar"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(finance.router, prefix="/api/finance-records", tags=["Finance"])
app.include_router(leads.public_router, prefix="/api/public/leads", tags=["Public Leads"])
app.include_router(leads.router, prefix="/api/leads", tags=["Leads"])


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "app": os.getenv("APP_TITLE", "Lawyer CRM API")}
