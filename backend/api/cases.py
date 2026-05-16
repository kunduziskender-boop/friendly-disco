import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query

from schemas.cases import CaseCreate, CaseUpdate, CaseOut, CaseStatus
from core.rbac import require_role
from core.row_access import ensure_assistant_case, ensure_assistant_owns_client
from storage.database import get_db, row_to_dict, _now
from core.logging_setup import emit_json_event, get_logger

router = APIRouter()

_business = get_logger("crm.business")


@router.post("", response_model=CaseOut, status_code=201, summary="Create case")
def create_case(
    body: CaseCreate,
    current_user: dict = Depends(require_role("cases", "create")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM clients WHERE id = ?", (body.client_id,)).fetchone():
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_REFERENCE", "message": f"Client '{body.client_id}' not found"},
            )
        ensure_assistant_owns_client(conn, body.client_id, current_user)
        if conn.execute("SELECT 1 FROM legal_cases WHERE case_number = ?", (body.case_number,)).fetchone():
            raise HTTPException(
                status_code=409,
                detail={"code": "CASE_NUMBER_TAKEN", "message": "Case number already exists"},
            )
        if body.responsible_lawyer_id and not conn.execute(
            "SELECT 1 FROM users WHERE id = ? AND is_active = 1", (body.responsible_lawyer_id,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "INVALID_REFERENCE",
                    "message": f"User '{body.responsible_lawyer_id}' not found or inactive",
                },
            )
        cid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO legal_cases"
            " (id,case_number,title,description,status,client_id,responsible_lawyer_id,"
            "  court_name,next_hearing_date,opposing_party,case_summary,opened_at,closed_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                cid,
                body.case_number,
                body.title,
                body.description,
                body.status.value,
                body.client_id,
                body.responsible_lawyer_id,
                body.court_name,
                body.next_hearing_date,
                body.opposing_party,
                body.case_summary,
                _now(),
                None,
            ),
        )
        row = conn.execute("SELECT * FROM legal_cases WHERE id = ?", (cid,)).fetchone()
    emit_json_event(
        _business,
        logging.INFO,
        event="case_created",
        case_id=cid,
        client_id=body.client_id,
        case_number=body.case_number,
        actor_user_id=current_user["id"],
    )
    return row_to_dict(row)


@router.get("", response_model=list[CaseOut], summary="List cases")
def list_cases(
    status: Optional[CaseStatus] = Query(None),
    client_id: Optional[str] = None,
    current_user: dict = Depends(require_role("cases", "read")),
):
    params: list = []
    if current_user["role"] == "assistant":
        query = (
            "SELECT lc.* FROM legal_cases lc "
            "INNER JOIN clients c ON lc.client_id = c.id "
            "WHERE c.created_by = ?"
        )
        params.append(current_user["id"])
    else:
        query = "SELECT lc.* FROM legal_cases lc WHERE 1=1"

    if status:
        query += " AND lc.status = ?"
        params.append(status.value)
    if client_id:
        query += " AND lc.client_id = ?"
        params.append(client_id)
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_dict(r) for r in rows]


@router.get("/{case_id}", response_model=CaseOut, summary="Get case by id")
def get_case(
    case_id: str,
    current_user: dict = Depends(require_role("cases", "read")),
):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM legal_cases WHERE id = ?", (case_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Case not found"})
        ensure_assistant_case(conn, case_id, current_user)
        return row_to_dict(row)


@router.patch("/{case_id}", response_model=CaseOut, summary="Update case")
def update_case(
    case_id: str,
    body: CaseUpdate,
    current_user: dict = Depends(require_role("cases", "update")),
):
    patch_fields = list(body.model_dump(mode="json", exclude_none=True).keys())
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM legal_cases WHERE id = ?", (case_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Case not found"})
        ensure_assistant_case(conn, case_id, current_user)
        data = body.model_dump(mode="json", exclude_none=True)
        rid = data.get("responsible_lawyer_id")
        if rid is not None and not conn.execute(
            "SELECT 1 FROM users WHERE id = ? AND is_active = 1", (rid,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_REFERENCE", "message": f"User '{rid}' not found or inactive"},
            )
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE legal_cases SET {sets} WHERE id = ?", (*data.values(), case_id))
        row = conn.execute("SELECT * FROM legal_cases WHERE id = ?", (case_id,)).fetchone()
    emit_json_event(
        _business,
        logging.INFO,
        event="case_updated",
        case_id=case_id,
        actor_user_id=current_user["id"],
        fields_updated=patch_fields or [],
    )
    return row_to_dict(row)


def _cascade_delete_case(conn, case_id: str) -> None:
    """Удалить дело и записи, ссылающиеся на него (инче SQLite FK)."""
    conn.execute("DELETE FROM tasks WHERE case_id = ?", (case_id,))
    conn.execute("DELETE FROM calendar_events WHERE case_id = ?", (case_id,))
    conn.execute("DELETE FROM documents WHERE case_id = ?", (case_id,))
    conn.execute("DELETE FROM finance_records WHERE case_id = ?", (case_id,))
    conn.execute("DELETE FROM legal_cases WHERE id = ?", (case_id,))


@router.delete("/{case_id}", status_code=204, summary="Delete case and related records")
def delete_case(
    case_id: str,
    current_user: dict = Depends(require_role("cases", "delete")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM legal_cases WHERE id = ?", (case_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Case not found"})
        ensure_assistant_case(conn, case_id, current_user)
        _cascade_delete_case(conn, case_id)
    emit_json_event(
        _business,
        logging.INFO,
        event="case_deleted",
        case_id=case_id,
        actor_user_id=current_user["id"],
    )
