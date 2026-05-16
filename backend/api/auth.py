import logging
import uuid

from fastapi import APIRouter, HTTPException, Depends, Request

from schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from schemas.users import UserRole
from core.rate_limit import limiter, AUTH_LOGIN_RATE_LIMIT, AUTH_REGISTER_RATE_LIMIT
from core.security import (
    verify_password,
    hash_password,
    create_access_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from storage.database import get_db, row_to_dict, _now
from core.logging_setup import emit_json_event, get_logger

router = APIRouter()

_business = get_logger("crm.business")


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    summary="Register a new user (role: assistant)",
)
@limiter.limit(AUTH_REGISTER_RATE_LIMIT)
def register(request: Request, body: RegisterRequest):
    """Self-registration; role is always `assistant`. Admins promote via `/users`."""
    with get_db() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (str(body.email),)).fetchone():
            raise HTTPException(
                status_code=409,
                detail={"code": "EMAIL_TAKEN", "message": "Email already registered"},
            )
        uid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO users (id,full_name,email,password_hash,role,is_active,created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (
                uid,
                body.full_name.strip(),
                str(body.email),
                hash_password(body.password),
                UserRole.assistant.value,
                1,
                _now(),
            ),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    user = row_to_dict(row)
    token = create_access_token({"sub": user["id"], "role": user["role"]})
    emit_json_event(
        _business,
        logging.INFO,
        event="user_registered",
        user_id=uid,
        role=user["role"],
    )
    return TokenResponse(
        access_token=token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/login", response_model=TokenResponse, summary="Login with email and password")
@limiter.limit(AUTH_LOGIN_RATE_LIMIT)
def login(request: Request, body: LoginRequest):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (body.email,)).fetchone()
    user = row_to_dict(row)
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
    emit_json_event(
        _business,
        logging.INFO,
        event="user_logged_in",
        user_id=user["id"],
        role=user["role"],
    )
    return TokenResponse(
        access_token=token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", summary="Get current authenticated user")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "full_name": current_user["full_name"],
        "email": current_user["email"],
        "role": current_user["role"],
        "is_active": current_user["is_active"],
        "created_at": current_user["created_at"],
    }
