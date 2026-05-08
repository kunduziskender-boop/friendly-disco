from pydantic import BaseModel, field_validator, model_validator
from enum import Enum
from typing import Optional
from datetime import datetime


class EventType(str, Enum):
    hearing = "hearing"
    meeting = "meeting"
    deadline = "deadline"
    other = "other"


class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_at: datetime
    end_at: datetime
    event_type: EventType = EventType.other
    case_id: Optional[str] = None
    client_id: Optional[str] = None
    location: Optional[str] = None
    participants: list[str] = []

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    event_type: Optional[EventType] = None
    case_id: Optional[str] = None
    client_id: Optional[str] = None
    location: Optional[str] = None
    participants: Optional[list[str]] = None


class CalendarEventOut(BaseModel):
    id: str
    title: str
    description: Optional[str]
    start_at: str
    end_at: str
    event_type: str
    case_id: Optional[str]
    client_id: Optional[str]
    location: Optional[str]
    participants: list[str]
    created_by: str
