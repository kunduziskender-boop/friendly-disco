from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
import os

load_dotenv()

from api import auth, users, clients, cases, tasks, calendar, documents, finance, leads
from core.logging_setup import setup_logging
from core.middleware import JWTAuthMiddleware
from core.request_logger import RequestLoggingMiddleware
from core.error_responses import (
    http_exception_handler,
    request_validation_exception_handler,
)
from storage.database import init_db, migrate_db
from storage.seed import ensure_test_user, seed_db
from core.rate_limit import limiter


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
    return await http_exception_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(_request: Request, _exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "code": "RATE_LIMITED",
            "message": "Слишком много запросов с этого адреса. Повторите позже.",
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
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
