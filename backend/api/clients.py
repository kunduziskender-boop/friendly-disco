import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends

from schemas.clients import ClientCreate, ClientUpdate, ClientOut
from core.rbac import require_role
from storage.database import get_db, row_to_dict, _now

router = APIRouter()


@router.post("", response_model=ClientOut, status_code=201, summary="Create client")
def create_client(
    body: ClientCreate,
    current_user: dict = Depends(require_role("clients", "create")),
):
    cid = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            "INSERT INTO clients (id,name,phone,email,client_type,notes,created_by,created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (cid, body.name, body.phone, str(body.email), body.client_type.value,
             body.notes, current_user["id"], _now()),
        )
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (cid,)).fetchone()
    return row_to_dict(row)


@router.get("", response_model=list[ClientOut], summary="List clients")
def list_clients(
    client_type: Optional[str] = None,
    current_user: dict = Depends(require_role("clients", "read")),
):
    with get_db() as conn:
        if client_type:
            rows = conn.execute(
                "SELECT * FROM clients WHERE client_type = ?", (client_type,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM clients").fetchall()
    return [row_to_dict(r) for r in rows]


@router.get("/{client_id}", response_model=ClientOut, summary="Get client by id")
def get_client(
    client_id: str,
    current_user: dict = Depends(require_role("clients", "read")),
):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Client not found"})
    return row_to_dict(row)


@router.patch("/{client_id}", response_model=ClientOut, summary="Update client")
def update_client(
    client_id: str,
    body: ClientUpdate,
    current_user: dict = Depends(require_role("clients", "update")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM clients WHERE id = ?", (client_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Client not found"})
        data = body.model_dump(mode="json", exclude_none=True)
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE clients SET {sets} WHERE id = ?", (*data.values(), client_id))
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
    return row_to_dict(row)


@router.delete("/{client_id}", status_code=204, summary="Delete client")
def delete_client(
    client_id: str,
    current_user: dict = Depends(require_role("clients", "delete")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM clients WHERE id = ?", (client_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Client not found"})
        case_count = conn.execute(
            "SELECT COUNT(*) FROM legal_cases WHERE client_id = ?", (client_id,)
        ).fetchone()[0]
        if case_count:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "HAS_ACTIVE_CASES",
                    "message": f"Нельзя удалить клиента: у него {case_count} дел(а). Сначала закройте дела.",
                },
            )
        conn.execute("DELETE FROM clients WHERE id = ?", (client_id,))
