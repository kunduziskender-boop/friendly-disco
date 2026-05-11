"""Унифицированные JSON-ошибки.

Обычно корень: ``code``, ``message``. Для ``RequestValidationError`` дополнительно
``errors``: список ``{ "field", "message" }``.
"""

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


def _validation_field_from_loc(loc: tuple[Any, ...] | list[Any]) -> str:
    parts = [str(x) for x in loc if x != "body"]
    return ".".join(parts) if parts else "request"


async def request_validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    _ = request
    errs = exc.errors()
    errors_out: list[dict[str, str]] = []
    parts: list[str] = []
    for e in errs[:20]:
        loc = tuple(e.get("loc", ()))
        field = _validation_field_from_loc(loc)
        raw_msg = e.get("msg", "")
        msg = str(raw_msg).strip() if raw_msg is not None else ""
        if not msg:
            msg = "Invalid value"
        errors_out.append({"field": field, "message": msg})
        parts.append(f"{field}: {msg}".strip(": "))
    message = "; ".join(parts) if parts else "Invalid request payload"
    return JSONResponse(
        status_code=400,
        content={
            "code": "VALIDATION_ERROR",
            "message": message,
            "errors": errors_out,
        },
    )
