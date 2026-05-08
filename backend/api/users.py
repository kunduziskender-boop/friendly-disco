import uuid

from fastapi import APIRouter, HTTPException, Depends

from schemas.users import UserCreate, UserUpdate, UserOut
from core.rbac import require_role
from core.security import hash_password
from storage.database import get_db, row_to_dict, _now

router = APIRouter()


@router.post("", response_model=UserOut, status_code=201, summary="Create user (admin only)")
def create_user(
    body: UserCreate,
    current_user: dict = Depends(require_role("users", "create")),
):
    with get_db() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (body.email,)).fetchone():
            raise HTTPException(
                status_code=409,
                detail={"code": "EMAIL_TAKEN", "message": "Email already registered"},
            )
        uid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO users (id,full_name,email,password_hash,role,is_active,created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (uid, body.full_name, body.email, hash_password(body.password), body.role, 1, _now()),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return row_to_dict(row)


@router.get("", response_model=list[UserOut], summary="List all users (admin only)")
def list_users(current_user: dict = Depends(require_role("users", "read"))):
    with get_db() as conn:
        if current_user["role"] != "admin":
            rows = conn.execute("SELECT * FROM users WHERE id = ?", (current_user["id"],)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM users").fetchall()
    return [row_to_dict(r) for r in rows]


@router.get("/{user_id}", response_model=UserOut, summary="Get user by id")
def get_user(
    user_id: str,
    current_user: dict = Depends(require_role("users", "read")),
):
    if current_user["role"] != "admin" and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "User not found"})
    return row_to_dict(row)


@router.patch("/{user_id}", response_model=UserOut, summary="Update user")
def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: dict = Depends(require_role("users", "update")),
):
    if current_user["role"] != "admin" and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "Access denied"})
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "User not found"})
        data = body.model_dump(mode="json", exclude_none=True)
        if "password" in data:
            data["password_hash"] = hash_password(data.pop("password"))
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE users SET {sets} WHERE id = ?", (*data.values(), user_id))
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return row_to_dict(row)


@router.delete("/{user_id}", status_code=204, summary="Deactivate user (admin only)")
def delete_user(
    user_id: str,
    current_user: dict = Depends(require_role("users", "delete")),
):
    with get_db() as conn:
        if not conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone():
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "User not found"})
        conn.execute("UPDATE users SET is_active = 0 WHERE id = ?", (user_id,))
