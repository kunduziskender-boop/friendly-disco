"""Request logging: JSON events for мутаций (POST/PATCH/DELETE).

Тела запросов в лог не пишутся."""
from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from core.logging_setup import emit_json_event, get_logger, sanitize_secret_fields

_logger = get_logger("crm.request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        method = request.method
        path = request.url.path
        client = request.client.host if request.client else "-"

        try:
            response: Response = await call_next(request)
        except BaseException as exc:
            duration_ms = int((time.monotonic() - start) * 1000)
            _logger.log(
                logging.ERROR,
                "-",
                extra={
                    "crm_payload": sanitize_secret_fields(
                        {
                            "event": "http_request_failed_before_response",
                            "method": method,
                            "path": path,
                            "duration_ms": duration_ms,
                            "client": client,
                            "exception_type": type(exc).__name__,
                            "exception_message": str(exc),
                        }
                    ),
                },
                exc_info=(type(exc), exc, exc.__traceback__),
            )
            raise

        duration_ms = int((time.monotonic() - start) * 1000)
        status = response.status_code
        if method in {"POST", "PATCH", "DELETE"}:
            emit_json_event(
                _logger,
                logging.INFO,
                event="http_mutation",
                method=method,
                path=path,
                url_path=path,
                status_code=status,
                duration_ms=duration_ms,
                client=client,
            )

        return response
