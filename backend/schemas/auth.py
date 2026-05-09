from pydantic import BaseModel, field_validator
from schemas.common import CrmEmail


class LoginRequest(BaseModel):
    email: CrmEmail
    password: str


class RegisterRequest(BaseModel):
    full_name: str
    email: CrmEmail
    password: str

    @field_validator("full_name")
    @classmethod
    def full_name_strip_non_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Full name must not be empty")
        return s

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
