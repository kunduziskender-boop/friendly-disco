from fastapi import HTTPException, status


# Matrix: resource -> operation -> allowed roles
RBAC: dict[str, dict[str, list[str]]] = {
    "users": {
        "create": ["admin"],
        "read":   ["admin", "lawyer", "assistant"],
        "update": ["admin", "lawyer", "assistant"],
        "delete": ["admin"],
    },
    "clients": {
        "create": ["admin", "lawyer", "assistant"],
        "read":   ["admin", "lawyer", "assistant"],
        "update": ["admin", "lawyer", "assistant"],
        "delete": ["admin", "lawyer"],
    },
    "cases": {
        "create": ["admin", "lawyer"],
        "read":   ["admin", "lawyer", "assistant"],
        "update": ["admin", "lawyer"],
        "delete": ["admin"],
    },
    "tasks": {
        "create": ["admin", "lawyer", "assistant"],
        "read":   ["admin", "lawyer", "assistant"],
        "update": ["admin", "lawyer", "assistant"],
        "delete": ["admin", "lawyer"],
    },
    "calendar_events": {
        "create": ["admin", "lawyer", "assistant"],
        "read":   ["admin", "lawyer", "assistant"],
        "update": ["admin", "lawyer", "assistant"],
        "delete": ["admin", "lawyer"],
    },
    "documents": {
        "create": ["admin", "lawyer", "assistant"],
        "read":   ["admin", "lawyer", "assistant"],
        "update": ["admin", "lawyer", "assistant"],
        "delete": ["admin", "lawyer"],
    },
    "finance_records": {
        "create": ["admin", "lawyer"],
        "read":   ["admin", "lawyer", "assistant"],
        "update": ["admin", "lawyer"],
        "delete": ["admin"],
    },
}


def require_role(resource: str, operation: str):
    """Returns a dependency that checks role access."""
    from core.security import get_current_user
    from fastapi import Depends

    def checker(current_user: dict = Depends(get_current_user)):
        allowed = RBAC.get(resource, {}).get(operation, [])
        if current_user["role"] not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN",
                    "message": f"Role '{current_user['role']}' cannot perform '{operation}' on '{resource}'",
                },
            )
        return current_user

    return checker
