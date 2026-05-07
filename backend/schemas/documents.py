from pydantic import BaseModel, model_validator
from enum import Enum
from typing import Optional


class DocType(str, Enum):
    contract = "contract"
    claim = "claim"
    evidence = "evidence"
    invoice = "invoice"
    other = "other"


class DocStatus(str, Enum):
    draft = "draft"
    final = "final"
    archived = "archived"


class DocumentCreate(BaseModel):
    title: str
    doc_type: DocType
    case_id: Optional[str] = None
    client_id: Optional[str] = None
    file_name: Optional[str] = None
    status: DocStatus = DocStatus.draft

    @model_validator(mode="after")
    def check_linked(self):
        if not self.case_id and not self.client_id:
            raise ValueError("Document must be linked to a case_id or client_id")
        return self


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    doc_type: Optional[DocType] = None
    status: Optional[DocStatus] = None
    file_name: Optional[str] = None


class DocumentOut(BaseModel):
    id: str
    title: str
    doc_type: str
    case_id: Optional[str]
    client_id: Optional[str]
    file_name: Optional[str]
    status: str
    uploaded_by: str
    uploaded_at: str
