from pydantic import BaseModel
from enum import Enum
from typing import Optional


class CaseStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    closed = "closed"
    archived = "archived"


class CaseCreate(BaseModel):
    case_number: str
    title: str
    description: Optional[str] = None
    client_id: str
    responsible_lawyer_id: Optional[str] = None
    status: CaseStatus = CaseStatus.open


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[CaseStatus] = None
    responsible_lawyer_id: Optional[str] = None
    closed_at: Optional[str] = None


class CaseOut(BaseModel):
    id: str
    case_number: str
    title: str
    description: Optional[str]
    status: str
    client_id: str
    responsible_lawyer_id: Optional[str]
    opened_at: str
    closed_at: Optional[str]
