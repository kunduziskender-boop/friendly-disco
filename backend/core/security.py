from datetime import datetime, timedelta, timezone
from typing import Optional
import os
import bcrypt

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt


def _load_secret_key() -> str:
    key = os.getenv("SECRET_KEY", "").strip()
    if key:
        return key
    raise RuntimeError(
        "SECRET_KEY is not set. Copy backend/.env.example to backend/.env "
        "and set a long random SECRET_KEY (JWT signing)."
    )


SECRET_KEY = _load_secret_key()
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def try_decode_token(token: str) -> dict | None:
    """Return JWT payload or None if invalid/expired."""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    payload = try_decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Could not validate credentials"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def get_current_user(token: str = Depends(oauth2_scheme)):
    from storage.database import get_db, row_to_dict

    payload = decode_token(token)
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail={"code": "INVALID_TOKEN", "message": "Invalid token payload"})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    user = row_to_dict(row)
    if user is None or not user["is_active"]:
        raise HTTPException(status_code=401, detail={"code": "USER_NOT_FOUND", "message": "User not found or inactive"})
    return user
