import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query

from schemas.documents import DocumentCreate, DocumentUpdate, DocumentOut, DocType, DocStatus
from core.rbac import require_role
from core.row_access import (
    assistant_document_scope,
    ensure_assistant_case,
    ensure_assistant_document_mutation,
    ensure_assistant_owns_client,
    ensure_assistant_readable_document,
)
from storage.database import get_db, row_to_dict, _now

router = APIRouter()


@router.post("", response_model=DocumentOut, status_code=201, summary="Create document record")
def create_document(
    body: DocumentCreate,
    current_user: dict = Depends(require_role("documents", "create")),
):
    with get_db() as conn:
        if body.case_id and not conn.execute(
            "SELECT 1 FROM legal_cases WHERE id = ?", (body.case_id,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_REFERENCE", "message": f"Case '{body.case_id}' not found"},
            )
        if body.client_id and not conn.execute(
            "SELECT 1 FROM clients WHERE id = ?", (body.client_id,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_REFERENCE", "message": f"Client '{body.client_id}' not found"},
            )
        if body.case_id:
            ensure_assistant_case(conn, body.case_id, current_user)
        if body.client_id:
            ensure_assistant_owns_client(conn, body.client_id, current_user)
        did = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO documents"
            " (id,title,doc_type,status,file_name,case_id,client_id,uploaded_by,uploaded_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (did, body.title, body.doc_type.value, body.status.value,
             body.file_name, body.case_id, body.client_id,
             current_user["id"], _now()),
        )
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (did,)).fetchone()
    return row_to_dict(row)


@router.get("", response_model=list[DocumentOut], summary="List documents")
def list_documents(
    doc_type: Optional[DocType] = Query(None),
    case_id: Optional[str] = None,
    client_id: Optional[str] = None,
    status: Optional[DocStatus] = Query(None, description="draft|final|archived"),
    current_user: dict = Depends(require_role("documents", "read")),
):
    query = "SELECT * FROM documents WHERE 1=1"
    params: list = []
    if current_user["role"] == "assistant":
        scope, plist = assistant_document_scope(current_user["id"])
        query += f" AND ({scope})"
        params.extend(plist)

    if doc_type:
        query += " AND doc_type = ?"
        params.append(doc_type.value)
    if case_id:
        query += " AND case_id = ?"
        params.append(case_id)
    if client_id:
        query += " AND client_id = ?"
        params.append(client_id)
    if status:
        query += " AND status = ?"
        params.append(status.value)
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_dict(r) for r in rows]


@router.get("/{doc_id}", response_model=DocumentOut, summary="Get document by id")
def get_document(
    doc_id: str,
    current_user: dict = Depends(require_role("documents", "read")),
):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Document not found"})
        ensure_assistant_readable_document(conn, doc_id, current_user)
        return row_to_dict(row)


@router.patch("/{doc_id}", response_model=DocumentOut, summary="Update document")
def update_document(
    doc_id: str,
    body: DocumentUpdate,
    current_user: dict = Depends(require_role("documents", "update")),
):
    with get_db() as conn:
        row0 = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        if not row0:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Document not found"})
        ensure_assistant_readable_document(conn, doc_id, current_user)
        ensure_assistant_document_mutation(conn, row_to_dict(row0), current_user)
        data = body.model_dump(mode="json", exclude_none=True)
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE documents SET {sets} WHERE id = ?", (*data.values(), doc_id))
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    return row_to_dict(row)


@router.delete("/{doc_id}", status_code=204, summary="Delete document")
def delete_document(
    doc_id: str,
    current_user: dict = Depends(require_role("documents", "delete")),
):
    with get_db() as conn:
        row0 = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        if not row0:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Document not found"})
        ensure_assistant_readable_document(conn, doc_id, current_user)
        ensure_assistant_document_mutation(conn, row_to_dict(row0), current_user)
        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
