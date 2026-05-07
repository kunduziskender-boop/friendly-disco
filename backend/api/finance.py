from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from schemas.finance import FinanceRecordCreate, FinanceRecordUpdate, FinanceRecordOut
from core.rbac import require_role
from storage.memory import db, _now, _make_id

router = APIRouter()


@router.post("", response_model=FinanceRecordOut, status_code=201, summary="Create finance record")
def create_finance_record(
    body: FinanceRecordCreate,
    current_user: dict = Depends(require_role("finance_records", "create")),
):
    if body.client_id and body.client_id not in db["clients"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_REFERENCE", "message": f"Client '{body.client_id}' not found"},
        )
    if body.case_id and body.case_id not in db["cases"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_REFERENCE", "message": f"Case '{body.case_id}' not found"},
        )
    fid = _make_id("fin", db["finance_records"])
    record = {
        "id":           fid,
        "record_type":  body.record_type,
        "amount":       body.amount,
        "currency":     body.currency,
        "payment_date": body.payment_date.isoformat(),
        "status":       body.status,
        "client_id":    body.client_id,
        "case_id":      body.case_id,
        "description":  body.description,
        "created_by":   current_user["id"],
        "created_at":   _now(),
    }
    db["finance_records"][fid] = record
    return record


@router.get("", response_model=list[FinanceRecordOut], summary="List finance records")
def list_finance_records(
    record_type: Optional[str] = None,
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    case_id: Optional[str] = None,
    current_user: dict = Depends(require_role("finance_records", "read")),
):
    items = list(db["finance_records"].values())
    if record_type:
        items = [r for r in items if r["record_type"] == record_type]
    if status:
        items = [r for r in items if r["status"] == status]
    if client_id:
        items = [r for r in items if r["client_id"] == client_id]
    if case_id:
        items = [r for r in items if r["case_id"] == case_id]
    return items


@router.get("/{record_id}", response_model=FinanceRecordOut, summary="Get finance record by id")
def get_finance_record(
    record_id: str,
    current_user: dict = Depends(require_role("finance_records", "read")),
):
    record = db["finance_records"].get(record_id)
    if not record:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Finance record not found"})
    return record


@router.patch("/{record_id}", response_model=FinanceRecordOut, summary="Update finance record")
def update_finance_record(
    record_id: str,
    body: FinanceRecordUpdate,
    current_user: dict = Depends(require_role("finance_records", "update")),
):
    record = db["finance_records"].get(record_id)
    if not record:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Finance record not found"})
    data = body.model_dump(exclude_none=True)
    if "payment_date" in data:
        data["payment_date"] = data["payment_date"].isoformat()
    record.update(data)
    return record


@router.delete("/{record_id}", status_code=204, summary="Delete finance record (admin only)")
def delete_finance_record(
    record_id: str,
    current_user: dict = Depends(require_role("finance_records", "delete")),
):
    if record_id not in db["finance_records"]:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Finance record not found"})
    del db["finance_records"][record_id]
