import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query

from schemas.clients import ClientCreate, ClientUpdate, ClientOut, ClientType
from core.rbac import require_role
from core.row_access import ensure_assistant_owns_client
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
    client_type: Optional[ClientType] = Query(None),
    current_user: dict = Depends(require_role("clients", "read")),
):
    with get_db() as conn:
        if current_user["role"] == "assistant":
            if client_type:
                rows = conn.execute(
                    "SELECT * FROM clients WHERE created_by = ? AND client_type = ?",
                    (current_user["id"], client_type.value),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM clients WHERE created_by = ?",
                    (current_user["id"],),
                ).fetchall()
        elif client_type:
            rows = conn.execute(
                "SELECT * FROM clients WHERE client_type = ?", (client_type.value,)
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
    d = row_to_dict(row)
    if current_user["role"] == "assistant" and d["created_by"] != current_user["id"]:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Client not found"})
    return d


@router.patch("/{client_id}", response_model=ClientOut, summary="Update client")
def update_client(
    client_id: str,
    body: ClientUpdate,
    current_user: dict = Depends(require_role("clients", "update")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM clients WHERE id = ?", (client_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Client not found"})
        ensure_assistant_owns_client(conn, client_id, current_user)
        data = body.model_dump(mode="json", exclude_none=True)
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE clients SET {sets} WHERE id = ?", (*data.values(), client_id))
        row = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
    return row_to_dict(row)


def _cascade_delete_client_records(conn, client_id: str) -> None:
    """Удалить клиента и все связанные записи (дела, задачи, встречи, документы, финансы).

    Порядок важен из‑за FK в SQLite: сначала потомки дел, затем сами дела, затем записи только по client_id.
    """
    rows = conn.execute(
        "SELECT id FROM legal_cases WHERE client_id = ?", (client_id,)
    ).fetchall()
    case_ids = [str(r["id"]) for r in rows]
    if case_ids:
        ph = ",".join("?" * len(case_ids))
        conn.execute(f"DELETE FROM tasks WHERE case_id IN ({ph})", case_ids)
        conn.execute(f"DELETE FROM calendar_events WHERE case_id IN ({ph})", case_ids)
        conn.execute(f"DELETE FROM documents WHERE case_id IN ({ph})", case_ids)
        conn.execute(f"DELETE FROM finance_records WHERE case_id IN ({ph})", case_ids)
        conn.execute(f"DELETE FROM legal_cases WHERE id IN ({ph})", case_ids)
    # Записи только по client_id (или оставшиеся после удаления дел)
    conn.execute("DELETE FROM tasks WHERE client_id = ?", (client_id,))
    conn.execute("DELETE FROM finance_records WHERE client_id = ?", (client_id,))
    conn.execute("DELETE FROM documents WHERE client_id = ?", (client_id,))
    conn.execute("DELETE FROM calendar_events WHERE client_id = ?", (client_id,))
    conn.execute("DELETE FROM clients WHERE id = ?", (client_id,))


@router.delete("/{client_id}", status_code=204, summary="Delete client and related cases and records")
def delete_client(
    client_id: str,
    current_user: dict = Depends(require_role("clients", "delete")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM clients WHERE id = ?", (client_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Client not found"})
        ensure_assistant_owns_client(conn, client_id, current_user)
        _cascade_delete_client_records(conn, client_id)
