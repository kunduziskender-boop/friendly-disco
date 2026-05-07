from pydantic import BaseModel
from schemas.common import CrmEmail


class LoginRequest(BaseModel):
    email: CrmEmail
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
