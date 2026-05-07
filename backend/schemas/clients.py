import re
from pydantic import BaseModel, field_validator
from schemas.common import CrmEmail
from enum import Enum
from typing import Optional

PHONE_RE = re.compile(r"^\+?[1-9]\d{6,14}$")


class ClientType(str, Enum):
    individual = "individual"
    company = "company"


class ClientCreate(BaseModel):
    name: str
    phone: str
    email: CrmEmail
    client_type: ClientType
    notes: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not PHONE_RE.match(v):
            raise ValueError("Phone must be in valid international format, e.g. +79991234567")
        return v


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[CrmEmail] = None
    client_type: Optional[ClientType] = None
    notes: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not PHONE_RE.match(v):
            raise ValueError("Phone must be in valid international format")
        return v


class ClientOut(BaseModel):
    id: str
    name: str
    phone: str
    email: str
    client_type: str
    notes: Optional[str]
    created_by: str
    created_at: str
