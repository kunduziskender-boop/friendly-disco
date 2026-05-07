from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from schemas.cases import CaseCreate, CaseUpdate, CaseOut
from core.rbac import require_role
from storage.memory import db, _now, _make_id

router = APIRouter()


@router.post("", response_model=CaseOut, status_code=201, summary="Create case")
def create_case(
    body: CaseCreate,
    current_user: dict = Depends(require_role("cases", "create")),
):
    if body.client_id not in db["clients"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_REFERENCE", "message": f"Client '{body.client_id}' not found"},
        )
    if any(c["case_number"] == body.case_number for c in db["cases"].values()):
        raise HTTPException(
            status_code=409,
            detail={"code": "CASE_NUMBER_TAKEN", "message": "Case number already exists"},
        )
    cid = _make_id("cs", db["cases"])
    record = {
        "id":                   cid,
        "case_number":          body.case_number,
        "title":                body.title,
        "description":          body.description,
        "status":               body.status,
        "client_id":            body.client_id,
        "responsible_lawyer_id": body.responsible_lawyer_id,
        "opened_at":            _now(),
        "closed_at":            None,
    }
    db["cases"][cid] = record
    return record


@router.get("", response_model=list[CaseOut], summary="List cases")
def list_cases(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    current_user: dict = Depends(require_role("cases", "read")),
):
    items = list(db["cases"].values())
    if status:
        items = [c for c in items if c["status"] == status]
    if client_id:
        items = [c for c in items if c["client_id"] == client_id]
    return items


@router.get("/{case_id}", response_model=CaseOut, summary="Get case by id")
def get_case(
    case_id: str,
    current_user: dict = Depends(require_role("cases", "read")),
):
    case = db["cases"].get(case_id)
    if not case:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Case not found"})
    return case


@router.patch("/{case_id}", response_model=CaseOut, summary="Update case")
def update_case(
    case_id: str,
    body: CaseUpdate,
    current_user: dict = Depends(require_role("cases", "update")),
):
    case = db["cases"].get(case_id)
    if not case:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Case not found"})
    case.update(body.model_dump(exclude_none=True))
    return case


@router.delete("/{case_id}", status_code=204, summary="Delete case (admin only)")
def delete_case(
    case_id: str,
    current_user: dict = Depends(require_role("cases", "delete")),
):
    if case_id not in db["cases"]:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Case not found"})
    del db["cases"][case_id]
