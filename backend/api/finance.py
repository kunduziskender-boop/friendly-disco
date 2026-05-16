import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query

from schemas.finance import (
    FinanceRecordCreate,
    FinanceRecordUpdate,
    FinanceRecordOut,
    RecordType,
    PaymentStatus,
)
from core.rbac import require_role
from core.row_access import (
    assistant_finance_scope,
    ensure_assistant_finance_mutation,
    ensure_assistant_readable_finance,
)
from storage.database import get_db, row_to_dict, _now
from core.logging_setup import emit_json_event, get_logger

router = APIRouter()

_business = get_logger("crm.business")


@router.post("", response_model=FinanceRecordOut, status_code=201, summary="Create finance record")
def create_finance_record(
    body: FinanceRecordCreate,
    current_user: dict = Depends(require_role("finance_records", "create")),
):
    with get_db() as conn:
        if body.client_id and not conn.execute(
            "SELECT 1 FROM clients WHERE id = ?", (body.client_id,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_REFERENCE", "message": f"Client '{body.client_id}' not found"},
            )
        if body.case_id and not conn.execute(
            "SELECT 1 FROM legal_cases WHERE id = ?", (body.case_id,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_REFERENCE", "message": f"Case '{body.case_id}' not found"},
            )
        fid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO finance_records"
            " (id,record_type,amount,currency,payment_date,status,client_id,case_id,description,created_by,created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                fid,
                body.record_type.value,
                body.amount,
                body.currency,
                body.payment_date.isoformat(),
                body.status.value,
                body.client_id,
                body.case_id,
                body.description,
                current_user["id"],
                _now(),
            ),
        )
        row = conn.execute("SELECT * FROM finance_records WHERE id = ?", (fid,)).fetchone()
    emit_json_event(
        _business,
        logging.INFO,
        event="finance_record_created",
        record_id=fid,
        record_type=body.record_type.value,
        amount=float(body.amount),
        currency=body.currency,
        client_id=body.client_id or None,
        case_id=body.case_id or None,
        actor_user_id=current_user["id"],
    )
    return row_to_dict(row)


@router.get("", response_model=list[FinanceRecordOut], summary="List finance records")
def list_finance_records(
    record_type: Optional[RecordType] = Query(None),
    status: Optional[PaymentStatus] = Query(None),
    client_id: Optional[str] = None,
    case_id: Optional[str] = None,
    current_user: dict = Depends(require_role("finance_records", "read")),
):
    query = "SELECT * FROM finance_records WHERE 1=1"
    params: list = []
    if current_user["role"] == "assistant":
        scope, plist = assistant_finance_scope(current_user["id"])
        query += f" AND ({scope})"
        params.extend(plist)

    if record_type:
        query += " AND record_type = ?"
        params.append(record_type.value)
    if status:
        query += " AND status = ?"
        params.append(status.value)
    if client_id:
        query += " AND client_id = ?"
        params.append(client_id)
    if case_id:
        query += " AND case_id = ?"
        params.append(case_id)
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_dict(r) for r in rows]


@router.get("/{record_id}", response_model=FinanceRecordOut, summary="Get finance record by id")
def get_finance_record(
    record_id: str,
    current_user: dict = Depends(require_role("finance_records", "read")),
):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM finance_records WHERE id = ?", (record_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Finance record not found"})
        ensure_assistant_readable_finance(conn, record_id, current_user)
        return row_to_dict(row)


@router.patch("/{record_id}", response_model=FinanceRecordOut, summary="Update finance record")
def update_finance_record(
    record_id: str,
    body: FinanceRecordUpdate,
    current_user: dict = Depends(require_role("finance_records", "update")),
):
    pf = list(body.model_dump(mode="json", exclude_none=True).keys())
    with get_db() as conn:
        row0 = conn.execute("SELECT * FROM finance_records WHERE id = ?", (record_id,)).fetchone()
        if not row0:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Finance record not found"})
        ensure_assistant_readable_finance(conn, record_id, current_user)
        ensure_assistant_finance_mutation(conn, row_to_dict(row0), current_user)
        data = body.model_dump(mode="json", exclude_none=True)
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE finance_records SET {sets} WHERE id = ?", (*data.values(), record_id))
        row = conn.execute("SELECT * FROM finance_records WHERE id = ?", (record_id,)).fetchone()
    emit_json_event(
        _business,
        logging.INFO,
        event="finance_record_updated",
        record_id=record_id,
        actor_user_id=current_user["id"],
        fields_updated=pf or [],
    )
    return row_to_dict(row)


@router.delete("/{record_id}", status_code=204, summary="Delete finance record (admin only)")
def delete_finance_record(
    record_id: str,
    current_user: dict = Depends(require_role("finance_records", "delete")),
):
    with get_db() as conn:
        row0 = conn.execute("SELECT * FROM finance_records WHERE id = ?", (record_id,)).fetchone()
        if not row0:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Finance record not found"})
        ensure_assistant_readable_finance(conn, record_id, current_user)
        ensure_assistant_finance_mutation(conn, row_to_dict(row0), current_user)
        conn.execute("DELETE FROM finance_records WHERE id = ?", (record_id,))
    emit_json_event(
        _business,
        logging.INFO,
        event="finance_record_deleted",
        record_id=record_id,
        actor_user_id=current_user["id"],
    )
