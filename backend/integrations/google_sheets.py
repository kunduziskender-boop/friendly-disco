"""Google Sheets integration: append-row для зеркалирования заявок менеджеру.

Контракт: ни одна функция не должна падать наружу — ошибки логируются и
функция возвращает `False`.

Ключи (из `.env`):
  GOOGLE_APPLICATION_CREDENTIALS — путь к JSON сервисного аккаунта
  GOOGLE_SHEETS_SPREADSHEET_ID   — ID таблицы (часть URL Google Sheets)
  GOOGLE_SHEETS_RANGE            — диапазон, например `Leads!A:H`
"""
from __future__ import annotations

import os
from typing import Any

from core.logging_setup import get_logger

_logger = get_logger("crm.integrations.sheets")

_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
_DEFAULT_RANGE = "Leads!A:H"


def is_configured() -> bool:
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    return bool(
        os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID")
        and creds_path
        and os.path.exists(creds_path)
    )


def _build_service():
    """Build Google Sheets API client. Импорт ленивый: модуль грузится даже
    без установленных google-* пакетов, если интеграция не настроена."""
    from google.oauth2 import service_account  # type: ignore[import-not-found]
    from googleapiclient.discovery import build  # type: ignore[import-not-found]

    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or ""
    creds = service_account.Credentials.from_service_account_file(
        creds_path, scopes=_SCOPES
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _row_from_lead(lead: dict) -> list[Any]:
    """Стабильный порядок колонок: id, created_at, name, phone, email,
    source, message, status. Менеджер настраивает заголовки таблицы
    под этот порядок."""
    return [
        lead.get("id", ""),
        lead.get("created_at", ""),
        lead.get("name", "") or "",
        lead.get("phone", "") or "",
        lead.get("email", "") or "",
        lead.get("source", "") or "",
        (lead.get("message") or "")[:1000],
        lead.get("status", "") or "",
    ]


def append_lead_row(lead: dict) -> bool:
    """Добавить строку с заявкой в Google Таблицу.

    Returns True при успешной записи. False при отсутствии конфигурации,
    отсутствии библиотек, сетевой ошибке или ошибке Sheets API. В лог пишем
    только тип ошибки и id лида — без тела запроса/ответа.
    """
    if not is_configured():
        _logger.info("sheets skipped: not configured")
        return False

    spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID") or ""
    range_name = os.getenv("GOOGLE_SHEETS_RANGE") or _DEFAULT_RANGE

    try:
        service = _build_service()
    except ImportError as exc:
        _logger.warning(
            "sheets disabled: missing dependency module=%s", exc.name or "?"
        )
        return False
    except Exception as exc:
        _logger.warning(
            "sheets credentials error lead_id=%s error=%s",
            lead.get("id"), type(exc).__name__,
        )
        return False

    try:
        service.spreadsheets().values().append(
            spreadsheetId=spreadsheet_id,
            range=range_name,
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": [_row_from_lead(lead)]},
        ).execute()
        _logger.info("sheets appended lead_id=%s", lead.get("id"))
        return True
    except Exception as exc:
        _logger.warning(
            "sheets append failed lead_id=%s error=%s",
            lead.get("id"), type(exc).__name__,
        )
        return False
