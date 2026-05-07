from fastapi import APIRouter, HTTPException, Depends

from schemas.users import UserCreate, UserUpdate, UserOut
from core.rbac import require_role
from core.security import hash_password
from storage.memory import db, _now, _make_id

router = APIRouter()


@router.post("", response_model=UserOut, status_code=201, summary="Create user (admin only)")
def create_user(
    body: UserCreate,
    current_user: dict = Depends(require_role("users", "create")),
):
    if any(u["email"] == body.email for u in db["users"].values()):
        raise HTTPException(
            status_code=409,
            detail={"code": "EMAIL_TAKEN", "message": "Email already registered"},
        )
    uid = _make_id("user", db["users"])
    record = {
        "id":            uid,
        "full_name":     body.full_name,
        "email":         body.email,
        "role":          body.role,
        "password_hash": hash_password(body.password),
        "is_active":     True,
        "created_at":    _now(),
    }
    db["users"][uid] = record
    return record


@router.get("", response_model=list[UserOut], summary="List all users (admin only)")
def list_users(current_user: dict = Depends(require_role("users", "read"))):
    if current_user["role"] != "admin":
        return [current_user]
    return list(db["users"].values())


@router.get("/{user_id}", response_model=UserOut, summary="Get user by id")
def get_user(
    user_id: str,
    current_user: dict = Depends(require_role("users", "read")),
):
    if current_user["role"] != "admin" and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})
    user = db["users"].get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "User not found"})
    return user


@router.patch("/{user_id}", response_model=UserOut, summary="Update user")
def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: dict = Depends(require_role("users", "update")),
):
    if current_user["role"] != "admin" and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})
    user = db["users"].get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "User not found"})
    data = body.model_dump(exclude_none=True)
    if "password" in data:
        user["password_hash"] = hash_password(data.pop("password"))
    user.update(data)
    return user


@router.delete("/{user_id}", status_code=204, summary="Deactivate user (admin only)")
def delete_user(
    user_id: str,
    current_user: dict = Depends(require_role("users", "delete")),
):
    user = db["users"].get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "User not found"})
    user["is_active"] = False
