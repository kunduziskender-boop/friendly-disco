"""Leads API.

* `POST /api/public/leads`            — публичный, принимает заявку с сайта.
* `GET  /api/leads`                    — список (admin/lawyer/assistant).
* `GET  /api/leads/{id}`               — карточка.
* `PATCH /api/leads/{id}`              — смена статуса (admin/lawyer).
* `DELETE /api/leads/{id}`             — удаление заявки (admin/lawyer).
* `POST /api/leads/{id}/integrations/retry` — повтор внешних шагов
  (Sheets / Telegram) для лида с провалом доставки.

Принципы обработки ошибок:
  - сохранение в SQLite — главный шаг; если упало, возвращаем 500 и НЕ дёргаем
    внешние сервисы;
  - после успешного INSERT — попытка записать в Sheets и отправить в Telegram;
    их сбой логируется, но **не** блокирует ответ клиенту;
  - в БД фиксируем `sheets_appended_at` / `telegram_sent_at` / краткий
    `last_integration_error` для последующего retry.
"""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from core.logging_setup import get_logger
from core.rbac import require_role
from integrations.google_sheets import (
    append_lead_row,
    is_configured as gs_configured,
)
from integrations.telegram import (
    send_lead_notification,
    is_configured as tg_configured,
)
from schemas.leads import (
    LeadCreate,
    LeadCreateResponse,
    LeadOut,
    LeadStatus,
    LeadUpdate,
)
from storage.database import _now, get_db

router = APIRouter()
public_router = APIRouter()

_logger = get_logger("crm.leads")

# Второй тег — чтобы в /docs блок «Заявки — удалить» был отдельно (DELETE живёт в
# одной строке с GET/PATCH у пути /api/leads/{lead_id}; его нужно развернуть).
_LEAD_DELETE_OPENAPI_TAGS = ["Заявки — удалить"]


def _row_to_lead(row) -> Optional[dict]:
    if row is None:
        return None
    d = dict(row)
    d["consent_personal_data"] = bool(d.get("consent_personal_data"))
    return d


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "-"


# ─────────────────────────────────────────────────────────────────────────────
# Публичный эндпоинт
# ─────────────────────────────────────────────────────────────────────────────
@public_router.post(
    "",
    response_model=LeadCreateResponse,
    status_code=201,
    summary="Public: submit a new lead from the website",
)
def create_lead_public(body: LeadCreate, request: Request):
    # 1. Honeypot — если бот заполнил скрытое поле, тихо отбрасываем как
    # обычную ошибку валидации, чтобы не подсказывать спамеру причину.
    if body.hp_field:
        _logger.warning(
            "lead honeypot triggered ip=%s path=%s",
            _client_ip(request), request.url.path,
        )
        raise HTTPException(
            status_code=400,
            detail={"code": "VALIDATION_ERROR", "message": "Invalid request"},
        )

    lead_id = str(uuid.uuid4())
    created_at = _now()

    # 2. Запись в БД — главное действие. Если оно упадёт — возвращаем 500
    # и НЕ зовём внешние сервисы.
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO leads"
                " (id,name,phone,email,message,source,consent_personal_data,"
                "  status,created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    lead_id,
                    body.name,
                    body.phone,
                    str(body.email) if body.email else None,
                    body.message,
                    body.source,
                    1 if body.consent_personal_data else 0,
                    LeadStatus.new.value,
                    created_at,
                ),
            )
            row = conn.execute(
                "SELECT * FROM leads WHERE id = ?", (lead_id,)
            ).fetchone()
    except Exception as exc:
        _logger.error(
            "lead insert failed ip=%s error=%s",
            _client_ip(request), type(exc).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to save lead"},
        )

    lead = _row_to_lead(row) or {}
    _logger.info(
        "lead created id=%s source=%s ip=%s",
        lead_id, (body.source or "-"), _client_ip(request),
    )

    # 3. Внешние интеграции — отдельной функцией, ошибки внутри не пробрасываются.
    integrations = _run_integrations(lead)

    return LeadCreateResponse(id=lead_id, integrations=integrations)


# ─────────────────────────────────────────────────────────────────────────────
# Защищённые эндпоинты CRM
# ─────────────────────────────────────────────────────────────────────────────
@router.get("", response_model=list[LeadOut], summary="List leads")
def list_leads(
    status: Optional[LeadStatus] = Query(None),
    current_user: dict = Depends(require_role("leads", "read")),
):
    query = "SELECT * FROM leads"
    params: list = []
    if status:
        query += " WHERE status = ?"
        params.append(status.value)
    query += " ORDER BY created_at DESC"
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [_row_to_lead(r) for r in rows]


@router.get("/{lead_id}", response_model=LeadOut, summary="Get lead by id")
def get_lead(
    lead_id: str,
    current_user: dict = Depends(require_role("leads", "read")),
):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM leads WHERE id = ?", (lead_id,)
        ).fetchone()
    lead = _row_to_lead(row)
    if not lead:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Lead not found"},
        )
    return lead


@router.patch("/{lead_id}", response_model=LeadOut, summary="Update lead status")
def update_lead(
    lead_id: str,
    body: LeadUpdate,
    current_user: dict = Depends(require_role("leads", "update")),
):
    data = body.model_dump(mode="json", exclude_none=True)
    with get_db() as conn:
        if not conn.execute(
            "SELECT 1 FROM leads WHERE id = ?", (lead_id,)
        ).fetchone():
            raise HTTPException(
                status_code=404,
                detail={"code": "NOT_FOUND", "message": "Lead not found"},
            )
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(
                f"UPDATE leads SET {sets} WHERE id = ?",
                (*data.values(), lead_id),
            )
        row = conn.execute(
            "SELECT * FROM leads WHERE id = ?", (lead_id,)
        ).fetchone()
    return _row_to_lead(row)


def _delete_lead_impl(lead_id: str, current_user: dict) -> None:
    """Удалить заявку. Общая логика для DELETE и POST …/delete."""
    with get_db() as conn:
        if not conn.execute(
            "SELECT 1 FROM leads WHERE id = ?", (lead_id,)
        ).fetchone():
            raise HTTPException(
                status_code=404,
                detail={"code": "NOT_FOUND", "message": "Lead not found"},
            )
        conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    _logger.info("lead deleted id=%s by=%s", lead_id, current_user.get("id"))


@router.delete(
    "/{lead_id}",
    status_code=204,
    summary="Удалить заявку (DELETE)",
    tags=_LEAD_DELETE_OPENAPI_TAGS,
    responses={
        204: {"description": "Заявка удалена, тело ответа пустое"},
        404: {"description": "Нет лида с таким id"},
    },
)
def delete_lead(
    lead_id: str,
    current_user: dict = Depends(require_role("leads", "delete")),
):
    _delete_lead_impl(lead_id, current_user)


@router.post(
    "/{lead_id}/delete",
    status_code=204,
    summary="Удалить заявку (POST, если DELETE режет прокси)",
    tags=_LEAD_DELETE_OPENAPI_TAGS,
    responses={
        204: {"description": "Заявка удалена"},
        404: {"description": "Нет лида с таким id"},
    },
)
def delete_lead_post(
    lead_id: str,
    current_user: dict = Depends(require_role("leads", "delete")),
):
    _delete_lead_impl(lead_id, current_user)


@router.post(
    "/{lead_id}/integrations/retry",
    summary="Retry failed integrations (Sheets / Telegram) for a lead",
)
def retry_lead_integrations(
    lead_id: str,
    current_user: dict = Depends(require_role("leads", "update")),
):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM leads WHERE id = ?", (lead_id,)
        ).fetchone()
    lead = _row_to_lead(row)
    if not lead:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "Lead not found"},
        )

    sheets_status = "skipped"
    telegram_status = "skipped"
    error_parts: list[str] = []

    if lead.get("sheets_appended_at"):
        sheets_status = "already_ok"
    elif gs_configured():
        ok = append_lead_row(lead)
        sheets_status = "ok" if ok else "failed"
        if not ok:
            error_parts.append("sheets_failed")

    if lead.get("telegram_sent_at"):
        telegram_status = "already_ok"
    elif tg_configured():
        ok = send_lead_notification(lead)
        telegram_status = "ok" if ok else "failed"
        if not ok:
            error_parts.append("telegram_failed")

    _persist_integration_state(
        lead_id, sheets_status, telegram_status, error_parts
    )
    _logger.info(
        "lead retry id=%s sheets=%s telegram=%s",
        lead_id, sheets_status, telegram_status,
    )
    return {
        "id": lead_id,
        "integrations": {"sheets": sheets_status, "telegram": telegram_status},
    }


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _run_integrations(lead: dict) -> dict[str, str]:
    """Прогон внешних интеграций после успешной записи в БД.

    Любой провал гасится внутри функций интеграций (`return False`). Здесь
    только агрегируем результат, обновляем БД и возвращаем краткие статусы.
    """
    sheets_status = "skipped"
    telegram_status = "skipped"
    error_parts: list[str] = []

    if gs_configured():
        ok = append_lead_row(lead)
        sheets_status = "ok" if ok else "failed"
        if not ok:
            error_parts.append("sheets_failed")

    if tg_configured():
        ok = send_lead_notification(lead)
        telegram_status = "ok" if ok else "failed"
        if not ok:
            error_parts.append("telegram_failed")

    _persist_integration_state(
        lead["id"], sheets_status, telegram_status, error_parts
    )
    return {"sheets": sheets_status, "telegram": telegram_status}


def _persist_integration_state(
    lead_id: str,
    sheets_status: str,
    telegram_status: str,
    error_parts: list[str],
) -> None:
    """Записать в БД отметки о доставке. Сбой записи не валит сценарий."""
    now_iso = _now()
    sheets_at = now_iso if sheets_status == "ok" else None
    telegram_at = now_iso if telegram_status == "ok" else None
    last_error = ";".join(error_parts) if error_parts else None
    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE leads"
                " SET sheets_appended_at = COALESCE(sheets_appended_at, ?),"
                "     telegram_sent_at = COALESCE(telegram_sent_at, ?),"
                "     last_integration_error = ?"
                " WHERE id = ?",
                (sheets_at, telegram_at, last_error, lead_id),
            )
    except Exception as exc:
        _logger.warning(
            "lead integration state update failed id=%s error=%s",
            lead_id, type(exc).__name__,
        )
