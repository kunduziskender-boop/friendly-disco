import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query

from schemas.tasks import TaskCreate, TaskUpdate, TaskOut, TaskStatus
from core.rbac import require_role
from core.row_access import assistant_task_sql_scope, ensure_assistant_case, ensure_assistant_task_row
from storage.database import get_db, row_to_dict, _now

router = APIRouter()


@router.post("", response_model=TaskOut, status_code=201, summary="Create task")
def create_task(
    body: TaskCreate,
    current_user: dict = Depends(require_role("tasks", "create")),
):
    with get_db() as conn:
        if body.case_id and not conn.execute(
            "SELECT 1 FROM legal_cases WHERE id = ?", (body.case_id,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_REFERENCE", "message": f"Case '{body.case_id}' not found"},
            )
        if body.case_id:
            ensure_assistant_case(conn, body.case_id, current_user)
        if body.assignee_user_id and not conn.execute(
            "SELECT 1 FROM users WHERE id = ? AND is_active = 1", (body.assignee_user_id,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "INVALID_REFERENCE",
                    "message": f"User '{body.assignee_user_id}' not found or inactive",
                },
            )
        tid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO tasks"
            " (id,title,description,due_date,status,priority,case_id,assignee_user_id,created_by,created_at,completed_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (tid, body.title, body.description, body.due_date.isoformat(),
             body.status.value, body.priority.value,
             body.case_id, body.assignee_user_id, current_user["id"], _now(), None),
        )
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
    return row_to_dict(row)


@router.get("", response_model=list[TaskOut], summary="List tasks")
def list_tasks(
    status: Optional[TaskStatus] = Query(None),
    case_id: Optional[str] = None,
    assignee_user_id: Optional[str] = None,
    current_user: dict = Depends(require_role("tasks", "read")),
):
    query = "SELECT * FROM tasks WHERE 1=1"
    params: list = []
    if current_user["role"] == "assistant":
        scope, plist = assistant_task_sql_scope(current_user["id"])
        query += f" AND {scope}"
        params.extend(plist)

    if status:
        query += " AND status = ?"
        params.append(status.value)
    if case_id:
        query += " AND case_id = ?"
        params.append(case_id)
    if assignee_user_id:
        query += " AND assignee_user_id = ?"
        params.append(assignee_user_id)
    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [row_to_dict(r) for r in rows]


@router.get("/{task_id}", response_model=TaskOut, summary="Get task by id")
def get_task(
    task_id: str,
    current_user: dict = Depends(require_role("tasks", "read")),
):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Task not found"})
        ensure_assistant_task_row(conn, row, current_user)
        return row_to_dict(row)


@router.patch("/{task_id}", response_model=TaskOut, summary="Update task")
def update_task(
    task_id: str,
    body: TaskUpdate,
    current_user: dict = Depends(require_role("tasks", "update")),
):
    with get_db() as conn:
        row0 = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row0:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Task not found"})
        ensure_assistant_task_row(conn, row0, current_user)
        data = body.model_dump(mode="json", exclude_none=True)
        aid = data.get("assignee_user_id")
        if aid is not None and not conn.execute(
            "SELECT 1 FROM users WHERE id = ? AND is_active = 1", (aid,)
        ).fetchone():
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_REFERENCE", "message": f"User '{aid}' not found or inactive"},
            )
        if data:
            sets = ", ".join(f"{k} = ?" for k in data)
            conn.execute(f"UPDATE tasks SET {sets} WHERE id = ?", (*data.values(), task_id))
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return row_to_dict(row)


@router.delete("/{task_id}", status_code=204, summary="Delete task")
def delete_task(
    task_id: str,
    current_user: dict = Depends(require_role("tasks", "delete")),
):
    with get_db() as conn:
        row0 = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row0:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Task not found"})
        ensure_assistant_task_row(conn, row0, current_user)
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
