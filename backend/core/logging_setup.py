"""Application-wide logging setup.

Stdout: один JSON‑объект на строку (по умолчанию ``LOG_JSON=1``) или текстовый
формат («legacy» через ``LOG_JSON=0``). Уровень — ``LOG_LEVEL``.

``sanitize_secret_fields()`` — перед логированием словарей: пароли, токены и
ключи авторизации заменяются на ``***`` (рекурсивно). Использовать там, где в
структурированном слое могут оказаться вложенные данные из запросов.

Классическое редактирование ПДн (email, телефоны) — отдельно в ``redact()``.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import traceback
from datetime import datetime, timezone
from typing import Any, Mapping

# ── Редактирование ПДн (как было: широкий список) ───────────────────────────
_REDACT_KEYS: frozenset[str] = frozenset(
    {
        "password",
        "passwd",
        "pwd",
        "token",
        "access_token",
        "refresh_token",
        "id_token",
        "secret",
        "client_secret",
        "api_key",
        "apikey",
        "x-api-key",
        "authorization",
        "auth",
        "bearer",
        "cookie",
        "set-cookie",
        "email",
        "phone",
        "name",
        "full_name",
        "first_name",
        "last_name",
        "address",
        "passport",
        "snils",
        "inn",
        "iban",
        "card",
        "card_number",
        "pan",
        "cvv",
        "cvc",
        "exp_month",
        "exp_year",
        "account_number",
    }
)

# Только секреты/учётные данные (не трогаем email/имена в структурных событиях,
# если они не попали в значения по ошибке).
_SECURITY_REDACT_KEYS: frozenset[str] = frozenset(
    {
        "password",
        "passwd",
        "pwd",
        "password_hash",
        "secret",
        "client_secret",
        "token",
        "access_token",
        "refresh_token",
        "id_token",
        "authorization",
        "api_key",
        "apikey",
        "cookie",
        "set-cookie",
    }
)

_REDACTED = "***"
_RESERVED_PAYLOAD_KEYS = frozenset({"timestamp", "level", "logger"})


def redact(data: Any) -> Any:
    """Return a copy of `data` with sensitive/PPI fields replaced by `***`.

    Supports dict/list/tuple arbitrarily nested; primitives pass through.
    """

    if isinstance(data, Mapping):
        out: dict[str, Any] = {}
        for k, v in data.items():
            key = str(k)
            if key.lower() in _REDACT_KEYS:
                out[key] = _REDACTED
            else:
                out[key] = redact(v)
        return out
    if isinstance(data, (list, tuple)):
        return type(data)(redact(item) for item in data)
    return data


def sanitize_secret_fields(data: Any) -> Any:
    """Recursively strip passwords, hashes, tokens, API keys — not broad PDN."""
    if isinstance(data, Mapping):
        out: dict[str, Any] = {}
        for k, v in data.items():
            key = str(k)
            lk = key.lower().replace("-", "_")
            if lk in _SECURITY_REDACT_KEYS:
                out[key] = _REDACTED
                continue
            if lk.endswith("_token") and lk != "timeout":
                out[key] = _REDACTED
                continue
            out[key] = sanitize_secret_fields(v)
        return out
    if isinstance(data, (list, tuple)):
        return type(data)(sanitize_secret_fields(item) for item in data)
    return data


def emit_json_event(logger: logging.Logger, level: int, **payload: Any) -> None:
    """One structured JSON record (поля после санитизации)."""
    reserved = frozenset({"timestamp", "level", "logger"})
    clean: dict[str, Any] = {}
    for k, v in payload.items():
        sk = str(k)
        if sk.lower() in reserved:
            raise ValueError(f"reserved log field: {k}")
        clean[sk] = sanitize_secret_fields(v)
    logger.log(level, "-", extra={"crm_payload": clean})


class _JsonFormatter(logging.Formatter):
    """Одна строка JSON: timestamp, level, logger + crm_payload + опционально exception."""

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%S.%fZ"
        )
        payload: dict[str, Any] = {
            "timestamp": ts,
            "level": record.levelname,
            "logger": record.name,
        }
        extras = getattr(record, "crm_payload", None)
        if isinstance(extras, Mapping):
            for k, v in extras.items():
                if str(k).lower() in _RESERVED_PAYLOAD_KEYS:
                    continue
                payload[str(k)] = v
        else:
            msg = record.getMessage()
            if msg and msg != "-":
                payload["message"] = msg

        if record.exc_info:
            et, ev, tb = record.exc_info
            payload["exception_type"] = et.__name__ if et else None
            payload["exception_message"] = str(ev) if ev is not None else ""
            payload["exception_traceback"] = "".join(
                traceback.format_exception(et, ev, tb)
            )
        try:
            return json.dumps(payload, ensure_ascii=False, default=str)
        except Exception:
            return json.dumps(
                {"timestamp": ts, "level": "ERROR", "logger": record.name},
                ensure_ascii=False,
            )


class _LegacyFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
        )


def setup_logging() -> None:
    """Configure root logger once. Idempotent."""

    level_name = (os.getenv("LOG_LEVEL") or "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    use_json = (os.getenv("LOG_JSON") or "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )

    root = logging.getLogger()
    root.setLevel(level)

    if not any(
        isinstance(h, logging.StreamHandler) and getattr(h, "_crm_marker", False)
        for h in root.handlers
    ):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(_JsonFormatter() if use_json else _LegacyFormatter())
        handler._crm_marker = True  # type: ignore[attr-defined]
        root.addHandler(handler)

    for noisy in ("googleapiclient.discovery_cache", "googleapiclient", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str = "crm") -> logging.Logger:
    return logging.getLogger(name)
