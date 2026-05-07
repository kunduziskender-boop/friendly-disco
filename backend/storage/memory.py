"""
In-memory storage. All data lives in the `db` dict for the lifetime of the process.
Seeded with one user per role for development convenience.
"""
from datetime import datetime, timezone
from itertools import count
from core.security import hash_password


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_counters: dict[str, count] = {}  # type: ignore[type-arg]


def _make_id(prefix: str, _store: dict) -> str:
    if prefix not in _counters:
        _counters[prefix] = count(1)
    return f"{prefix}_{next(_counters[prefix])}"


db: dict = {
    "users": {},
    "clients": {},
    "cases": {},
    "tasks": {},
    "calendar_events": {},
    "documents": {},
    "finance_records": {},
}

# ── seed users ──────────────────────────────────────────────────────────────
_seed_users = [
    {"id": "user_1", "full_name": "Admin",     "email": "admin@example.com",     "role": "admin",     "password": "Admin1234"},
    {"id": "user_2", "full_name": "Lawyer",    "email": "lawyer@example.com",    "role": "lawyer",    "password": "Lawyer1234"},
    {"id": "user_3", "full_name": "Assistant", "email": "assistant@example.com", "role": "assistant", "password": "Assist1234"},
]

for _u in _seed_users:
    db["users"][_u["id"]] = {
        "id":            _u["id"],
        "full_name":     _u["full_name"],
        "email":         _u["email"],
        "role":          _u["role"],
        "password_hash": hash_password(_u["password"]),
        "is_active":     True,
        "created_at":    _now(),
    }
