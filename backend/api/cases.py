import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from schemas.cases import CaseCreate, CaseUpdate, CaseOut
from core.rbac import require_role
from storage.database import get_db, row_to_dict, _now

router = APIRouter()


@router.post("", response_model=CaseOut, status_code=201, summary="Create case")
def create_case(
    body: CaseCreate,
    current_user: dict = Depends(require_role("cases", "create")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM clients WHERE id = ?", (body.client_id,)).fetchone():
            raise HTTPException(
                status_code=422,
                detail={"code": "INVALID_REFERENCE", "message": f"Client '{body.client_id}' not found"},
            )
        if conn.execute("SELECT 1 FROM legal_cases WHERE case_number = ?", (body.case_number,)).fetchone():
            raise HTTPException(
                status_code=409,
                detail={"code": "CASE_NUMBER_TAKEN", "message": "Case number already exists"},
            )
        cid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO legal_cases"
            " (id,case_number,title,description,status,client_id,responsible_lawyer_id,"
            "  court_name,next_hearing_date,opposing_party,case_summary,opened_at,closed_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cid, body.case_number, body.title, body.description, body.status.value,
             body.client_id, body.responsible_lawyer_id,
             body.court_name, body.next_hearing_date, body.opposing_party, body.case_summary,
             _now(), None),
        )
        row = conn.execute("SELECT * FROM legal_cases WHERE id = ?", (cid,)).fetchone()
    return row_to_dict(row)


@router.get("", response_model=list[CaseOut], summary="List cases")
def list_cases(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    current_user: dict = Depends(require_role("cases", "read")),
):
    query = "SELECT * FROM legal_cases WHERE 1=1"
    params: list = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if client_id:
        query += " AND client_id = ?"
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
    return row_to_dict(row)


@router.patch("/{case_id}", response_model=CaseOut, summary="Update case")
def update_case(
    case_id: str,
    body: CaseUpdate,
    current_user: dict = Depends(require_role("cases", "update")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM legal_cases WHERE id = ?", (case_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Case not found"})
        data = body.model_dump(mode="json", exclude_none=True)
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE legal_cases SET {sets} WHERE id = ?", (*data.values(), case_id))
        row = conn.execute("SELECT * FROM legal_cases WHERE id = ?", (case_id,)).fetchone()
    return row_to_dict(row)


@router.delete("/{case_id}", status_code=204, summary="Delete case (admin only)")
def delete_case(
    case_id: str,
    current_user: dict = Depends(require_role("cases", "delete")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM legal_cases WHERE id = ?", (case_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Case not found"})
        conn.execute("DELETE FROM legal_cases WHERE id = ?", (case_id,))
