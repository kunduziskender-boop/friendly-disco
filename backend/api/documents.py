from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from schemas.documents import DocumentCreate, DocumentUpdate, DocumentOut
from core.rbac import require_role
from storage.memory import db, _now, _make_id

router = APIRouter()


@router.post("", response_model=DocumentOut, status_code=201, summary="Create document record")
def create_document(
    body: DocumentCreate,
    current_user: dict = Depends(require_role("documents", "create")),
):
    if body.case_id and body.case_id not in db["cases"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_REFERENCE", "message": f"Case '{body.case_id}' not found"},
        )
    if body.client_id and body.client_id not in db["clients"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_REFERENCE", "message": f"Client '{body.client_id}' not found"},
        )
    did = _make_id("doc", db["documents"])
    record = {
        "id":          did,
        "title":       body.title,
        "doc_type":    body.doc_type,
        "case_id":     body.case_id,
        "client_id":   body.client_id,
        "file_name":   body.file_name,
        "status":      body.status,
        "uploaded_by": current_user["id"],
        "uploaded_at": _now(),
    }
    db["documents"][did] = record
    return record


@router.get("", response_model=list[DocumentOut], summary="List documents")
def list_documents(
    doc_type: Optional[str] = None,
    case_id: Optional[str] = None,
    client_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(require_role("documents", "read")),
):
    items = list(db["documents"].values())
    if doc_type:
        items = [d for d in items if d["doc_type"] == doc_type]
    if case_id:
        items = [d for d in items if d["case_id"] == case_id]
    if client_id:
        items = [d for d in items if d["client_id"] == client_id]
    if status:
        items = [d for d in items if d["status"] == status]
    return items


@router.get("/{doc_id}", response_model=DocumentOut, summary="Get document by id")
def get_document(
    doc_id: str,
    current_user: dict = Depends(require_role("documents", "read")),
):
    doc = db["documents"].get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Document not found"})
    return doc


@router.patch("/{doc_id}", response_model=DocumentOut, summary="Update document")
def update_document(
    doc_id: str,
    body: DocumentUpdate,
    current_user: dict = Depends(require_role("documents", "update")),
):
    doc = db["documents"].get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Document not found"})
    doc.update(body.model_dump(exclude_none=True))
    return doc


@router.delete("/{doc_id}", status_code=204, summary="Delete document")
def delete_document(
    doc_id: str,
    current_user: dict = Depends(require_role("documents", "delete")),
):
    if doc_id not in db["documents"]:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Document not found"})
    del db["documents"][doc_id]
