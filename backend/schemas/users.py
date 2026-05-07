from pydantic import BaseModel, field_validator
from schemas.common import CrmEmail
from enum import Enum
from typing import Optional


class UserRole(str, Enum):
    admin = "admin"
    lawyer = "lawyer"
    assistant = "assistant"


class UserCreate(BaseModel):
    full_name: str
    email: CrmEmail
    password: str
    role: UserRole = UserRole.lawyer

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[CrmEmail] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class UserOut(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    is_active: bool
    created_at: str
