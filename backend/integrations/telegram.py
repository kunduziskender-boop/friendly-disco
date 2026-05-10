"""Telegram Bot API integration: уведомления о новых заявках.

Контракт: функции **никогда не выкидывают исключение** — любая ошибка
сводится к `return False` и записи метаданных в лог.

Ключи (из `.env`):
  TELEGRAM_BOT_TOKEN       — токен бота от @BotFather
  TELEGRAM_CHAT_IDS        — список chat_id через запятую (или один id)
  TELEGRAM_CHAT_ID         — алиас на одно значение (для совместимости)
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from core.logging_setup import get_logger

_logger = get_logger("crm.integrations.telegram")

_API_BASE = "https://api.telegram.org"
_TIMEOUT_SECONDS = 10


def is_configured() -> bool:
    return bool(os.getenv("TELEGRAM_BOT_TOKEN")) and bool(_chat_ids_raw())


def _chat_ids_raw() -> str:
    return (os.getenv("TELEGRAM_CHAT_IDS") or os.getenv("TELEGRAM_CHAT_ID") or "").strip()


def _chat_ids() -> list[str]:
    return [c.strip() for c in _chat_ids_raw().split(",") if c.strip()]


def _format_lead(lead: dict) -> str:
    """Compose a short notification text for the manager.

    В сообщение включаем контактные данные клиента — это содержание уведомления,
    которое менеджер увидит в чате (а не запись в лог CRM).
    """
    parts: list[str] = [
        f"Новая заявка #{lead.get('id', '?')}",
        f"Имя: {lead.get('name') or '—'}",
        f"Телефон: {lead.get('phone') or '—'}",
    ]
    if lead.get("email"):
        parts.append(f"Email: {lead['email']}")
    if lead.get("source"):
        parts.append(f"Источник: {lead['source']}")
    if lead.get("message"):
        parts.append(f"Сообщение: {lead['message'][:500]}")
    return "\n".join(parts)


def send_lead_notification(lead: dict) -> bool:
    """Послать уведомление о новом лиде в один или несколько чатов.

    Returns
    -------
    bool
        True — если хотя бы в один chat_id сообщение ушло успешно.
        False — иначе (включая случай, когда интеграция не настроена).
    """
    if not is_configured():
        _logger.info("telegram skipped: not configured")
        return False

    token = os.getenv("TELEGRAM_BOT_TOKEN") or ""
    text = _format_lead(lead)
    url = f"{_API_BASE}/bot{token}/sendMessage"
    any_ok = False

    for chat_id in _chat_ids():
        body = json.dumps({"chat_id": chat_id, "text": text}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
                status = getattr(resp, "status", None) or resp.getcode()
                if 200 <= int(status) < 300:
                    any_ok = True
                    _logger.info(
                        "telegram sent lead_id=%s status=%s", lead.get("id"), status
                    )
                else:
                    _logger.warning(
                        "telegram non-2xx lead_id=%s status=%s",
                        lead.get("id"), status,
                    )
        except urllib.error.HTTPError as exc:
            # Тело ответа намеренно не логируем (может содержать токен/секреты).
            _logger.warning(
                "telegram http error lead_id=%s status=%s",
                lead.get("id"), exc.code,
            )
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            _logger.warning(
                "telegram network error lead_id=%s error=%s",
                lead.get("id"), type(exc).__name__,
            )
        except Exception as exc:  # последний предохранитель: всё равно не падаем
            _logger.warning(
                "telegram unexpected error lead_id=%s error=%s",
                lead.get("id"), type(exc).__name__,
            )

    return any_ok
