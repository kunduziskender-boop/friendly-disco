"""Unified JSON errors: { \"code\", \"message\" } at document root."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from starlette.requests import Request
from starlette.responses import JSONResponse


def normalize_http_detail(detail: Any) -> dict[str, str]:
    if isinstance(detail, dict) and isinstance(detail.get("message"), str):
        code = detail.get("code")
        return {
            "code": str(code) if code else "HTTP_ERROR",
            "message": detail["message"],
        }
    if isinstance(detail, str):
        return {"code": "HTTP_ERROR", "message": detail}
    encoded = jsonable_encoder(detail)
    return {"code": "HTTP_ERROR", "message": str(encoded)}


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    body = normalize_http_detail(exc.detail)
    headers = dict(exc.headers) if getattr(exc, "headers", None) else None
    return JSONResponse(status_code=exc.status_code, content=body, headers=headers)


async def request_validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    errs = exc.errors()
    parts = []
    for e in errs[:8]:
        loc = ".".join(str(x) for x in e.get("loc", ()) if x != "body")
        msg = e.get("msg", "")
        ctx = loc or "request"
        parts.append(f"{ctx}: {msg}".strip(": "))
    message = "; ".join(parts) if parts else "Invalid request payload"
    return JSONResponse(status_code=400, content={"code": "VALIDATION_ERROR", "message": message})
