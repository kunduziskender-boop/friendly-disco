from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from schemas.clients import ClientCreate, ClientUpdate, ClientOut
from core.rbac import require_role
from storage.memory import db, _now, _make_id

router = APIRouter()


@router.post("", response_model=ClientOut, status_code=201, summary="Create client")
def create_client(
    body: ClientCreate,
    current_user: dict = Depends(require_role("clients", "create")),
):
    cid = _make_id("cl", db["clients"])
    record = {
        "id":          cid,
        "name":        body.name,
        "phone":       body.phone,
        "email":       body.email,
        "client_type": body.client_type,
        "notes":       body.notes,
        "created_by":  current_user["id"],
        "created_at":  _now(),
    }
    db["clients"][cid] = record
    return record


@router.get("", response_model=list[ClientOut], summary="List clients")
def list_clients(
    client_type: Optional[str] = None,
    current_user: dict = Depends(require_role("clients", "read")),
):
    items = list(db["clients"].values())
    if client_type:
        items = [c for c in items if c["client_type"] == client_type]
    return items


@router.get("/{client_id}", response_model=ClientOut, summary="Get client by id")
def get_client(
    client_id: str,
    current_user: dict = Depends(require_role("clients", "read")),
):
    client = db["clients"].get(client_id)
    if not client:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Client not found"})
    return client


@router.patch("/{client_id}", response_model=ClientOut, summary="Update client")
def update_client(
    client_id: str,
    body: ClientUpdate,
    current_user: dict = Depends(require_role("clients", "update")),
):
    client = db["clients"].get(client_id)
    if not client:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Client not found"})
    client.update(body.model_dump(exclude_none=True))
    return client


@router.delete("/{client_id}", status_code=204, summary="Delete client")
def delete_client(
    client_id: str,
    current_user: dict = Depends(require_role("clients", "delete")),
):
    if client_id not in db["clients"]:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Client not found"})
    active_cases = [c for c in db["cases"].values() if c["client_id"] == client_id]
    if active_cases:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "HAS_ACTIVE_CASES",
                "message": f"Нельзя удалить клиента: у него {len(active_cases)} дел(а). Сначала закройте дела.",
            },
        )
    del db["clients"][client_id]
