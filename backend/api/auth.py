from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse

from schemas.auth import LoginRequest, TokenResponse
from core.security import (
    verify_password,
    create_access_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from storage.memory import db

router = APIRouter()


@router.post("/login", response_model=TokenResponse, summary="Login with email and password")
def login(body: LoginRequest):
    user = next(
        (u for u in db["users"].values() if u["email"] == body.email),
        None,
    )
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=401,
            detail={"code": "AUTH_FAILED", "message": "Invalid email or password"},
        )
    if not user["is_active"]:
        raise HTTPException(
            status_code=403,
            detail={"code": "USER_INACTIVE", "message": "Account is deactivated"},
        )
    token = create_access_token({"sub": user["id"], "role": user["role"]})
    return TokenResponse(
        access_token=token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", summary="Get current authenticated user")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "id":         current_user["id"],
        "full_name":  current_user["full_name"],
        "email":      current_user["email"],
        "role":       current_user["role"],
        "is_active":  current_user["is_active"],
        "created_at": current_user["created_at"],
    }
