from pydantic import BaseModel, field_validator
from enum import Enum
from typing import Optional
from datetime import datetime


class TaskStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"
    overdue = "overdue"


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: datetime
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.medium
    case_id: Optional[str] = None
    assignee_user_id: Optional[str] = None

    @field_validator("due_date", mode="before")
    @classmethod
    def parse_due_date(cls, v):
        if isinstance(v, str):
            return datetime.fromisoformat(v)
        return v


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee_user_id: Optional[str] = None
    completed_at: Optional[datetime] = None

    @field_validator("due_date", "completed_at", mode="before")
    @classmethod
    def parse_optional_dt(cls, v):
        if v is None or isinstance(v, datetime):
            return v
        if isinstance(v, str):
            return datetime.fromisoformat(v)
        return v


class TaskOut(BaseModel):
    id: str
    title: str
    description: Optional[str]
    due_date: str
    status: str
    priority: str
    case_id: Optional[str]
    assignee_user_id: Optional[str]
    created_by: str
    created_at: str
    completed_at: Optional[str]
