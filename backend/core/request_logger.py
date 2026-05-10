"""Request metadata logging middleware.

Пишем в лог только метаданные: метод, путь, статус, длительность. Тела
запросов и ответов не логируем — там могут быть пароли, токены и ПДн.
"""
from __future__ import annotations

import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from core.logging_setup import get_logger

_logger = get_logger("crm.request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        method = request.method
        path = request.url.path
        client = request.client.host if request.client else "-"

        try:
            response: Response = await call_next(request)
        except Exception:
            duration_ms = int((time.monotonic() - start) * 1000)
            # Тип исключения логируем без сообщения — там может быть ПДн.
            _logger.exception(
                "request unhandled method=%s path=%s client=%s duration_ms=%d",
                method, path, client, duration_ms,
            )
            raise

        duration_ms = int((time.monotonic() - start) * 1000)
        _logger.info(
            "method=%s path=%s status=%d duration_ms=%d client=%s",
            method, path, response.status_code, duration_ms, client,
        )
        return response
