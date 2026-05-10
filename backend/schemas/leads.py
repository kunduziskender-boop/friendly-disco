from enum import Enum
from typing import Optional

from pydantic import BaseModel, field_validator

from schemas.clients import PHONE_RE
from schemas.common import CrmEmail


class LeadStatus(str, Enum):
    new = "new"
    contacted = "contacted"
    converted = "converted"
    rejected = "rejected"


class LeadCreate(BaseModel):
    """Public payload for `POST /api/public/leads`."""

    name: str
    phone: str
    email: Optional[CrmEmail] = None
    message: Optional[str] = None
    source: Optional[str] = None
    consent_personal_data: bool
    # Honeypot: ожидается пустое поле; если заполнено — заявка отбрасывается.
    hp_field: Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_non_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Имя не может быть пустым")
        if len(s) > 200:
            raise ValueError("Имя слишком длинное (максимум 200 символов)")
        return s

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v: str) -> str:
        if not PHONE_RE.match(v):
            raise ValueError(
                "Телефон должен быть в международном формате, например +79991234567"
            )
        return v

    @field_validator("message")
    @classmethod
    def message_limit(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if len(s) > 2000:
            raise ValueError("Сообщение слишком длинное (максимум 2000 символов)")
        return s or None

    @field_validator("source")
    @classmethod
    def source_limit(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()[:100]
        return s or None

    @field_validator("consent_personal_data")
    @classmethod
    def consent_required(cls, v: bool) -> bool:
        if not v:
            raise ValueError(
                "Требуется согласие на обработку персональных данных"
            )
        return v


class LeadCreateResponse(BaseModel):
    """Ответ публичного эндпоинта: id заявки и краткий статус интеграций."""

    id: str
    integrations: dict[str, str]


class LeadOut(BaseModel):
    id: str
    name: str
    phone: str
    email: Optional[str]
    message: Optional[str]
    source: Optional[str]
    consent_personal_data: bool
    status: str
    sheets_appended_at: Optional[str]
    telegram_sent_at: Optional[str]
    last_integration_error: Optional[str]
    created_at: str


class LeadUpdate(BaseModel):
    status: Optional[LeadStatus] = None
