"""Application-wide logging setup.

Логи в stdout, формат — `time level logger message`. Уровень — переменная
окружения `LOG_LEVEL` (по умолчанию INFO).

Помимо `setup_logging()` модуль предоставляет утилиту `redact()` для
безопасного логирования словарей: ключи из чёрного списка (пароли, токены,
персональные данные, платёжная информация) заменяются на `***`. Используйте её
везде, где может потребоваться сериализовать произвольные данные в лог.
"""
from __future__ import annotations

import logging
import os
import sys
from typing import Any, Mapping


# Чёрный список ключей для редактирования. Сравнение нечувствительно к регистру.
# Цель: не утечь в логи пароли, токены, ПДн и платёжные данные.
_REDACT_KEYS: frozenset[str] = frozenset(
    {
        "password", "passwd", "pwd",
        "token", "access_token", "refresh_token", "id_token",
        "secret", "client_secret", "api_key", "apikey", "x-api-key",
        "authorization", "auth", "bearer", "cookie", "set-cookie",
        # ПДн
        "email", "phone", "name", "full_name", "first_name", "last_name",
        "address", "passport", "snils", "inn", "iban",
        # Платёжная информация
        "card", "card_number", "pan", "cvv", "cvc", "exp_month", "exp_year",
        "account_number",
    }
)

_REDACTED = "***"


def redact(data: Any) -> Any:
    """Return a copy of `data` with sensitive fields replaced by `***`.

    Поддерживает dict / list / tuple любой вложенности; примитивные значения
    возвращаются как есть. Используйте перед записью пользовательских данных
    в лог.
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


def setup_logging() -> None:
    """Configure root logger once. Idempotent.

    LOG_LEVEL controls verbosity. Третьесторонние логгеры (uvicorn, httpx,
    googleapiclient) приглушаются до WARNING чтобы не шумели метаданными
    запросов и не выводили токены в дебаг-логе.
    """
    level_name = (os.getenv("LOG_LEVEL") or "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)

    # Не плодим обработчики при reload (uvicorn --reload).
    if not any(
        isinstance(h, logging.StreamHandler) and getattr(h, "_crm_marker", False)
        for h in root.handlers
    ):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s %(name)s %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        )
        handler._crm_marker = True  # type: ignore[attr-defined]
        root.addHandler(handler)

    # Глушим болтливые сторонние логгеры.
    for noisy in ("googleapiclient.discovery_cache", "googleapiclient", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str = "crm") -> logging.Logger:
    return logging.getLogger(name)
