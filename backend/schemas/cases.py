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
    court_name: Optional[str] = None
    next_hearing_date: Optional[str] = None
    opposing_party: Optional[str] = None
    case_summary: Optional[str] = None


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[CaseStatus] = None
    responsible_lawyer_id: Optional[str] = None
    closed_at: Optional[str] = None
    court_name: Optional[str] = None
    next_hearing_date: Optional[str] = None
    opposing_party: Optional[str] = None
    case_summary: Optional[str] = None


class CaseOut(BaseModel):
    id: str
    case_number: str
    title: str
    description: Optional[str]
    status: str
    client_id: str
    responsible_lawyer_id: Optional[str]
    court_name: Optional[str]
    next_hearing_date: Optional[str]
    opposing_party: Optional[str]
    case_summary: Optional[str]
    opened_at: str
    closed_at: Optional[str]
